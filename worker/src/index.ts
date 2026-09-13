import { generateSyncCode, isValidSyncCode, normalizeSyncCode } from './code'

export interface Env {
  SYNC_KV: KVNamespace
  ALLOWED_ORIGIN?: string
}

/** État stocké côté serveur (réponse GET/PUT) : `version` est un compteur
 * entier propre au serveur, incrémenté à chaque écriture acceptée. */
export interface SyncState {
  version: number
  counters: unknown[]
}

/** Corps d'une requête PUT : `baseVersion` est la version que le client
 * pensait être la version courante au moment de pousser (obtenue via un GET
 * ou un PUT précédent), jamais une horloge. Comparer des horodatages entre
 * appareils suppose des horloges synchronisées, ce qui n'est pas garanti (une
 * horloge en retard suffit à faire rejeter à tort des poussées légitimes, ou
 * pire, à faire accepter une poussée plus ancienne comme si elle était plus
 * récente) : la comparaison d'égalité stricte sur un entier attribué par le
 * serveur ne dépend d'aucune horloge cliente. */
export interface PushRequest {
  baseVersion: number
  counters: unknown[]
}

// Largement suffisant pour une liste de compteurs (même avec historique) ;
// borne la taille acceptée plutôt que de laisser un client remplir le KV
// sans limite.
const MAX_BODY_BYTES = 256 * 1024
// Un code inutilisé pendant 180 jours libère sa place plutôt que de rester
// indéfiniment dans le stockage.
const KV_TTL_SECONDS = 60 * 60 * 24 * 180

// Pas de limitation de débit ici (essayée puis retirée) : le plan gratuit de
// Cloudflare KV plafonne à 1000 écritures/jour pour tout le namespace, tous
// clients confondus. Un compteur par IP/fenêtre écrit en KV à chaque requête
// (même les lectures) épuise ce quota en quelques heures avec un seul
// appareil qui sonde toutes les 20s (voir useRemoteSync.ts) — bien avant
// qu'aucun abus n'ait eu lieu. Une fois le quota épuisé, même les écritures
// légitimes (créer/pousser) échouent, jusqu'à la réinitialisation à minuit
// UTC : pire que l'abus que ça visait à empêcher. Un vrai rate-limiting
// referait sens avec un Object Durable (pas provisionné dans ce projet), qui
// ne consomme pas ce quota.

export function kvKey(code: string): string {
  return `sync:${code}`
}

export function isValidPushRequest(value: unknown): value is PushRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.baseVersion === 'number' && Array.isArray(v.counters)
}

/** Ramène `ALLOWED_ORIGIN` à un schéma+hôte nu (jamais de chemin ni de slash
 * final) : c'est tout ce qu'un en-tête `Access-Control-Allow-Origin` accepte,
 * un navigateur rejette silencieusement toute valeur qui contient un chemin
 * (ex : collé depuis l'URL complète du site plutôt que juste son origine) —
 * bloquant alors *toutes* les requêtes vers le worker sans qu'aucune erreur
 * ne s'affiche côté app. Une valeur absente ou mal formée retombe sur '*'. */
function normalizedAllowedOrigin(env: Env): string {
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return '*'
  try {
    return new URL(env.ALLOWED_ORIGIN).origin
  } catch {
    return '*'
  }
}

function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': normalizedAllowedOrigin(env),
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(body: unknown, init: ResponseInit, env: Env): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(init.headers ?? {}) },
  })
}

// Collisions astronomiquement improbables (29^8 ≈ 500 milliards de
// combinaisons) : quelques essais suffisent largement à s'en prémunir sans
// jamais boucler longtemps.
const CREATE_ATTEMPTS = 5

async function handleCreate(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateSyncCode()
    const existing = await env.SYNC_KV.get(kvKey(code))
    if (existing !== null) continue
    // version 0 = « rien poussé encore » : le premier PUT doit fournir
    // baseVersion 0 pour réussir (voir handlePut).
    const state: SyncState = { version: 0, counters: [] }
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS })
    return json({ code }, { status: 201 }, env)
  }
  return json({ error: 'Impossible de générer un code, réessaie.' }, { status: 500 }, env)
}

async function handleGet(env: Env, code: string): Promise<Response> {
  const stored = await env.SYNC_KV.get(kvKey(code))
  if (stored === null) return json({ error: 'Code inconnu.' }, { status: 404 }, env)
  return json(JSON.parse(stored), { status: 200 }, env)
}

async function handlePut(request: Request, env: Env, code: string): Promise<Response> {
  // Lit le corps réel plutôt que de se fier à l'en-tête `Content-Length`
  // déclaré par le client : rien ne garantit qu'il corresponde à la taille
  // effectivement envoyée (en-tête absent ou mensonger, encodage chunked qui
  // s'en passe totalement) — un client pouvait ainsi contourner totalement
  // cette limite et faire stocker en KV un blob arbitrairement plus gros que
  // `MAX_BODY_BYTES`.
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Trop volumineux.' }, { status: 413 }, env)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return json({ error: 'JSON invalide.' }, { status: 400 }, env)
  }
  if (!isValidPushRequest(payload)) {
    return json({ error: 'Format invalide (baseVersion et counters requis).' }, { status: 400 }, env)
  }

  const existingRaw = await env.SYNC_KV.get(kvKey(code))
  const existing: SyncState | null = existingRaw ? JSON.parse(existingRaw) : null
  const currentVersion = existing?.version ?? 0

  // Écriture optimiste façon « compare-and-swap » : la poussée n'est acceptée
  // que si le client est bien parti de la dernière version connue du
  // serveur. Un entier attribué par le serveur (jamais une horloge cliente)
  // rend la comparaison fiable même si l'horloge d'un appareil dérive —
  // contrairement à un horodatage, un décalage d'horloge ne peut ni faire
  // rejeter à tort une poussée légitime, ni faire accepter une poussée
  // périmée comme si elle était la plus récente.
  if (payload.baseVersion !== currentVersion) {
    return json(existing ?? { version: 0, counters: [] }, { status: 409 }, env)
  }

  const next: SyncState = { version: currentVersion + 1, counters: payload.counters }
  await env.SYNC_KV.put(kvKey(code), JSON.stringify(next), { expirationTtl: KV_TTL_SECONDS })
  return json(next, { status: 200 }, env)
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[0] !== 'api' || segments[1] !== 'sync') {
    return json({ error: 'Not found' }, { status: 404 }, env)
  }

  if (segments.length === 2) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 }, env)
    return handleCreate(env)
  }

  if (segments.length === 3) {
    const code = normalizeSyncCode(segments[2])
    if (!isValidSyncCode(code)) return json({ error: 'Code invalide.' }, { status: 400 }, env)
    if (request.method === 'GET') return handleGet(env, code)
    if (request.method === 'PUT') return handlePut(request, env, code)
    return json({ error: 'Method not allowed' }, { status: 405 }, env)
  }

  return json({ error: 'Not found' }, { status: 404 }, env)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (err) {
      // Une exception non rattrapée ici (ex : liaison KV mal configurée)
      // laisserait le runtime Cloudflare renvoyer sa propre page d'erreur
      // générique (code 1101), sans les en-têtes CORS posés par `json()` —
      // un navigateur rejette alors la réponse comme une simple erreur
      // réseau côté client ("NetworkError"/"Failed to fetch"), sans aucun
      // détail exploitable. Répondre nous-mêmes garde les en-têtes CORS et
      // expose la vraie cause, seule information de diagnostic disponible
      // sur un appareil sans accès à la console (ex : mobile).
      return json(
        { error: 'Erreur interne du serveur.', detail: err instanceof Error ? err.message : String(err) },
        { status: 500 },
        env
      )
    }
  },
}
