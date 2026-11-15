import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Odometer } from './Odometer'
import { digitMotion } from './odometerMotion'

describe('Odometer', () => {
  it('affiche chaque chiffre d\'un nombre positif', () => {
    render(<Odometer value={123} direction={1} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('affiche 0', () => {
    render(<Odometer value={0} direction={1} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('affiche le signe négatif pour un nombre négatif', () => {
    render(<Odometer value={-5} direction={-1} />)
    const container = screen.getByText('5').closest('.odometer')
    expect(container?.textContent).toBe('-5')
  })

  it('affiche un seul caractère par position (pas de doublon lors du rendu initial)', () => {
    render(<Odometer value={42} direction={1} />)
    const digits = document.querySelectorAll('.odometer-digit')
    expect(digits).toHaveLength(2)
  })

  it('accepte direction=-1 sans erreur', () => {
    render(<Odometer value={87} direction={-1} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('un chiffre qui entre glisse depuis le bas quand on incrémente, et sort vers le haut', () => {
    const motion = digitMotion(1)
    expect(motion.initial).toEqual({ y: 32, opacity: 0 })
    expect(motion.animate).toEqual({ y: 0, opacity: 1 })
    expect(motion.exit).toEqual({ y: -32, opacity: 0 })
  })

  it('en décrémentant, le sens est inversé', () => {
    const motion = digitMotion(-1)
    expect(motion.initial).toEqual({ y: -32, opacity: 0 })
    expect(motion.exit).toEqual({ y: 32, opacity: 0 })
  })

  it('anime avec un ressort', () => {
    expect(digitMotion(1).transition).toEqual({ type: 'spring', stiffness: 420, damping: 32 })
  })

  it("n'anime pas les chiffres au premier rendu (ils s'affichent directement à leur place)", () => {
    render(<Odometer value={7} direction={1} />)
    const inner = document.querySelector('.odometer-digit-inner') as HTMLElement
    expect(inner.style.opacity).toBe('1')
  })

  it('garde le même élément pour les unités quand le nombre gagne un chiffre', () => {
    const { rerender } = render(<Odometer value={9} direction={1} />)
    const unitsBefore = document.querySelector('.odometer-digit')
    rerender(<Odometer value={10} direction={1} />)
    const digits = document.querySelectorAll('.odometer-digit')
    expect(digits).toHaveLength(2)
    expect(digits[1]).toBe(unitsBefore)
  })
})
