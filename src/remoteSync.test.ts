import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSyncCode,
  fetchSyncState,
  formatSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  pushSyncState,
} from './remoteSync'
import type { Counter } from './types'

const WORKER_URL = 'https://sync.example.workers.dev'

function makeCounter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'fixed-id',
    name: 'Compteur test',
    count: 5,
    createdAt: 1_700_000_000_000,
    behavior: {},
    appearance: { color: '#2563eb' },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('normalizeSyncCode', () => {
  it('met en majuscules', () => {
    expect(normalizeSyncCode('abcdefgh')).toBe('ABCDEFGH')
  })

  it('retire les tirets et espaces', () => {
    expect(normalizeSyncCode('  abcd-efgh  ')).toBe('ABCDEFGH')
  })
})

describe('isValidSyncCode', () => {
  it('accepte un code de 8 caractères valides', () => {
    expect(isValidSyncCode('ABCDEFGH')).toBe(true)
  })

  it('refuse une longueur incorrecte', () => {
    expect(isValidSyncCode('ABCDEFG')).toBe(false)
  })

  it("refuse un caractère hors de l'alphabet (ex: O ambigu)", () => {
    expect(isValidSyncCode('ABCDEFGO')).toBe(false)
  })
})

describe('formatSyncCode', () => {
  it('insère un espace au milieu pour la lecture', () => {
    expect(formatSyncCode('ABCDEFGH')).toBe('ABCD EFGH')
  })
})

describe('appels réseau', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('createSyncCode', () => {
    it('crée un nouveau code via POST', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ code: 'ABCDEFGH' }, 201))
      const code = await createSyncCode(WORKER_URL)
      expect(code).toBe('ABCDEFGH')
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync`, { method: 'POST' })
    })

    it('lève une erreur si la requête échoue', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow('Impossible de créer un code')
    })

    it('lève une erreur si la réponse est un JSON illisible', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('pas du json', { status: 201 }))
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow('illisible')
    })

    it("inclut le détail renvoyé par le worker quand la requête échoue (ex : exception interne)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: 'Erreur interne du serveur.', detail: "Cannot read properties of undefined" }, 500)
      )
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow(
        new Error('Impossible de créer un code de synchronisation. (Cannot read properties of undefined)')
      )
    })

    it("ignore un détail qui n'est pas une chaîne (ne l'ajoute pas au message)", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'Erreur interne du serveur.', detail: 42 }, 500))
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow(
        new Error('Impossible de créer un code de synchronisation.')
      )
    })
  })

  describe('fetchSyncState', () => {
    it('renvoie l\'état stocké', async () => {
      const state = { version: 42, counters: [makeCounter()] }
      vi.mocked(fetch).mockResolvedValue(jsonResponse(state))
      await expect(fetchSyncState(WORKER_URL, 'ABCDEFGH')).resolves.toEqual(state)
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync/ABCDEFGH`)
    })

    it("assainit les compteurs reçus : n'importe qui connaît le code de synchro peut avoir poussé un compteur malformé (pas d'authentification par appareil, voir worker/README.md), à ne jamais faire planter le rendu (ex: counter.count.toString() sans count)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ version: 1, counters: [{ id: 'x', name: 'Corrompu' }, 'pas-un-objet'] })
      )
      const result = await fetchSyncState(WORKER_URL, 'ABCDEFGH')
      expect(result?.counters).toHaveLength(1)
      expect(result?.counters[0]).toMatchObject({ id: 'x', name: 'Corrompu', count: 0 })
    })

    it("retombe sur version 0 si le corps ne renvoie pas une version numérique", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 'pas-un-nombre', counters: [] }))
      const result = await fetchSyncState(WORKER_URL, 'ABCDEFGH')
      expect(result?.version).toBe(0)
    })

    it('ne plante pas si le corps de la réponse est le littéral JSON `null`', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(null))
      const result = await fetchSyncState(WORKER_URL, 'ABCDEFGH')
      expect(result).toEqual({ version: 0, counters: [] })
    })

    it('renvoie null pour un code inconnu (404)', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))
      await expect(fetchSyncState(WORKER_URL, 'ABCDEFGH')).resolves.toBeNull()
    })

    it('lève une erreur pour tout autre statut en échec', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))
      await expect(fetchSyncState(WORKER_URL, 'ABCDEFGH')).rejects.toThrow('Impossible de récupérer')
    })

    it("garde le message générique si le corps JSON de l'erreur n'a pas de détail exploitable", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'Method not allowed' }, 405))
      await expect(fetchSyncState(WORKER_URL, 'ABCDEFGH')).rejects.toThrow(
        new Error('Impossible de récupérer les compteurs synchronisés.')
      )
    })
  })

  describe('pushSyncState', () => {
    it('envoie baseVersion/counters et confirme son acceptation', async () => {
      const push = { baseVersion: 3, counters: [makeCounter()] }
      const state = { version: 4, counters: push.counters }
      vi.mocked(fetch).mockResolvedValue(jsonResponse(state))
      const result = await pushSyncState(WORKER_URL, 'ABCDEFGH', push)
      expect(result).toEqual({ accepted: true, state })
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync/ABCDEFGH`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(push),
      })
    })

    it('signale un rejet (409) et renvoie la version serveur actuelle', async () => {
      const serverState = { version: 999, counters: [makeCounter({ name: 'Serveur' })] }
      vi.mocked(fetch).mockResolvedValue(jsonResponse(serverState, 409))
      const result = await pushSyncState(WORKER_URL, 'ABCDEFGH', { baseVersion: 1, counters: [] })
      expect(result).toEqual({ accepted: false, state: serverState })
    })

    it("assainit aussi l'état serveur renvoyé en cas de conflit (409) : il peut refléter ce qu'un autre appareil a poussé", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 5, counters: [{ id: 'y' }] }, 409))
      const result = await pushSyncState(WORKER_URL, 'ABCDEFGH', { baseVersion: 1, counters: [] })
      expect(result.accepted).toBe(false)
      expect(result.state.counters[0]).toMatchObject({ id: 'y', name: 'Sans nom', count: 0 })
    })

    it('lève une erreur pour tout autre statut en échec', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))
      await expect(pushSyncState(WORKER_URL, 'ABCDEFGH', { baseVersion: 1, counters: [] })).rejects.toThrow(
        'Impossible de synchroniser'
      )
    })
  })
})
