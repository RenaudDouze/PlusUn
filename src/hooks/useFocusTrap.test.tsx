import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function TestModal({ active = true, buttonCount = 2 }: { active?: boolean; buttonCount?: number }) {
  const ref = useFocusTrap<HTMLDivElement>(active)
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      {Array.from({ length: buttonCount }, (_, i) => (
        <button key={i}>Bouton {i + 1}</button>
      ))}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('déplace le focus sur le premier élément focusable du panneau au montage', () => {
    render(<TestModal />)
    expect(document.activeElement).toHaveTextContent('Bouton 1')
  })

  it("focus le panneau lui-même s'il ne contient aucun élément focusable", () => {
    render(<TestModal buttonCount={0} />)
    expect(document.activeElement).toBe(screen.getByTestId('panel'))
  })

  it('boucle du dernier au premier élément avec Tab', () => {
    render(<TestModal buttonCount={2} />)
    const buttons = screen.getAllByRole('button')
    buttons[1].focus()
    fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('boucle du premier au dernier élément avec Shift+Tab', () => {
    render(<TestModal buttonCount={2} />)
    const buttons = screen.getAllByRole('button')
    // Le focus initial (posé au montage) est déjà sur buttons[0].
    fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[1])
  })

  it('ne touche pas au focus pour une touche autre que Tab', () => {
    render(<TestModal buttonCount={2} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Enter' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it("ne bloque pas Tab au milieu de la liste (laisse le comportement natif du navigateur agir)", () => {
    render(<TestModal buttonCount={3} />)
    const buttons = screen.getAllByRole('button')
    buttons[1].focus()
    const notPrevented = fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })
    expect(notPrevented).toBe(true)
  })

  it("empêche Tab si le panneau ne contient aucun élément focusable, plutôt que de laisser le focus s'en échapper", () => {
    render(<TestModal buttonCount={0} />)
    const prevented = fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })
    expect(prevented).toBe(false)
  })

  it("restaure le focus sur l'élément externe qui l'avait avant le montage, une fois le panneau démonté", () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Dehors'
    document.body.appendChild(trigger)
    trigger.focus()

    const { unmount } = render(<TestModal />)
    expect(document.activeElement).not.toBe(trigger)

    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it("ne déplace ni ne piège le focus quand `active` est false", () => {
    const outside = document.createElement('button')
    outside.textContent = 'Dehors'
    document.body.appendChild(outside)
    outside.focus()

    render(<TestModal active={false} />)
    expect(document.activeElement).toBe(outside)

    outside.remove()
  })

  it('piège le focus par défaut, sans argument', () => {
    function DefaultTrap() {
      const ref = useFocusTrap<HTMLDivElement>()
      return (
        <div ref={ref} tabIndex={-1}>
          <button>Seul</button>
        </div>
      )
    }
    render(<DefaultTrap />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Seul' }))
  })

  it('ne touche ni au focus ni à l’évènement pour une autre touche, même sur le dernier élément', () => {
    render(<TestModal buttonCount={2} />)
    const buttons = screen.getAllByRole('button')
    buttons[1].focus()
    const notPrevented = fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Enter' })
    expect(notPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[1])
  })

  it('Tab sur le premier élément laisse le navigateur avancer (pas de boucle)', () => {
    render(<TestModal buttonCount={3} />)
    const notPrevented = fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })
    expect(notPrevented).toBe(true)
  })

  it('Shift+Tab au milieu de la liste laisse le navigateur reculer (pas de boucle)', () => {
    render(<TestModal buttonCount={3} />)
    screen.getAllByRole('button')[1].focus()
    const notPrevented = fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab', shiftKey: true })
    expect(notPrevented).toBe(true)
  })

  it('empêche l’action native quand il boucle (Tab sur le dernier, Shift+Tab sur le premier)', () => {
    render(<TestModal buttonCount={2} />)
    const buttons = screen.getAllByRole('button')
    buttons[1].focus()
    expect(fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })).toBe(false)
    expect(fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab', shiftKey: true })).toBe(false)
  })

  it('retire son écouteur clavier au démontage', () => {
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
    const { unmount } = render(<TestModal />)
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it("ne plante pas au démontage quand aucun élément n'avait le focus avant l'ouverture", () => {
    const spy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
    const { unmount } = render(<TestModal />)
    expect(() => unmount()).not.toThrow()
    spy.mockRestore()
  })

  it('cesse de piéger le focus quand il est désactivé, et le restaure', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { rerender } = render(<TestModal active />)
    const buttons = screen.getAllByRole('button').filter((b) => b !== trigger)
    buttons[1].focus()
    rerender(<TestModal active={false} />)
    expect(document.activeElement).toBe(trigger)
    buttons[1].focus()
    expect(fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Tab' })).toBe(true)
    trigger.remove()
  })
})
