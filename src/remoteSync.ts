import { sanitizeSyncedCounters } from './sync'
import type { Counter } from './types'

// Même alphabet que worker/src/code.ts (dupliqué volontairement : l'app et
// le worker sont deux projets déployés séparément, sans étape de build
// partagée — ces quelques lignes ne valent pas la complexité d'un package
// commun).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789'
const CODE_LENGTH = 8

/** État renvoyé par le worker (GET/PUT) : `version` est un entier attribué
 * par le serveur, incrémenté à chaque écriture acceptée — jamais une horloge
 * (voir `PushRequest` pour pourquoi). */
export interface SyncState {
  version: number
  counters: Counter[]
}

/** Corps d'une requête PUT : `baseVersion` est la version que ce client
 * pensait être la version courante (dernière connue via un GET/PUT
 * précédent). Comparer des horodatages entre appareils suppose des horloges
 * synchronisées entre eux, ce qui n'est pas garanti — l'horloge d'un appareil
 * en retard suffit à faire rejeter à tort une poussée légitime, ou pire, à
 * faire accepter une poussée périmée comme si elle était la plus récente. Un
 * entier attribué par le serveur élimine ce risque : la comparaison
 * d'égalité stricte faite côté worker ne dépend d'aucune horloge cliente. */
export interface PushRequest {
  baseVersion: number
  counters: Counter[]
}

/** Met un code saisi à la main (espaces, tirets, minuscules) au format
 * canonique attendu par le worker. */
export function normalizeSyncCode(raw: string): string {
  // Un remplacement global retire déjà les espaces/tirets en tête et en
  // queue (`\s` couvre les mêmes blancs que `.trim()`) : un `.trim()`
  // préalable, ou un `+` pour absorber une suite en un seul remplacement,
  // n'apporteraient rien d'observable.
  return raw.toUpperCase().replace(/[\s-]/g, '')
}

/** Un code normalisé valide fait exactement 8 caractères de l'alphabet
 * autorisé par le worker (voir worker/src/code.ts). Validé côté client avant
 * l'appel réseau, pour un retour immédiat sur un code mal recopié. */
export function isValidSyncCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)
}

/** Présentation lisible d'un code (`XXXX XXXX`), pour l'affichage uniquement
 * — le stockage et les appels réseau utilisent toujours la forme compacte. */
export function formatSyncCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error('Réponse du serveur illisible.')
  }
}

/** Construit le message d'une requête en échec : ajoute le détail renvoyé
 * par le worker (voir `detail` dans sa réponse d'erreur générique — la seule
 * information de diagnostic disponible sur un appareil sans accès à la
 * console, ex : mobile) au message générique `fallback` quand il est
 * exploitable, sinon retombe silencieusement sur `fallback` seul (corps
 * vide ou illisible : la requête a par exemple échoué avant que le worker ne
 * réponde). */
async function errorMessageFor(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail) return `${fallback} (${body.detail})`
  } catch {
    // Pas de corps JSON exploitable : le message générique suffit.
  }
  return fallback
}

/** Demande un nouveau code de synchronisation au worker. */
export async function createSyncCode(workerUrl: string): Promise<string> {
  const response = await fetch(`${workerUrl}/api/sync`, { method: 'POST' })
  if (!response.ok) throw new Error(await errorMessageFor(response, 'Impossible de créer un code de synchronisation.'))
  const body = (await readJsonOrThrow(response)) as { code: string }
  return body.code
}

/** `counters` dans une réponse du worker n'est authentifié par aucun
 * appareil en particulier (voir `sanitizeSyncedCounters`, sync.ts) : le
 * worker ne vérifie que la forme du tableau, jamais celle de ses éléments,
 * donc n'importe qui connaît le code de synchro peut avoir poussé un
 * `Counter` malformé. Assainir ici, au point d'entrée réseau, garantit que
 * `SyncState.counters` est toujours un `Counter[]` exploitable pour tous les
 * appelants (useRemoteSync.ts), plutôt que de compter sur chacun d'eux pour
 * le faire. */
function toSyncState(body: unknown): SyncState {
  const raw = (body ?? {}) as { version?: unknown; counters?: unknown }
  return {
    version: typeof raw.version === 'number' ? raw.version : 0,
    counters: sanitizeSyncedCounters(raw.counters),
  }
}

/** Récupère l'état stocké pour un code. `null` si le code n'existe pas (ou
 * plus — voir l'expiration côté worker). */
export async function fetchSyncState(workerUrl: string, code: string): Promise<SyncState | null> {
  const response = await fetch(`${workerUrl}/api/sync/${code}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessageFor(response, 'Impossible de récupérer les compteurs synchronisés.'))
  return toSyncState(await readJsonOrThrow(response))
}

export interface PushResult {
  /** `false` si `baseVersion` ne correspondait plus à la version stockée
   * (un autre appareil a poussé entre-temps, voir l'écriture optimiste du
   * worker) : `state` porte alors la version actuelle du serveur, à adopter
   * localement plutôt que réessayer avec le même `baseVersion`. */
  accepted: boolean
  state: SyncState
}

/** Pousse l'état local vers le worker. */
export async function pushSyncState(workerUrl: string, code: string, push: PushRequest): Promise<PushResult> {
  const response = await fetch(`${workerUrl}/api/sync/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(push),
  })
  if (response.status === 409) return { accepted: false, state: toSyncState(await readJsonOrThrow(response)) }
  if (!response.ok) throw new Error(await errorMessageFor(response, 'Impossible de synchroniser les compteurs.'))
  return { accepted: true, state: toSyncState(await readJsonOrThrow(response)) }
}
