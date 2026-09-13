import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { isValidPushRequest, kvKey, type Env } from './index'
import { generateSyncCode } from './code'

/** Implémentation en mémoire du sous-ensemble de KVNamespace utilisé par le
 * worker (get/put) : suffisant pour tester le routage et la logique sans
 * dépendre du runtime Cloudflare. */
function createMockKv() {
  const store = new Map<string, string>()
  return {
    store,
    get: (async (key: string) => store.get(key) ?? null) as KVNamespace['get'],
    put: (async (key: string, value: string) => {
      store.set(key, value)
    }) as KVNamespace['put'],
  } as unknown as KVNamespace
}

function makeEnv(): Env {
  return { SYNC_KV: createMockKv(), ALLOWED_ORIGIN: '*' }
}

function request(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = { method }
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    const json = JSON.stringify(body)
    init.body = json
    headers['Content-Type'] = 'application/json'
    headers['Content-Length'] = String(json.length)
  }
  init.headers = headers
  return new Request(`https://sync.example.com${path}`, init)
}

describe('isValidPushRequest', () => {
  it('accepte baseVersion numérique et counters tableau', () => {
    expect(isValidPushRequest({ baseVersion: 1, counters: [] })).toBe(true)
  })

  it('refuse une valeur qui n\'est pas un objet', () => {
    expect(isValidPushRequest('nope')).toBe(false)
  })

  it('refuse null', () => {
    expect(isValidPushRequest(null)).toBe(false)
  })

  it('refuse un baseVersion non numérique', () => {
    expect(isValidPushRequest({ baseVersion: '1', counters: [] })).toBe(false)
  })

  it("refuse counters qui n'est pas un tableau", () => {
    expect(isValidPushRequest({ baseVersion: 1, counters: {} })).toBe(false)
  })
})

describe('routage', () => {
  let env: Env

  beforeEach(() => {
    env = makeEnv()
  })

  it('répond au préflight CORS', async () => {
    const res = await worker.fetch(request('OPTIONS', '/api/sync'), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it("retombe sur '*' quand ALLOWED_ORIGIN n'est pas configuré", async () => {
    const bareEnv: Env = { SYNC_KV: env.SYNC_KV }
    const res = await worker.fetch(request('OPTIONS', '/api/sync'), bareEnv)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('ignore un chemin collé dans ALLOWED_ORIGIN (ne garde que schéma+hôte)', async () => {
    const withPath: Env = { SYNC_KV: env.SYNC_KV, ALLOWED_ORIGIN: 'https://exemple.github.io/mon-repo' }
    const res = await worker.fetch(request('OPTIONS', '/api/sync'), withPath)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://exemple.github.io')
  })

  it("retombe sur '*' quand ALLOWED_ORIGIN n'est pas une URL valide", async () => {
    const malformed: Env = { SYNC_KV: env.SYNC_KV, ALLOWED_ORIGIN: 'pas-une-url' }
    const res = await worker.fetch(request('OPTIONS', '/api/sync'), malformed)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('renvoie 404 hors du préfixe /api/sync', async () => {
    const res = await worker.fetch(request('GET', '/autre-chose'), env)
    expect(res.status).toBe(404)
  })

  it('renvoie 405 sur /api/sync avec une méthode autre que POST', async () => {
    const res = await worker.fetch(request('GET', '/api/sync'), env)
    expect(res.status).toBe(405)
  })

  it('renvoie 400 pour un code au mauvais format', async () => {
    const res = await worker.fetch(request('GET', '/api/sync/trop-court'), env)
    expect(res.status).toBe(400)
  })

  it('renvoie 405 sur /api/sync/:code avec une méthode autre que GET/PUT', async () => {
    const code = generateSyncCode()
    const res = await worker.fetch(request('DELETE', `/api/sync/${code}`), env)
    expect(res.status).toBe(405)
  })

  it('renvoie 404 pour un chemin plus profond que /api/sync/:code', async () => {
    const code = generateSyncCode()
    const res = await worker.fetch(request('GET', `/api/sync/${code}/extra`), env)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/sync (création)', () => {
  it('crée un nouveau code et le stocke avec un état vide, version 0', async () => {
    const env = makeEnv()
    const res = await worker.fetch(request('POST', '/api/sync'), env)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { code: string }
    expect(body.code).toHaveLength(8)

    const stored = await env.SYNC_KV.get(kvKey(body.code))
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual({ version: 0, counters: [] })
  })

  it('réessaie sur collision plutôt que de renvoyer un code déjà pris', async () => {
    const env = makeEnv()
    const occupied = 'A'.repeat(8)
    await env.SYNC_KV.put(kvKey(occupied), JSON.stringify({ version: 0, counters: [] }))

    // Un octet 0 (-> 'A', premier caractère de l'alphabet) forcé pour les 8
    // premiers appels (première tentative : code == 'AAAAAAAA', déjà occupé),
    // puis un octet différent par appel pour que la deuxième tentative
    // génère un code différent et réussisse.
    let calls = 0
    const getRandomValuesSpy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      calls++
      array[0] = calls <= 8 ? 0 : calls % 29
      return array
    }) as typeof crypto.getRandomValues)
    try {
      const res = await worker.fetch(request('POST', '/api/sync'), env)
      expect(res.status).toBe(201)
      const body = (await res.json()) as { code: string }
      expect(body.code).not.toBe(occupied)
      expect(calls).toBeGreaterThan(8)
    } finally {
      getRandomValuesSpy.mockRestore()
    }
  })

  it('renvoie 500 si aucun code libre trouvé après plusieurs essais', async () => {
    const env = makeEnv()
    // Toujours le même octet (-> toujours le même code) : toujours en collision.
    const getRandomValuesSpy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array[0] = 0
      return array
    }) as typeof crypto.getRandomValues)
    try {
      await env.SYNC_KV.put(kvKey('A'.repeat(8)), 'occupé')
      const res = await worker.fetch(request('POST', '/api/sync'), env)
      expect(res.status).toBe(500)
    } finally {
      getRandomValuesSpy.mockRestore()
    }
  })
})

describe('GET /api/sync/:code (lecture)', () => {
  it('renvoie 404 pour un code inconnu', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const res = await worker.fetch(request('GET', `/api/sync/${code}`), env)
    expect(res.status).toBe(404)
  })

  it('renvoie le contenu stocké pour un code existant', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const state = { version: 42, counters: [{ id: 'a' }] }
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(state))

    const res = await worker.fetch(request('GET', `/api/sync/${code}`), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(state)
  })

  it('normalise le code de la route (tirets, minuscules)', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const state = { version: 0, counters: [] }
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(state))

    const spacedOut = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase()
    const res = await worker.fetch(request('GET', `/api/sync/${spacedOut}`), env)
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/sync/:code (écriture)', () => {
  it("crée le blob si le code n'a encore rien stocké (baseVersion 0)", async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const push = { baseVersion: 0, counters: [{ id: 'a' }] }

    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, push), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 1, counters: push.counters })
  })

  it('accepte et incrémente la version quand baseVersion correspond à la version stockée', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    await env.SYNC_KV.put(kvKey(code), JSON.stringify({ version: 10, counters: [] }))

    const push = { baseVersion: 10, counters: [{ id: 'b' }] }
    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, push), env)
    expect(res.status).toBe(200)
    const expected = { version: 11, counters: push.counters }
    expect(await res.json()).toEqual(expected)
    expect(JSON.parse((await env.SYNC_KV.get(kvKey(code)))!)).toEqual(expected)
  })

  it('refuse (409) et renvoie la version serveur quand baseVersion est en retard', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const serverState = { version: 5, counters: [{ id: 'serveur' }] }
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(serverState))

    const stale = { baseVersion: 1, counters: [{ id: 'périmé' }] }
    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, stale), env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(serverState)
    // La tentative refusée ne doit pas avoir modifié le stockage.
    expect(JSON.parse((await env.SYNC_KV.get(kvKey(code)))!)).toEqual(serverState)
  })

  it('refuse (409) même quand baseVersion est en avance sur la version stockée', async () => {
    // Ne devrait normalement pas arriver (le client ne peut pas connaître une
    // version future), mais confirme que la comparaison est une égalité
    // stricte et non une simple borne inférieure.
    const env = makeEnv()
    const code = generateSyncCode()
    const serverState = { version: 5, counters: [] }
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(serverState))

    const ahead = { baseVersion: 6, counters: [{ id: 'x' }] }
    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, ahead), env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(serverState)
  })

  it("refuse (409) et renvoie un état par défaut quand le code n'a jamais rien stocké et que baseVersion n'est pas 0", async () => {
    // Cas distinct du premier test de ce bloc : là, aucune entrée KV
    // n'existe du tout pour ce code (`existing` est `null`), ce qui emprunte
    // une branche différente de calcul de la réponse 409 que lorsqu'un état
    // serveur existe déjà.
    const env = makeEnv()
    const code = generateSyncCode()

    const push = { baseVersion: 3, counters: [{ id: 'orphelin' }] }
    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, push), env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ version: 0, counters: [] })
    expect(await env.SYNC_KV.get(kvKey(code))).toBeNull()
  })

  it('renvoie 400 pour un JSON invalide', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const req = new Request(`https://sync.example.com/api/sync/${code}`, {
      method: 'PUT',
      body: '{ pas du json',
      headers: { 'Content-Length': '20' },
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('renvoie 400 pour un payload de forme invalide', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const res = await worker.fetch(request('PUT', `/api/sync/${code}`, { nope: true }), env)
    expect(res.status).toBe(400)
  })

  it("traite l'absence d'en-tête Content-Length comme une taille nulle (accepte le corps)", async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const push = { baseVersion: 0, counters: [] }
    const req = new Request(`https://sync.example.com/api/sync/${code}`, {
      method: 'PUT',
      body: JSON.stringify(push),
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
  })

  it('renvoie 413 pour un corps réellement trop volumineux', async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    // Compteurs bidon dont le JSON dépasse largement MAX_BODY_BYTES (256 Ko) :
    // vérifie la taille réelle du corps, pas un en-tête déclaré (voir le test
    // suivant, qui prouve que cet en-tête n'est justement pas fiable).
    const bigCounters = Array.from({ length: 5000 }, (_, i) => ({ id: `id-${i}`, name: 'x'.repeat(50), count: i }))
    const req = new Request(`https://sync.example.com/api/sync/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ baseVersion: 0, counters: bigCounters }),
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(413)
  })

  it("rejette un corps trop volumineux même avec un en-tête Content-Length mensonger (taille réelle vérifiée, pas l'en-tête déclaré)", async () => {
    const env = makeEnv()
    const code = generateSyncCode()
    const bigCounters = Array.from({ length: 5000 }, (_, i) => ({ id: `id-${i}`, name: 'x'.repeat(50), count: i }))
    const req = new Request(`https://sync.example.com/api/sync/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ baseVersion: 0, counters: bigCounters }),
      // En-tête délibérément mensonger (bien plus petit que le corps réel) :
      // avant la correction, seul cet en-tête était vérifié, laissant passer
      // n'importe quel corps tant qu'il annonçait une petite taille.
      headers: { 'Content-Length': '10' },
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(413)
  })
})

describe('exception non rattrapée (ex : liaison KV mal configurée)', () => {
  it('répond en JSON avec les en-têtes CORS plutôt que de laisser passer une page d\'erreur du runtime', async () => {
    // Sans ce filet, une exception ici laisserait le runtime Cloudflare
    // renvoyer sa propre page d'erreur générique (code 1101), sans en-tête
    // CORS : le navigateur la rejette côté client comme une simple erreur
    // réseau, sans qu'aucun détail n'atteigne jamais l'app.
    const brokenKv = {
      get: () => {
        throw new Error("Cannot read properties of undefined (reading 'get')")
      },
    } as unknown as KVNamespace
    const env: Env = { SYNC_KV: brokenKv, ALLOWED_ORIGIN: '*' }

    const res = await worker.fetch(request('GET', '/api/sync/ABCDEFGH'), env)

    expect(res.status).toBe(500)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await res.json()) as { error: string; detail: string }
    expect(body.error).toBe('Erreur interne du serveur.')
    expect(body.detail).toBe("Cannot read properties of undefined (reading 'get')")
  })

  it("retombe sur la représentation textuelle si l'exception n'est pas une Error", async () => {
    const brokenKv = {
      get: () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'panne KV'
      },
    } as unknown as KVNamespace
    const env: Env = { SYNC_KV: brokenKv, ALLOWED_ORIGIN: '*' }

    const res = await worker.fetch(request('GET', '/api/sync/ABCDEFGH'), env)

    expect(res.status).toBe(500)
    const body = (await res.json()) as { detail: string }
    expect(body.detail).toBe('panne KV')
  })
})
