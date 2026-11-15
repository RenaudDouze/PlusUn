import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCelebration } from './useCelebration'

describe('useCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('false sans objectif défini', () => {
    const { result } = renderHook(() => useCelebration(5, undefined))
    expect(result.current).toBe(false)
  })

  it("false au montage même si l'objectif est déjà atteint (pas de franchissement)", () => {
    const { result } = renderHook(() => useCelebration(10, 10))
    expect(result.current).toBe(false)
  })

  it("passe à true au franchissement de l'objectif (d'en dessous vers au moins sa valeur)", () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 9, target: 10 },
    })
    expect(result.current).toBe(false)
    rerender({ count: 10, target: 10 })
    expect(result.current).toBe(true)
  })

  it('détecte un franchissement qui saute par-dessus la cible (pas personnalisé)', () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 9, target: 10 },
    })
    rerender({ count: 12, target: 10 })
    expect(result.current).toBe(true)
  })

  it('revient à false après la durée de célébration', () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 9, target: 10 },
    })
    rerender({ count: 10, target: 10 })
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1100))
    expect(result.current).toBe(false)
  })

  it("ne se redéclenche pas en restant au-dessus de l'objectif", () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 9, target: 10 },
    })
    rerender({ count: 10, target: 10 })
    act(() => vi.advanceTimersByTime(1100))
    expect(result.current).toBe(false)
    rerender({ count: 11, target: 10 })
    expect(result.current).toBe(false)
  })

  it('ne célèbre jamais sans objectif, même quand le compteur monte beaucoup', () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 0, target: undefined as number | undefined },
    })
    rerender({ count: 1_000_000, target: undefined })
    expect(result.current).toBe(false)
  })

  it('repousse la fin de la célébration quand l’objectif est franchi une seconde fois', () => {
    const { result, rerender } = renderHook(({ count, target }) => useCelebration(count, target), {
      initialProps: { count: 9, target: 10 },
    })
    rerender({ count: 10, target: 10 })
    act(() => vi.advanceTimersByTime(600))
    rerender({ count: 9, target: 10 })
    rerender({ count: 10, target: 10 })
    // 600 ms + 600 ms : le premier délai (1100 ms) est écoulé, pas le second.
    act(() => vi.advanceTimersByTime(600))
    expect(result.current).toBe(true)
  })
})
