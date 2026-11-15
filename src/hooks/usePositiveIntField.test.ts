import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePositiveIntField } from './usePositiveIntField'

function changeEvent(value: string) {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

function keyEvent(key: string) {
  return { key } as React.KeyboardEvent<HTMLInputElement>
}

describe('usePositiveIntField', () => {
  it('initialise le brouillon à partir de la valeur fournie', () => {
    const { result } = renderHook(() => usePositiveIntField(5, vi.fn()))
    expect(result.current.value).toBe('5')
    expect(result.current.error).toBeNull()
  })

  it('initialise un brouillon vide quand la valeur est absente', () => {
    const { result } = renderHook(() => usePositiveIntField(undefined, vi.fn()))
    expect(result.current.value).toBe('')
  })

  it('met à jour le brouillon et efface une éventuelle erreur au changement', () => {
    const { result } = renderHook(() => usePositiveIntField(5, vi.fn()))
    act(() => result.current.onChange(changeEvent('12')))
    expect(result.current.value).toBe('12')
    expect(result.current.error).toBeNull()
  })

  it('commite au blur avec une valeur valide', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('10')))
    act(() => result.current.onBlur())
    expect(onCommit).toHaveBeenCalledWith(10)
    expect(result.current.error).toBeNull()
  })

  it("commite à l'appui sur Entrée avec une valeur valide", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('7')))
    act(() => result.current.onKeyDown(keyEvent('Enter')))
    expect(onCommit).toHaveBeenCalledWith(7)
  })

  it("ne commite pas sur une touche autre qu'Entrée", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('7')))
    act(() => result.current.onKeyDown(keyEvent('a')))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('efface la valeur (onCommit(undefined)) quand le brouillon est vidé', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(5, onCommit))
    act(() => result.current.onChange(changeEvent('')))
    act(() => result.current.onBlur())
    expect(onCommit).toHaveBeenCalledWith(undefined)
    expect(result.current.error).toBeNull()
  })

  it("efface la valeur quand le brouillon ne contient que des espaces", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(5, onCommit))
    act(() => result.current.onChange(changeEvent('   ')))
    act(() => result.current.onBlur())
    expect(onCommit).toHaveBeenCalledWith(undefined)
  })

  it('affiche une erreur et ne commite pas pour une saisie contenant des lettres', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('1a0b')))
    act(() => result.current.onBlur())
    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Nombre entier positif requis.')
    // Le brouillon invalide reste affiché plutôt que d'être réinitialisé.
    expect(result.current.value).toBe('1a0b')
  })

  it('affiche une erreur et ne commite pas pour 0 (positif strict requis)', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('0')))
    act(() => result.current.onBlur())
    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Nombre entier positif requis.')
  })

  it("garde l'erreur affichée si le champ reperd le focus sans être corrigé", () => {
    const { result } = renderHook(() => usePositiveIntField(undefined, vi.fn()))
    act(() => result.current.onChange(changeEvent('0')))
    act(() => result.current.onBlur())
    expect(result.current.error).toBe('Nombre entier positif requis.')
    act(() => result.current.onBlur())
    expect(result.current.error).toBe('Nombre entier positif requis.')
  })

  it("rejette une saisie qui commence par des caractères non numériques mais finit par un nombre", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => usePositiveIntField(undefined, onCommit))
    act(() => result.current.onChange(changeEvent('12a7')))
    act(() => result.current.onBlur())
    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Nombre entier positif requis.')
  })

  it("efface l'erreur dès que la saisie change", () => {
    const { result } = renderHook(() => usePositiveIntField(undefined, vi.fn()))
    act(() => result.current.onChange(changeEvent('abc')))
    act(() => result.current.onBlur())
    expect(result.current.error).toBe('Nombre entier positif requis.')
    act(() => result.current.onChange(changeEvent('ab')))
    expect(result.current.error).toBeNull()
  })
})
