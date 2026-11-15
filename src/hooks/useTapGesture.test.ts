import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTapGesture } from './useTapGesture'

function pointerEvent(x: number, y: number, button = 0) {
  return { clientX: x, clientY: y, button } as React.PointerEvent
}

describe('useTapGesture', () => {
  it("incrémente au relâchement d'un tap au même endroit", () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerUp(pointerEvent(20, 20)))
    expect(bump).toHaveBeenCalledTimes(1)
    expect(bump).toHaveBeenCalledWith(1)
  })

  it("n'incrémente pas si le pointeur a beaucoup bougé (scroll)", () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerUp(pointerEvent(200, 200)))
    expect(bump).not.toHaveBeenCalled()
  })

  it('ignore le clic droit (bouton secondaire)', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20, 2)))
    act(() => result.current.onPointerUp(pointerEvent(20, 20, 2)))
    expect(bump).not.toHaveBeenCalled()
  })

  it('ignore un pointerup sans pointerdown préalable', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerUp(pointerEvent(20, 20)))
    expect(bump).not.toHaveBeenCalled()
  })

  it('un pointercancel annule le tap en cours', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerCancel())
    act(() => result.current.onPointerUp(pointerEvent(20, 20)))
    expect(bump).not.toHaveBeenCalled()
  })

  it("le onClick de compatibilité n'incrémente pas une deuxième fois après un tap déjà compté", () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerUp(pointerEvent(20, 20)))
    act(() => result.current.onClick())
    expect(bump).toHaveBeenCalledTimes(1)
  })

  it('le onClick incrémente normalement quand aucun tap pointer n\'a été compté (souris/clavier)', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onClick())
    expect(bump).toHaveBeenCalledTimes(1)
    expect(bump).toHaveBeenCalledWith(1)
  })

  it('compte comme un tap un relâchement exactement à la distance de tolérance', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerUp(pointerEvent(30, 20)))
    expect(bump).toHaveBeenCalledTimes(1)
  })

  it('un clic natif après un tap déjà compté est ignoré une seule fois', () => {
    const bump = vi.fn()
    const { result } = renderHook(() => useTapGesture(bump))
    act(() => result.current.onPointerDown(pointerEvent(20, 20)))
    act(() => result.current.onPointerUp(pointerEvent(20, 20)))
    act(() => result.current.onClick())
    expect(bump).toHaveBeenCalledTimes(1)
    act(() => result.current.onClick())
    expect(bump).toHaveBeenCalledTimes(2)
  })
})
