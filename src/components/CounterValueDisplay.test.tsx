import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CounterValueDisplay } from './CounterValueDisplay'
import {
  BADGE_MOTION,
  EDITORIAL_MOTION,
  FLAP_CHAR_MOTION,
  RING_ARC_TRANSITION,
  RING_CIRCUMFERENCE,
  RING_NUMBER_MOTION,
  SEGMENT_FLASH_MOTION,
  ringDashOffset,
  segmentsFor,
} from './valueDisplayMotion'

describe('CounterValueDisplay', () => {
  it("affiche l'odomètre par défaut quand aucun style n'est précisé", () => {
    render(<CounterValueDisplay value={42} direction={1} progress={null} />)
    expect(document.querySelector('.odometer')).toBeInTheDocument()
  })

  it("affiche l'odomètre pour le style 'default'", () => {
    render(<CounterValueDisplay value={42} direction={1} style="default" progress={null} />)
    expect(document.querySelector('.odometer')).toBeInTheDocument()
  })

  describe('style volets', () => {
    it('affiche un volet par chiffre', () => {
      render(<CounterValueDisplay value={247} direction={1} style="flap" progress={null} />)
      const tiles = document.querySelectorAll('.value-flap-tile')
      expect(tiles).toHaveLength(3)
      expect(tiles[0]).toHaveTextContent('2')
      expect(tiles[1]).toHaveTextContent('4')
      expect(tiles[2]).toHaveTextContent('7')
    })

    it('affiche un volet dédié pour le signe moins', () => {
      render(<CounterValueDisplay value={-5} direction={-1} style="flap" progress={null} />)
      const tiles = document.querySelectorAll('.value-flap-tile')
      expect(tiles).toHaveLength(2)
      expect(tiles[0]).toHaveTextContent('-')
    })
  })

  describe('style 7 segments', () => {
    it('allume les bons segments pour chaque chiffre (0-9)', () => {
      render(<CounterValueDisplay value={1234567890} direction={1} style="segment7" progress={null} />)
      const digits = document.querySelectorAll('.value-segment-digit')
      expect(digits).toHaveLength(10)
      // '0' est le dernier caractère : segments a-f allumés, g éteint.
      const zero = digits[9]
      expect(zero.querySelector('.value-segment--a')?.className).toContain('is-on')
      expect(zero.querySelector('.value-segment--g')?.className).not.toContain('is-on')
    })

    it('allume uniquement le segment central pour le signe moins', () => {
      render(<CounterValueDisplay value={-1} direction={-1} style="segment7" progress={null} />)
      const digits = document.querySelectorAll('.value-segment-digit')
      const minus = digits[0]
      expect(minus.querySelector('.value-segment--g')?.className).toContain('is-on')
      expect(minus.querySelector('.value-segment--a')?.className).not.toContain('is-on')
    })

    it("n'échoue pas sur un caractère hors table (notation exponentielle d'une très grande valeur)", () => {
      // (1e21).toString() === '1e+21' : les caractères 'e' et '+' n'ont pas
      // d'entrée dans la table des segments.
      render(<CounterValueDisplay value={1e21} direction={1} style="segment7" progress={null} />)
      const digits = document.querySelectorAll('.value-segment-digit')
      expect(digits).toHaveLength(5)
      const eDigit = digits[1]
      expect(eDigit.querySelectorAll('.is-on')).toHaveLength(0)
    })
  })

  describe('style anneau', () => {
    it("n'affiche pas d'arc ni de pourcentage sans progression", () => {
      render(<CounterValueDisplay value={8} direction={1} style="ring" progress={null} />)
      expect(document.querySelector('.value-ring-fill')).not.toBeInTheDocument()
      expect(document.querySelector('.value-ring-pct')).not.toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
    })

    it('affiche un arc et le pourcentage arrondi quand une progression est fournie', () => {
      render(<CounterValueDisplay value={8} direction={1} style="ring" progress={0.62} />)
      expect(document.querySelector('.value-ring-fill')).toBeInTheDocument()
      expect(screen.getByText('62 %')).toBeInTheDocument()
    })
  })

  it('style éditorial : affiche le nombre et une règle discrète', () => {
    render(<CounterValueDisplay value={8} direction={1} style="editorial" progress={null} />)
    expect(document.querySelector('.value-editorial-number')).toHaveTextContent('8')
    expect(document.querySelector('.value-editorial-rule')).toBeInTheDocument()
  })

  it('style pastille : affiche le nombre dans une pastille', () => {
    render(<CounterValueDisplay value={8} direction={1} style="badge" progress={null} />)
    expect(document.querySelector('.value-badge-pill')).toHaveTextContent('8')
  })

  describe("pas d'animation d'entrée au premier rendu", () => {
    it('volets : le chiffre est déjà visible', () => {
      render(<CounterValueDisplay value={7} direction={1} style="flap" progress={null} />)
      expect(document.querySelector<HTMLElement>('.value-flap-char')?.style.opacity).toBe('1')
    })

    it('éditorial : le nombre est déjà visible', () => {
      render(<CounterValueDisplay value={7} direction={1} style="editorial" progress={null} />)
      expect(document.querySelector<HTMLElement>('.value-editorial-number')?.style.opacity).toBe('1')
    })

    it("anneau : l'arc est déjà à sa position", () => {
      render(<CounterValueDisplay value={7} direction={1} style="ring" progress={0.25} />)
      const arc = document.querySelector<SVGCircleElement>('.value-ring-fill')
      expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBeCloseTo(ringDashOffset(0.25), 3)
      expect(arc?.getAttribute('stroke-dasharray')).toBe(String(RING_CIRCUMFERENCE))
    })
  })

  describe('remontage des chiffres 7 segments', () => {
    it("ne remonte que les positions dont le caractère a changé (pour rejouer le sursaut)", () => {
      const { rerender } = render(<CounterValueDisplay value={12} direction={1} style="segment7" progress={null} />)
      const [first, second] = Array.from(document.querySelectorAll('.value-segment7-flash'))
      rerender(<CounterValueDisplay value={13} direction={1} style="segment7" progress={null} />)
      const after = document.querySelectorAll('.value-segment7-flash')
      expect(after[0]).toBe(first)
      expect(after[1]).not.toBe(second)
    })
  })
})

describe('valueDisplayMotion', () => {
  it("décrit l'animation des volets", () => {
    expect(FLAP_CHAR_MOTION).toEqual({
      initial: { rotateX: -90, opacity: 0 },
      animate: { rotateX: 0, opacity: 1 },
      exit: { rotateX: 90, opacity: 0 },
      transition: { duration: 0.26, ease: 'easeInOut' },
    })
  })

  it("décrit le sursaut des 7 segments", () => {
    expect(SEGMENT_FLASH_MOTION).toEqual({
      initial: { filter: 'brightness(2.6)' },
      animate: { filter: 'brightness(1)' },
      transition: { duration: 0.25, ease: 'easeOut' },
    })
  })

  it("décrit les animations de l'anneau", () => {
    expect(RING_ARC_TRANSITION).toEqual({ type: 'spring', stiffness: 120, damping: 22 })
    expect(RING_NUMBER_MOTION).toEqual({
      initial: { scale: 0.8, opacity: 0.3 },
      animate: { scale: 1, opacity: 1 },
      transition: { duration: 0.22, ease: 'easeOut' },
    })
  })

  it("décrit l'animation éditoriale", () => {
    expect(EDITORIAL_MOTION).toEqual({
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -6 },
      transition: { duration: 0.32, ease: 'easeOut' },
    })
  })

  it("décrit l'animation de la pastille", () => {
    expect(BADGE_MOTION).toEqual({
      initial: { scale: 0.6, rotate: -8 },
      animate: { scale: 1, rotate: 0 },
      transition: { type: 'spring', stiffness: 420, damping: 12 },
    })
  })

  it("l'arc complet vaut la circonférence d'un cercle de rayon 54", () => {
    expect(RING_CIRCUMFERENCE).toBeCloseTo(339.292, 3)
    expect(ringDashOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE, 6)
    expect(ringDashOffset(0.25)).toBeCloseTo(254.469, 3)
    expect(ringDashOffset(1)).toBe(0)
  })

  it('donne les segments allumés de chaque caractère', () => {
    expect(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-'].map(segmentsFor)).toEqual([
      'abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abcdfg', 'g',
    ])
    expect(segmentsFor('e')).toBe('')
  })
})
