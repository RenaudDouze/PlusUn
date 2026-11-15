import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFillFontSize } from './useFillFontSize'

function Harness({ active, digitsSource }: { active: boolean; digitsSource: number }) {
  const { ref, fontSize } = useFillFontSize(active, digitsSource)
  return <div ref={ref} data-testid="target" style={fontSize ? { fontSize: `${fontSize}px` } : undefined} />
}

describe('useFillFontSize', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ne calcule rien quand inactif', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { getByTestId } = render(<Harness active={false} digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toBe('')
  })

  it("ne calcule rien tant que l'espace mesuré est nul (élément non visible)", () => {
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toBe('')
  })

  it("calcule et applique une taille de police quand l'espace mesuré est non nul", () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toMatch(/px$/)
  })

  it('plafonne à un minimum de 48px', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10)
    const { getByTestId } = render(<Harness active digitsSource={999999} />)
    expect(getByTestId('target').style.fontSize).toBe('48px')
  })

  it('se désabonne du ResizeObserver au démontage', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { unmount } = render(<Harness active digitsSource={12} />)
    expect(() => unmount()).not.toThrow()
  })

  it("ne réattache pas le ResizeObserver (ni ne remesure) quand la valeur change sans changer le nombre de chiffres", () => {
    // Sans ça, chaque incrément (donc chaque tap sur +/-) réattacherait un
    // nouveau ResizeObserver et forcerait une lecture de layout synchrone
    // même quand le nombre de chiffres affichés n'a pas changé — un coût
    // superflu à chaque appui, plus sensible sur du matériel ancien.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    let instantiations = 0
    class TrackedResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor() {
        instantiations++
      }
    }
    vi.stubGlobal('ResizeObserver', TrackedResizeObserver)

    const { rerender } = render(<Harness active digitsSource={12} />)
    expect(instantiations).toBe(1)

    rerender(<Harness active digitsSource={34} />) // toujours 2 chiffres
    expect(instantiations).toBe(1)

    rerender(<Harness active digitsSource={345} />) // 3 chiffres désormais
    expect(instantiations).toBe(2)
  })

  it("n'applique rien si seule la largeur mesurée est nulle", () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(0)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toBe('')
  })

  it("n'applique rien si seule la hauteur mesurée est nulle", () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(0)
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toBe('')
  })

  it('est limitée par la largeur : 320 px pour 2 chiffres', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(parseFloat(getByTestId('target').style.fontSize)).toBeCloseTo(320 / (2 * 0.62), 3)
  })

  it('est limitée par la hauteur : 85 % de la hauteur disponible', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100)
    const { getByTestId } = render(<Harness active digitsSource={12} />)
    expect(parseFloat(getByTestId('target').style.fontSize)).toBeCloseTo(85, 3)
  })

  it('redevient vide quand le hook est désactivé après avoir mesuré', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const { getByTestId, rerender } = render(<Harness active digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).not.toBe('')
    rerender(<Harness active={false} digitsSource={12} />)
    expect(getByTestId('target').style.fontSize).toBe('')
  })

  it("observe l'élément et déconnecte l'observateur au démontage", () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480)
    const observe = vi.fn()
    const disconnect = vi.fn()
    class TrackedResizeObserver {
      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
    }
    vi.stubGlobal('ResizeObserver', TrackedResizeObserver)
    const { getByTestId, unmount } = render(<Harness active digitsSource={12} />)
    expect(observe).toHaveBeenCalledWith(getByTestId('target'))
    expect(disconnect).not.toHaveBeenCalled()
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
