import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("utilise la valeur initiale quand rien n'est stocké", () => {
    const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
    expect(result.current[0]).toBe('défaut')
  })

  it('lit la valeur déjà stockée au montage', () => {
    window.localStorage.setItem('clé-test', JSON.stringify('valeur-stockée'))
    const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
    expect(result.current[0]).toBe('valeur-stockée')
  })

  it('retombe sur la valeur initiale si le contenu stocké est un JSON invalide', () => {
    window.localStorage.setItem('clé-test', '{invalide')
    const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
    expect(result.current[0]).toBe('défaut')
  })

  it('persiste la nouvelle valeur dans localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
    act(() => {
      result.current[1]('nouvelle-valeur')
    })
    expect(result.current[0]).toBe('nouvelle-valeur')
    expect(window.localStorage.getItem('clé-test')).toBe(JSON.stringify('nouvelle-valeur'))
  })

  it('accepte une fonction de mise à jour comme setState classique', () => {
    const { result } = renderHook(() => useLocalStorage<number>('compteur-test', 0))
    act(() => {
      result.current[1]((prev) => prev + 1)
    })
    expect(result.current[0]).toBe(1)
  })

  describe('synchronisation inter-onglets (événement storage)', () => {
    it('adopte la nouvelle valeur écrite par un autre onglet sur la même clé', () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'clé-test', newValue: JSON.stringify('depuis-un-autre-onglet') })
        )
      })
      expect(result.current[0]).toBe('depuis-un-autre-onglet')
    })

    it('ignore un événement storage sur une autre clé', () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'autre-clé', newValue: JSON.stringify('ignoré') }))
      })
      expect(result.current[0]).toBe('défaut')
    })

    it("retombe sur la valeur initiale quand l'entrée est supprimée dans un autre onglet", () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      act(() => {
        result.current[1]('valeur-locale')
      })
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'clé-test', newValue: null }))
      })
      expect(result.current[0]).toBe('défaut')
    })

    it('ignore un événement storage au contenu JSON invalide', () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      act(() => {
        result.current[1]('valeur-locale')
      })
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'clé-test', newValue: '{invalide' }))
      })
      expect(result.current[0]).toBe('valeur-locale')
    })

    it('se désabonne au démontage', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('quand window.localStorage lève une exception', () => {
    let getItemSpy: ReturnType<typeof vi.spyOn>
    let setItemSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      getItemSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
        throw new Error('stockage indisponible')
      })
      setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
        throw new Error('quota dépassé')
      })
    })

    afterEach(() => {
      getItemSpy.mockRestore()
      setItemSpy.mockRestore()
    })

    it('retombe sur la valeur initiale si la lecture échoue', () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      expect(result.current[0]).toBe('défaut')
    })

    it("n'explose pas si l'écriture échoue", () => {
      const { result } = renderHook(() => useLocalStorage('clé-test', 'défaut'))
      expect(() => {
        act(() => {
          result.current[1]('nouvelle-valeur')
        })
      }).not.toThrow()
      expect(result.current[0]).toBe('nouvelle-valeur')
    })
  })

  it("suit la nouvelle clé quand elle change (et ignore l'ancienne) pour les changements d'un autre onglet", () => {
    const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, 'défaut'), { initialProps: { k: 'clé-a' } })
    rerender({ k: 'clé-b' })
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'clé-a', newValue: JSON.stringify('ancienne') }))
    })
    expect(result.current[0]).not.toBe('ancienne')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'clé-b', newValue: JSON.stringify('nouvelle') }))
    })
    expect(result.current[0]).toBe('nouvelle')
  })
})
