import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildShareUrl,
  decodeCountersFromParam,
  downloadBackup,
  encodeCountersToParam,
  parseBackupJson,
  sanitizeSyncedCounters,
} from './sync'
import type { Counter, CounterAppearance, CounterBehavior } from './types'

/** Générateur déterministe (même seed = même résultat) à forte entropie. */
function pseudoRandomString(seed: number, length: number): string {
  let s = ''
  let x = seed
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    s += String.fromCharCode(32 + (x % 95))
  }
  return s
}

type CounterOverrides = Partial<Omit<Counter, 'behavior' | 'appearance'>> &
  Partial<CounterBehavior> &
  Partial<CounterAppearance>

function makeCounter(overrides: CounterOverrides = {}): Counter {
  const { oddsDenominator, startDate, step, target, color, displayStyle, backgroundImageUrl, ...rest } = overrides
  return {
    id: 'fixed-id',
    name: 'Compteur test',
    count: 5,
    createdAt: 1_700_000_000_000,
    ...rest,
    behavior: { oddsDenominator, startDate, step, target },
    appearance: { color: color ?? '#2563eb', displayStyle, backgroundImageUrl },
  }
}

describe('downloadBackup', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.fn<() => void>>
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
  let lastAnchor: HTMLAnchorElement | null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22, 14, 5, 9))
    clickSpy = vi.fn()
    lastAnchor = null
    const originalCreateElement = document.createElement.bind(document)
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement
        anchor.click = clickSpy
        lastAnchor = anchor
      }
      return el
    })
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    createElementSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('crée un blob JSON contenant tous les compteurs', async () => {
    const counters = [makeCounter({ name: 'A' }), makeCounter({ name: 'B', id: 'id-2' })]
    downloadBackup(counters)

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json')
    const text = await blob.text()
    expect(JSON.parse(text)).toEqual(counters)
  })

  it('déclenche le téléchargement avec un nom de fichier daté et horodaté', () => {
    downloadBackup([makeCounter()])
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it("nomme le fichier avec la date et l'heure du jour (pour ne pas écraser une sauvegarde précédente le même jour)", () => {
    downloadBackup([makeCounter()])
    expect(lastAnchor?.download).toBe('PlusUn-sauvegarde-2026-08-22_14-05-09.json')
  })

  it('révoque l\'URL objet après le téléchargement', () => {
    downloadBackup([makeCounter()])
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('attache le lien au document avant de déclencher le téléchargement', () => {
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    downloadBackup([makeCounter()])
    expect(appendChildSpy).toHaveBeenCalledWith(lastAnchor)
    appendChildSpy.mockRestore()
  })

  it('retire le lien du document après le téléchargement', () => {
    downloadBackup([makeCounter()])
    expect(lastAnchor?.isConnected).toBe(false)
  })
})

describe('parseBackupJson', () => {
  it('retourne null pour un JSON invalide', () => {
    expect(parseBackupJson('{invalide')).toBeNull()
  })

  it('retourne null si le JSON ne représente pas un tableau', () => {
    expect(parseBackupJson('{"name":"x","count":1}')).toBeNull()
  })

  it('retourne null pour un tableau vide', () => {
    expect(parseBackupJson('[]')).toBeNull()
  })

  it('retourne null si aucun élément du tableau n\'est un compteur valide', () => {
    expect(parseBackupJson('[1, "x", null, {"foo":"bar"}]')).toBeNull()
  })

  it('filtre les éléments invalides et garde les compteurs valides', () => {
    const result = parseBackupJson(
      JSON.stringify([
        { name: 'Valide', count: 3 },
        { name: 'Sans count' },
        { count: 5 },
        null,
        42,
        'texte',
      ])
    )
    expect(result).toHaveLength(1)
    expect(result?.[0].name).toBe('Valide')
    expect(result?.[0].count).toBe(3)
  })

  it('régénère un id pour chaque compteur importé', () => {
    const result = parseBackupJson(JSON.stringify([{ id: 'ancien-id', name: 'A', count: 1 }]))
    expect(result?.[0].id).not.toBe('ancien-id')
    expect(result?.[0].id).toBeTruthy()
  })

  it('utilise un id de secours quand crypto.randomUUID est indisponible', () => {
    vi.stubGlobal('crypto', {})
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].id).toMatch(/^id-\d+-[0-9a-f]+$/)
    vi.unstubAllGlobals()
  })

  it('remplace un nom vide par "Sans nom"', () => {
    const result = parseBackupJson(JSON.stringify([{ name: '', count: 1 }]))
    expect(result?.[0].name).toBe('Sans nom')
  })

  it('conserve un nom non vide', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'Mon compteur', count: 1 }]))
    expect(result?.[0].name).toBe('Mon compteur')
  })

  it('conserve un count à 0', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 0 }]))
    expect(result?.[0].count).toBe(0)
  })

  it('conserve un count négatif', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: -7 }]))
    expect(result?.[0].count).toBe(-7)
  })

  it('applique une couleur par défaut si absente', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].appearance.color).toBe('#2563eb')
  })

  it('conserve la couleur fournie', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, color: '#16a34a' }]))
    expect(result?.[0].appearance.color).toBe('#16a34a')
  })

  it('applique createdAt = maintenant si absent ou invalide', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22))
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].createdAt).toBe(new Date(2026, 7, 22).getTime())
    vi.useRealTimers()
  })

  it('conserve createdAt fourni', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, createdAt: 123456 }]))
    expect(result?.[0].createdAt).toBe(123456)
  })

  it('conserve oddsDenominator et startDate optionnels', () => {
    const result = parseBackupJson(
      JSON.stringify([{ name: 'A', count: 1, oddsDenominator: 4096, startDate: '2026-08-01' }])
    )
    expect(result?.[0].behavior.oddsDenominator).toBe(4096)
    expect(result?.[0].behavior.startDate).toBe('2026-08-01')
  })

  it('laisse oddsDenominator et startDate indéfinis si absents', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].behavior.oddsDenominator).toBeUndefined()
    expect(result?.[0].behavior.startDate).toBeUndefined()
  })

  it('préfère behavior imbriqué à un champ à plat du même nom (format le plus récent gagne)', () => {
    const result = parseBackupJson(
      JSON.stringify([{ name: 'A', count: 1, step: 999, behavior: { step: 5 } }])
    )
    expect(result?.[0].behavior.step).toBe(5)
  })

  it('conserve backgroundImageUrl optionnel', () => {
    const result = parseBackupJson(
      JSON.stringify([{ name: 'A', count: 1, backgroundImageUrl: 'https://exemple.com/x.jpg' }])
    )
    expect(result?.[0].appearance.backgroundImageUrl).toBe('https://exemple.com/x.jpg')
  })

  it('laisse backgroundImageUrl indéfini si absent', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].appearance.backgroundImageUrl).toBeUndefined()
  })

  it("rejette un backgroundImageUrl qui n'est pas http(s) (ex: sauvegarde forgée à la main)", () => {
    const result = parseBackupJson(
      JSON.stringify([{ name: 'A', count: 1, backgroundImageUrl: 'javascript:alert(1)' }])
    )
    expect(result?.[0].appearance.backgroundImageUrl).toBeUndefined()
  })

  it('préfère appearance imbriqué à un champ à plat du même nom (format le plus récent gagne)', () => {
    const result = parseBackupJson(
      JSON.stringify([{ name: 'A', count: 1, color: '#000000', appearance: { color: '#16a34a' } }])
    )
    expect(result?.[0].appearance.color).toBe('#16a34a')
  })

  it('conserve step optionnel', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, step: 5 }]))
    expect(result?.[0].behavior.step).toBe(5)
  })

  it('laisse step indéfini si absent', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].behavior.step).toBeUndefined()
  })

  it('conserve displayStyle et target optionnels', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, displayStyle: 'segment7', target: 50 }]))
    expect(result?.[0].appearance.displayStyle).toBe('segment7')
    expect(result?.[0].behavior.target).toBe(50)
  })

  it('laisse displayStyle et target indéfinis si absents', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].appearance.displayStyle).toBeUndefined()
    expect(result?.[0].behavior.target).toBeUndefined()
  })

  it("laisse displayStyle indéfini s'il n'est pas une chaîne (payload corrompu)", () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, displayStyle: 42 }]))
    expect(result?.[0].appearance.displayStyle).toBeUndefined()
  })

  it('conserve archived optionnel', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, archived: true }]))
    expect(result?.[0].archived).toBe(true)
  })

  it('laisse archived indéfini si absent', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].archived).toBeUndefined()
  })

  it('conserve pinned optionnel', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, pinned: true }]))
    expect(result?.[0].pinned).toBe(true)
  })

  it('laisse pinned indéfini si absent', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].pinned).toBeUndefined()
  })

  it('conserve archivedAt optionnel', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, archivedAt: 123456 }]))
    expect(result?.[0].archivedAt).toBe(123456)
  })

  it('laisse archivedAt indéfini si absent', () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1 }]))
    expect(result?.[0].archivedAt).toBeUndefined()
  })

  it("laisse archivedAt indéfini s'il n'est pas un nombre (payload corrompu)", () => {
    const result = parseBackupJson(JSON.stringify([{ name: 'A', count: 1, archivedAt: 'hier' }]))
    expect(result?.[0].archivedAt).toBeUndefined()
  })
})

describe('sanitizeSyncedCounters', () => {
  // Contrairement à parseBackupJson/decodeCountersFromParam (données qu'on a
  // soi-même exportées ou reçues via un lien qu'on a choisi d'ouvrir), le
  // code de synchro n'authentifie aucun appareil en particulier : n'importe
  // qui le connaît a pu pousser n'importe quel JSON (voir
  // worker/src/index.ts, isValidPushRequest ne vérifie que la forme du
  // tableau). Ces tests vérifient qu'un compteur malformé reçu par ce canal
  // ne fait jamais planter le rendu (voir CounterBehaviorSettingsPanel.tsx,
  // `counter.count.toString()`, et date.ts, `Intl.DateTimeFormat.format` sur
  // un `Invalid Date`), au lieu de simplement filtrer comme parseBackupJson.

  it('retourne [] pour une valeur qui n\'est pas un tableau', () => {
    expect(sanitizeSyncedCounters('pas-un-tableau')).toEqual([])
    expect(sanitizeSyncedCounters(null)).toEqual([])
    expect(sanitizeSyncedCounters(undefined)).toEqual([])
    expect(sanitizeSyncedCounters({ 0: 'x' })).toEqual([])
  })

  it('retourne [] pour un tableau vide', () => {
    expect(sanitizeSyncedCounters([])).toEqual([])
  })

  it('ignore les éléments qui ne sont pas des objets', () => {
    const result = sanitizeSyncedCounters([null, 42, 'texte', { name: 'Valide', count: 1 }])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valide')
  })

  it('préserve un compteur déjà bien formé tel quel (id compris)', () => {
    const counter = makeCounter({ id: 'id-stable', name: 'Complet', count: 7 })
    const result = sanitizeSyncedCounters([counter])
    expect(result[0]).toEqual(counter)
  })

  it("préserve l'id fourni (contrairement à normalizeCounter, qui en régénère un)", () => {
    const result = sanitizeSyncedCounters([{ id: 'gardé', name: 'A', count: 1 }])
    expect(result[0].id).toBe('gardé')
  })

  it("génère un id de secours si absent ou vide (évite une clé React dupliquée/vide)", () => {
    const result = sanitizeSyncedCounters([{ name: 'A', count: 1 }, { id: '', name: 'B', count: 2 }])
    expect(result[0].id).toBeTruthy()
    expect(result[1].id).toBeTruthy()
  })

  it('retombe sur count=0 si absent ou non numérique (évite un `.toString()` sur undefined)', () => {
    const result = sanitizeSyncedCounters([
      { id: 'a', name: 'Sans count' },
      { id: 'b', name: 'Count texte', count: 'douze' },
      { id: 'c', name: 'Count NaN', count: NaN },
    ])
    expect(result.map((c) => c.count)).toEqual([0, 0, 0])
  })

  it('conserve un count à 0 ou négatif', () => {
    const result = sanitizeSyncedCounters([
      { id: 'a', name: 'Zéro', count: 0 },
      { id: 'b', name: 'Négatif', count: -3 },
    ])
    expect(result.map((c) => c.count)).toEqual([0, -3])
  })

  it('retombe sur "Sans nom" si le nom est absent ou non textuel', () => {
    const result = sanitizeSyncedCounters([{ id: 'a', count: 1 }, { id: 'b', name: 42, count: 1 }])
    expect(result.map((c) => c.name)).toEqual(['Sans nom', 'Sans nom'])
  })

  it('retombe sur Date.now() si createdAt est absent ou non numérique', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22))
    const result = sanitizeSyncedCounters([{ id: 'a', name: 'A', count: 1, createdAt: 'hier' }])
    expect(result[0].createdAt).toBe(new Date(2026, 7, 22).getTime())
    vi.useRealTimers()
  })

  it('ignore archived/pinned si ce ne sont pas des booléens', () => {
    const result = sanitizeSyncedCounters([{ id: 'a', name: 'A', count: 1, archived: 'oui', pinned: 1 }])
    expect(result[0].archived).toBeUndefined()
    expect(result[0].pinned).toBeUndefined()
  })

  it('préserve archived/pinned/archivedAt quand ce sont des valeurs valides', () => {
    const result = sanitizeSyncedCounters([
      { id: 'a', name: 'A', count: 1, archived: true, pinned: true, archivedAt: 1_700_000_000_000 },
    ])
    expect(result[0].archived).toBe(true)
    expect(result[0].pinned).toBe(true)
    expect(result[0].archivedAt).toBe(1_700_000_000_000)
  })

  it("ignore archivedAt s'il n'est pas un nombre fini", () => {
    const result = sanitizeSyncedCounters([
      { id: 'a', name: 'A', count: 1, archivedAt: 'hier' },
      { id: 'b', name: 'B', count: 1, archivedAt: Infinity },
    ])
    expect(result[0].archivedAt).toBeUndefined()
    expect(result[1].archivedAt).toBeUndefined()
  })

  it("rejette un startDate qui n'est pas une date réelle, même bien formé (évite le crash Intl.DateTimeFormat)", () => {
    const result = sanitizeSyncedCounters([{ id: 'a', name: 'A', count: 1, behavior: { startDate: '9999-99-99' } }])
    expect(result[0].behavior.startDate).toBeUndefined()
  })

  it("rejette un backgroundImageUrl qui n'est pas http(s)", () => {
    const result = sanitizeSyncedCounters([
      { id: 'a', name: 'A', count: 1, appearance: { backgroundImageUrl: 'javascript:alert(1)' } },
    ])
    expect(result[0].appearance.backgroundImageUrl).toBeUndefined()
  })
})

describe('encodeCountersToParam / decodeCountersFromParam', () => {
  it('fait un aller-retour fidèle avec un tableau vide', () => {
    const encoded = encodeCountersToParam([])
    expect(decodeCountersFromParam(encoded)).toEqual([])
  })

  it('fait un aller-retour fidèle avec tous les champs renseignés', () => {
    const counters = [
      makeCounter({
        name: 'Complet',
        count: 42,
        oddsDenominator: 4096,
        startDate: '2026-08-01',
        backgroundImageUrl: 'https://exemple.com/fond.jpg',
        step: 5,
        displayStyle: 'segment7',
        target: 100,
        archived: true,
        pinned: true,
        archivedAt: 1_700_100_000_000,
      }),
    ]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded).toHaveLength(1)
    expect(decoded?.[0]).toMatchObject({
      name: 'Complet',
      count: 42,
      createdAt: counters[0].createdAt,
      behavior: {
        oddsDenominator: 4096,
        startDate: '2026-08-01',
        step: 5,
        target: 100,
      },
      appearance: {
        color: counters[0].appearance.color,
        backgroundImageUrl: 'https://exemple.com/fond.jpg',
        displayStyle: 'segment7',
      },
      archived: true,
      pinned: true,
      archivedAt: 1_700_100_000_000,
    })
  })

  it('omet les champs optionnels absents lors de l\'aller-retour', () => {
    const counters = [
      makeCounter({
        oddsDenominator: undefined,
        startDate: undefined,
        backgroundImageUrl: undefined,
        step: undefined,
        displayStyle: undefined,
        target: undefined,
        archived: undefined,
        pinned: undefined,
        archivedAt: undefined,
      }),
    ]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].behavior.oddsDenominator).toBeUndefined()
    expect(decoded?.[0].behavior.startDate).toBeUndefined()
    expect(decoded?.[0].appearance.backgroundImageUrl).toBeUndefined()
    expect(decoded?.[0].behavior.step).toBeUndefined()
    expect(decoded?.[0].appearance.displayStyle).toBeUndefined()
    expect(decoded?.[0].behavior.target).toBeUndefined()
    expect(decoded?.[0].archived).toBeUndefined()
    expect(decoded?.[0].pinned).toBeUndefined()
    expect(decoded?.[0].archivedAt).toBeUndefined()
  })

  it('omet archived=false du lien compact (comme les autres champs falsy)', () => {
    const counters = [makeCounter({ archived: false })]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].archived).toBeUndefined()
  })

  it('omet pinned=false du lien compact (comme les autres champs falsy)', () => {
    const counters = [makeCounter({ pinned: false })]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].pinned).toBeUndefined()
  })

  it('omet archivedAt=0 du lien compact (comme les autres champs falsy)', () => {
    const counters = [makeCounter({ archivedAt: 0 })]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].archivedAt).toBeUndefined()
  })

  it('applique count=0 si le champ "c" décodé n\'est pas un nombre (payload corrompu)', () => {
    // Contrairement à parseBackupJson (qui filtre via isValidCounter), le
    // chemin lien/QR ne valide pas le type de "c" avant de le passer à
    // normalizeCounter : c'est le seul chemin qui exerce réellement le
    // fallback `typeof raw.count === 'number' ? raw.count : 0`.
    const corrupted = btoa(JSON.stringify([{ n: 'Corrompu', c: 'pas-un-nombre', k: '#000', t: 1 }]))
    const decoded = decodeCountersFromParam(corrupted)
    expect(decoded?.[0].count).toBe(0)
  })

  it('préserve les caractères spéciaux (accents, emoji) dans le nom', () => {
    const counters = [makeCounter({ name: 'Écrémé 🎲 été – café' })]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].name).toBe('Écrémé 🎲 été – café')
  })

  it('se décode fidèlement même quand la sortie lz-string contient des caractères réservés dans une URL (+, $)', () => {
    // L'alphabet "URI safe" de lz-string inclut +, - et $ (jamais / ni =) :
    // ce ne sont pas des caractères valides tels quels dans une URL, mais
    // buildShareUrl les neutralise correctement via URLSearchParams (qui les
    // encode en %2B/%24 à la construction du lien, et les décode à
    // l'identique) — donc pas de substitution manuelle nécessaire ici,
    // contrairement à l'ancien schéma base64 fait main.
    let sawReservedChar = false
    for (let i = 0; i < 30; i++) {
      const name = pseudoRandomString(i + 1, 40)
      const encoded = encodeCountersToParam([makeCounter({ name })])
      if (/[+$]/.test(encoded)) sawReservedChar = true
      expect(decodeCountersFromParam(encoded)?.[0].name).toBe(name)
    }
    // Garantit que le test exerce bien le cas qui nous intéresse (sinon il
    // passerait trivialement même avec un aller-retour cassé sur ces
    // caractères).
    expect(sawReservedChar).toBe(true)
  })

  it('produit un lien nettement plus court que du base64 brut avec beaucoup de compteurs', () => {
    // Motive le passage à lz-string : un JSON de compteurs répète beaucoup
    // les mêmes clés/valeurs (couleur par défaut, styles...), qui se
    // compressent très bien — le lien de partage devient impraticable
    // (trop long à coller, QR illisible) sans cette compression au-delà de
    // quelques compteurs.
    const counters = Array.from({ length: 30 }, (_, i) => makeCounter({ name: `Compteur ${i}`, count: i }))
    const encoded = encodeCountersToParam(counters)
    const naiveBase64Length = btoa(unescape(encodeURIComponent(JSON.stringify(counters)))).length
    expect(encoded.length).toBeLessThan(naiveBase64Length * 0.6)
  })

  it('décode un lien legacy (base64 fait main, avant lz-string) dont le base64 brut contient +/-', () => {
    // Réplique l'ancien schéma d'encodage (base64 url-safe fait main,
    // remplacé depuis par lz-string) pour vérifier que decodeCountersFromParam
    // sait toujours le lire : les substitutions - -> + et _ -> / faites par
    // decodeLegacyParam doivent être correctement inversées, sinon atob()
    // échoue sur un base64 invalide. Contenu à forte entropie : garantit de
    // générer, dans le base64 brut, des caractères + et / (donc - et _ une
    // fois substitués) qui exercent vraiment cette logique.
    const legacyEncode = (json: string): string => {
      const bytes = new TextEncoder().encode(json)
      let binary = ''
      bytes.forEach((b) => (binary += String.fromCharCode(b)))
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+/, '')
    }

    let sawDashOrUnderscore = false
    for (let i = 0; i < 30; i++) {
      const name = pseudoRandomString(i + 1, 40)
      const json = JSON.stringify([{ n: name, c: 1, k: '#2563eb', t: 1_700_000_000_000 }])
      const legacyParam = legacyEncode(json)
      if (/[-_]/.test(legacyParam)) sawDashOrUnderscore = true
      expect(decodeCountersFromParam(legacyParam)?.[0].name).toBe(name)
    }
    // Garantit que le test exerce bien le cas qui nous intéresse (sinon il
    // passerait trivialement même avec une substitution inverse cassée).
    expect(sawDashOrUnderscore).toBe(true)
  })

  it('régénère un id à chaque décodage (les ids ne sont pas transmis)', () => {
    const counters = [makeCounter({ id: 'original' })]
    const encoded = encodeCountersToParam(counters)
    const decoded = decodeCountersFromParam(encoded)
    expect(decoded?.[0].id).not.toBe('original')
  })

  it('retourne null pour une chaîne invalide (base64/JSON corrompu)', () => {
    expect(decodeCountersFromParam('!!!pas-du-base64-valide???')).toBeNull()
  })

  it('retourne null si le contenu décodé n\'est pas un tableau', () => {
    const notAnArray = btoa(JSON.stringify({ n: 'x' }))
    expect(decodeCountersFromParam(notAnArray)).toBeNull()
  })
})

describe('buildShareUrl', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('ajoute le paramètre import encodant les compteurs', () => {
    window.history.pushState({}, '', '/app')
    const counters = [makeCounter({ name: 'Partagé' })]
    const url = new URL(buildShareUrl(counters))
    const param = url.searchParams.get('import')
    expect(param).toBe(encodeCountersToParam(counters))
  })

  it('retire le hash existant de l\'URL', () => {
    window.history.pushState({}, '', '/app#ancien-hash')
    const url = new URL(buildShareUrl([makeCounter()]))
    expect(url.hash).toBe('')
  })

  it('conserve le chemin existant de l\'URL', () => {
    window.history.pushState({}, '', '/mon-app/')
    const url = new URL(buildShareUrl([makeCounter()]))
    expect(url.pathname).toBe('/mon-app/')
  })
})
