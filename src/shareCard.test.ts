import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Counter } from './types'
import { buildShareCardSvg, counterShareImageBlob } from './shareCard'

function makeCounter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'c1',
    name: 'Pompes',
    count: 42,
    createdAt: 0,
    behavior: {},
    appearance: { color: '#ff6600' },
    ...overrides,
  }
}

describe('buildShareCardSvg', () => {
  it('inclut le nom, la couleur et la valeur formatée, centrés horizontalement', () => {
    const svg = buildShareCardSvg(makeCounter({ name: 'Pompes', count: 1234, appearance: { color: '#ff6600' } }))
    expect(svg).toContain('#ff6600')
    expect(svg).toContain('x="320" y="120"')
    expect(svg).toContain('>Pompes</text>')
    expect(svg).toContain('x="320" y="330"')
    expect(svg).toContain(`>${(1234).toLocaleString('fr-FR')}</text>`)
  })

  it("ne laisse aucun contenu entre la valeur et le pied de carte quand aucun objectif n'est défini", () => {
    const svg = buildShareCardSvg(makeCounter({ count: 42, behavior: {} }))
    // Sans objectif, l'emplacement interpolé entre la valeur et le pied de
    // carte doit rester vide (pas de contenu injecté par erreur) — et le
    // pied de carte doit être centré et positionné à `CARD_HEIGHT - 40`.
    expect(svg).toMatch(/>42<\/text>\s*<text x="320" y="760"[^>]*>PlusUn<\/text>/)
  })

  it('échappe les caractères spéciaux du nom', () => {
    const svg = buildShareCardSvg(makeCounter({ name: `<A & "B"> 'C'` }))
    expect(svg).toContain('&lt;A &amp; &quot;B&quot;&gt; &apos;C&apos;')
    expect(svg).not.toContain(`<A & "B">`)
  })

  it("n'affiche pas de ligne d'objectif si aucun objectif n'est défini", () => {
    const svg = buildShareCardSvg(makeCounter({ behavior: {} }))
    expect(svg).not.toContain('objectif')
  })

  it("affiche l'objectif formaté et centré quand il est défini", () => {
    const svg = buildShareCardSvg(makeCounter({ behavior: { target: 10000 } }))
    expect(svg).toContain(`x="320" y="440"`)
    expect(svg).toContain(`objectif ${(10000).toLocaleString('fr-FR')}</text>`)
  })

})

class FakeImage {
  static instances: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
    FakeImage.instances.push(this)
  }
}

class FakeCanvasContext {
  scaleCalls: Array<[number, number]> = []
  drawImageCalls: unknown[][] = []
  scale(x: number, y: number) {
    this.scaleCalls.push([x, y])
  }
  drawImage(...args: unknown[]) {
    this.drawImageCalls.push(args)
  }
}

class FakeCanvas {
  width = 0
  height = 0
  context: FakeCanvasContext | null = new FakeCanvasContext()
  toBlobResult: Blob | null = new Blob(['fake-png'], { type: 'image/png' })
  lastToBlobType: string | undefined
  getContext(type: string) {
    // Comme un vrai canvas : un type de contexte autre que "2d" (ex: une
    // chaîne vide) ne renvoie rien, plutôt que le contexte factice quel que
    // soit l'argument.
    return type === '2d' ? this.context : null
  }
  toBlob(callback: (blob: Blob | null) => void, type?: string) {
    this.lastToBlobType = type
    callback(this.toBlobResult)
  }
}

describe('counterShareImageBlob', () => {
  let originalCreateElement: typeof document.createElement
  let fakeCanvas: FakeCanvas

  beforeEach(() => {
    FakeImage.instances = []
    fakeCanvas = new FakeCanvas()
    vi.stubGlobal('Image', FakeImage)
    originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
      return originalCreateElement(tag)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('charge le SVG généré en data URL, puis résout en un PNG une fois rasterisé', async () => {
    const counter = makeCounter()
    const promise = counterShareImageBlob(counter)
    expect(FakeImage.instances[0].src).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildShareCardSvg(counter))}`)
    FakeImage.instances[0].onload?.()
    const blob = await promise
    expect(blob).toBe(fakeCanvas.toBlobResult)
    expect(blob?.type).toBe('image/png')
    expect(fakeCanvas.lastToBlobType).toBe('image/png')
  })

  it('dimensionne le canvas à deux fois la résolution logique de la carte', async () => {
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onload?.()
    await promise
    expect(fakeCanvas.width).toBe(1280)
    expect(fakeCanvas.height).toBe(1600)
  })

  it('applique une mise à l’échelle 2x puis dessine le visuel chargé en (0,0)', async () => {
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onload?.()
    await promise
    expect(fakeCanvas.context?.scaleCalls).toEqual([[2, 2]])
    expect(fakeCanvas.context?.drawImageCalls).toEqual([[FakeImage.instances[0], 0, 0]])
  })

  it('retourne null si le chargement du visuel échoue', async () => {
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onerror?.()
    const blob = await promise
    expect(blob).toBeNull()
  })

  it('retourne null si le contexte 2D du canvas est indisponible', async () => {
    fakeCanvas.context = null
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onload?.()
    const blob = await promise
    expect(blob).toBeNull()
  })

  it("retourne null si l'export en PNG échoue", async () => {
    fakeCanvas.toBlobResult = null
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onload?.()
    const blob = await promise
    expect(blob).toBeNull()
  })

  it('retourne null si une erreur inattendue survient pendant la rasterisation', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('boom')
    })
    const promise = counterShareImageBlob(makeCounter())
    FakeImage.instances[0].onload?.()
    const blob = await promise
    expect(blob).toBeNull()
  })
})
