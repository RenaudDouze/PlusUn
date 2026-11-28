import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHoldToRepeat } from './useHoldToRepeat'

describe('useHoldToRepeat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ne déclenche rien avant le délai de maintien", () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(200))
    expect(bump).not.toHaveBeenCalled()
  })

  it('déclenche bump puis répète après le délai de maintien', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(350))
    expect(bump).toHaveBeenCalledTimes(1)
    expect(bump).toHaveBeenCalledWith(1)
    act(() => vi.advanceTimersByTime(250))
    expect(bump).toHaveBeenCalledTimes(3)
  })

  it('marque longPressFiredRef une fois la rafale démarrée', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    expect(result.current.longPressFiredRef.current).toBe(false)
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(350))
    expect(result.current.longPressFiredRef.current).toBe(true)
  })

  it('stopHold arrête la répétition et empêche tout futur déclenchement', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(350))
    expect(bump).toHaveBeenCalledTimes(1)
    act(() => result.current.stopHold())
    act(() => vi.advanceTimersByTime(500))
    expect(bump).toHaveBeenCalledTimes(1)
  })

  it('un nouvel appel à startHold réinitialise longPressFiredRef et le minuteur précédent', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(350))
    expect(result.current.longPressFiredRef.current).toBe(true)
    act(() => result.current.startHold(-1))
    expect(result.current.longPressFiredRef.current).toBe(false)
    act(() => vi.advanceTimersByTime(350))
    expect(bump).toHaveBeenLastCalledWith(-1)
  })

  it("annule le maintien en cours quand on relâche avant le délai", () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current.stopHold())
    act(() => vi.advanceTimersByTime(1000))
    expect(bump).not.toHaveBeenCalled()
  })

  it('un nouvel appui remplace le précédent au lieu de s’y ajouter', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useHoldToRepeat(bump))
    act(() => result.current.startHold(1))
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current.startHold(-1))
    act(() => vi.advanceTimersByTime(350))
    expect(bump).toHaveBeenCalledTimes(1)
    expect(bump).toHaveBeenCalledWith(-1)
  })
})
