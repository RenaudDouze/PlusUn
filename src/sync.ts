import * as LZString from 'lz-string'
import { makeId } from './id'
import { isValidImageUrl } from './url'
import { isValidIsoDate } from './date'
import { sanitizeCounterName } from './counterName'
import type { Counter, CounterAppearance, CounterBehavior, DisplayStyle } from './types'

/** Déclenche le téléchargement d'un blob sous le nom de fichier donné. */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Déclenche le téléchargement d'un fichier JSON contenant tous les compteurs. */
export function downloadBackup(counters: Counter[]) {
  const blob = new Blob([JSON.stringify(counters, null, 2)], { type: 'application/json' })
  // Horodatage complet (pas seulement la date) : plusieurs sauvegardes le même
  // jour ne s'écrasent plus entre elles dans le dossier de téléchargements.
  // Composants locaux (getFullYear/getHours...), pas toISOString() : celle-ci
  // convertit en UTC, décalant l'heure affichée par rapport à l'heure de
  // l'appareil. ':' n'est pas valide dans un nom de fichier sous Windows,
  // d'où le tiret.
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  triggerDownload(blob, `PlusUn-sauvegarde-${timestamp}.json`)
}

function isValidCounter(value: unknown): value is Record<string, unknown> {
  if (!value) return false
  const c = value as Record<string, unknown>
  return typeof c.name === 'string' && typeof c.count === 'number'
}

// Avant le regroupement des réglages en `behavior`/`appearance`, ces champs
// vivaient directement sur le compteur : une sauvegarde JSON exportée avant
// cette migration (ou un lien/QR généré par `toCompact`, toujours à plat)
// les présente donc sous cette forme. `readBehavior`/`readAppearance` lisent
// l'un ou l'autre format indifféremment, pour que l'import reste transparent
// quelle que soit l'origine des données.
/** Lit `raw[key]` s'il s'agit bien d'un objet imbriqué, sinon retombe sur
 * `raw` lui-même — factorise la lecture "imbriqué ou à plat" partagée par
 * `readBehavior`/`readAppearance` (voir leur commentaire ci-dessus). */
function readNestedOrFlat(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const nested = raw[key]
  return (nested && typeof nested === 'object' ? nested : raw) as Record<string, unknown>
}

function readBehavior(raw: Record<string, unknown>): CounterBehavior {
  const src = readNestedOrFlat(raw, 'behavior')
  return {
    oddsDenominator: typeof src.oddsDenominator === 'number' ? src.oddsDenominator : undefined,
    // `isValidIsoDate` en plus du simple typeof : une chaîne de la bonne
    // forme mais qui n'est pas une date réelle (voir sanitizeSyncedCounter
    // plus bas) atteindrait sinon `Intl.DateTimeFormat.format` (date.ts),
    // qui lève un `RangeError` sur un `Invalid Date` plutôt que d'afficher
    // une valeur incorrecte.
    startDate: typeof src.startDate === 'string' && isValidIsoDate(src.startDate) ? src.startDate : undefined,
    step: typeof src.step === 'number' ? src.step : undefined,
    target: typeof src.target === 'number' ? src.target : undefined,
  }
}

function readAppearance(raw: Record<string, unknown>): CounterAppearance {
  const src = readNestedOrFlat(raw, 'appearance')
  // Même validation que la saisie manuelle d'une image de fond (voir
  // CounterSettingsPanel.tsx) : sans elle, un lien de partage ou une
  // sauvegarde JSON forgés pourraient glisser une URL non http(s) (data:,
  // javascript:...) directement dans un `background-image` CSS, en
  // contournant complètement la validation appliquée à la saisie manuelle.
  const backgroundImageUrl = typeof src.backgroundImageUrl === 'string' ? src.backgroundImageUrl : undefined
  return {
    color: (typeof src.color === 'string' && src.color) || '#2563eb',
    displayStyle: typeof src.displayStyle === 'string' ? (src.displayStyle as DisplayStyle) : undefined,
    backgroundImageUrl: backgroundImageUrl && isValidImageUrl(backgroundImageUrl) ? backgroundImageUrl : undefined,
  }
}

/** Complète les champs manquants et régénère un id pour éviter les collisions. */
function normalizeCounter(raw: Record<string, unknown>): Counter {
  return {
    id: makeId(),
    name: (raw.name as string) || 'Sans nom',
    count: typeof raw.count === 'number' ? raw.count : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    archived: raw.archived as boolean | undefined,
    pinned: raw.pinned as boolean | undefined,
    archivedAt: typeof raw.archivedAt === 'number' ? raw.archivedAt : undefined,
    behavior: readBehavior(raw),
    appearance: readAppearance(raw),
  }
}

/** Reconstruit un compteur déjà stocké localement en s'assurant qu'il expose
 * bien `behavior`/`appearance` imbriqués — transparent pour un compteur déjà
 * à jour, migre silencieusement un compteur enregistré avant ce regroupement
 * (champs alors à plat). Contrairement à `normalizeCounter` (utilisée à
 * l'import d'une sauvegarde ou d'un lien), ne régénère pas l'id : il s'agit
 * du même compteur, pas d'une copie. */
export function migrateStoredCounter(raw: Record<string, unknown>): Counter {
  return {
    id: raw.id as string,
    name: raw.name as string,
    count: raw.count as number,
    createdAt: raw.createdAt as number,
    archived: raw.archived as boolean | undefined,
    pinned: raw.pinned as boolean | undefined,
    archivedAt: raw.archivedAt as number | undefined,
    behavior: readBehavior(raw),
    appearance: readAppearance(raw),
  }
}

/** Assainit un compteur reçu du worker de synchro (voir remoteSync.ts).
 * Contrairement à un import (sauvegarde JSON, lien de partage), cette donnée
 * n'est rattachée à aucun appareil en particulier : le code de synchro est un
 * secret partagé, pas une authentification par appareil (voir
 * worker/README.md) — n'importe qui le connaît peut avoir poussé n'importe
 * quel JSON (le worker ne vérifie que la forme du tableau `counters`, jamais
 * celle de ses éléments). Sans ce garde-fou, un champ manquant ou mal typé
 * (ex: `count` absent) plante au premier accès non protégé (ex:
 * `counter.count.toString()` dans CounterBehaviorSettingsPanel.tsx), et
 * comme ni CounterCard ni <main> n'ont leur propre ErrorBoundary, ça démonte
 * toute l'app pour l'appareil qui reçoit ce compteur.
 *
 * Contrairement à `normalizeCounter` (utilisée à l'import), préserve `id` :
 * le régénérer à chaque sondage (toutes les 20s, voir useRemoteSync.ts)
 * ferait réapparaître chaque carte comme un nouvel élément React (clé
 * `counter.id` dans App.tsx), remontant toute l'UI locale ouverte dessus. */
function sanitizeSyncedCounter(raw: Record<string, unknown>): Counter {
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : makeId(),
    name: typeof raw.name === 'string' ? sanitizeCounterName(raw.name) : 'Sans nom',
    count: typeof raw.count === 'number' && Number.isFinite(raw.count) ? raw.count : 0,
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    archived: typeof raw.archived === 'boolean' ? raw.archived : undefined,
    pinned: typeof raw.pinned === 'boolean' ? raw.pinned : undefined,
    archivedAt:
      typeof raw.archivedAt === 'number' && Number.isFinite(raw.archivedAt) ? raw.archivedAt : undefined,
    behavior: readBehavior(raw),
    appearance: readAppearance(raw),
  }
}

/** `counters` renvoyé par le worker n'est vérifié côté serveur que comme un
 * tableau (voir sanitizeSyncedCounter ci-dessus) : un élément qui n'est même
 * pas un objet est ignoré plutôt que de faire planter le `.map`. Toute valeur
 * qui n'est pas un tableau (payload complètement corrompu) retombe sur une
 * liste vide. */
export function sanitizeSyncedCounters(raw: unknown): Counter[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object').map(sanitizeSyncedCounter)
}

/** Parse un fichier JSON exporté. Retourne null si le contenu n'est pas valide. */
export function parseBackupJson(text: string): Counter[] | null {
  try {
    const data = JSON.parse(text)
    // Pas de vérification explicite Array.isArray : un `data` qui n'est pas
    // un tableau (objet, nombre...) fait échouer `.filter` juste en dessous,
    // ce qui est intercepté par le catch et retourne null tout de même.
    const valid = data.filter(isValidCounter)
    if (valid.length === 0) return null
    return valid.map(normalizeCounter)
  } catch {
    return null
  }
}

// Format compact utilisé pour le lien/QR code, pour limiter la taille encodée.
interface CompactCounter {
  n: string
  c: number
  k: string
  t: number
  d?: number
  s?: string
  i?: string
  p?: number
  y?: DisplayStyle
  g?: number
  a?: 1
  m?: 1
  e?: number
}

function toCompact(counter: Counter): CompactCounter {
  return {
    n: counter.name,
    c: counter.count,
    k: counter.appearance.color,
    t: counter.createdAt,
    ...(counter.behavior.oddsDenominator ? { d: counter.behavior.oddsDenominator } : {}),
    ...(counter.behavior.startDate ? { s: counter.behavior.startDate } : {}),
    ...(counter.appearance.backgroundImageUrl ? { i: counter.appearance.backgroundImageUrl } : {}),
    ...(counter.behavior.step ? { p: counter.behavior.step } : {}),
    ...(counter.appearance.displayStyle ? { y: counter.appearance.displayStyle } : {}),
    ...(counter.behavior.target ? { g: counter.behavior.target } : {}),
    ...(counter.archived ? { a: 1 } : {}),
    ...(counter.pinned ? { m: 1 } : {}),
    ...(counter.archivedAt ? { e: counter.archivedAt } : {}),
  }
}

function fromCompact(raw: CompactCounter): Counter {
  return normalizeCounter({
    name: raw.n,
    count: raw.c,
    color: raw.k,
    createdAt: raw.t,
    oddsDenominator: raw.d,
    startDate: raw.s,
    backgroundImageUrl: raw.i,
    step: raw.p,
    displayStyle: raw.y,
    target: raw.g,
    archived: raw.a === 1 ? true : undefined,
    pinned: raw.m === 1 ? true : undefined,
    archivedAt: raw.e,
  })
}

export function encodeCountersToParam(counters: Counter[]): string {
  const compact = counters.map(toCompact)
  const json = JSON.stringify(compact)
  // Compressé (lz-string) plutôt qu'un simple base64 : un JSON répète
  // beaucoup les mêmes clés et valeurs (couleur par défaut, styles...), ce
  // qui compresse bien et réduit nettement la taille du lien/QR partagé, en
  // particulier avec beaucoup de compteurs.
  return LZString.compressToEncodedURIComponent(json)
}

/** Décode un JSON compact déjà extrait (compressé ou legacy) : `null` si le
 * paramètre est manquant, invalide, ou ne correspond pas à un tableau de
 * compteurs. */
function parseCompactJson(json: string | null | undefined): Counter[] | null {
  if (!json) return null
  try {
    const compact = JSON.parse(json) as CompactCounter[]
    // Idem : un `compact` qui n'est pas un tableau fait échouer `.map`,
    // intercepté par le catch ci-dessous (retourne null dans les deux cas).
    return compact.map(fromCompact)
  } catch {
    return null
  }
}

/** Décode un lien généré avant l'introduction de la compression lz-string
 * (base64 URL-safe d'un JSON brut, non compressé). */
function decodeLegacyParam(param: string): string | null {
  try {
    const base64 = param.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function decodeCountersFromParam(param: string): Counter[] | null {
  return parseCompactJson(LZString.decompressFromEncodedURIComponent(param)) ?? parseCompactJson(decodeLegacyParam(param))
}

export function buildShareUrl(counters: Counter[]): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.set('import', encodeCountersToParam(counters))
  return url.toString()
}
