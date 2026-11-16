import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaBanners } from './PwaBanners'

function setup() {
  const applyUpdate = vi.fn(async () => {})
  let onNeedRefresh: () => void = () => {}
  const register = vi.fn((options: { onNeedRefresh: () => void }) => {
    onNeedRefresh = options.onNeedRefresh
    return applyUpdate
  })
  const result = render(<PwaBanners register={register} />)
  return { applyUpdate, register, needRefresh: () => act(() => onNeedRefresh()), ...result }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PwaBanners — mise à jour', () => {
  it("enregistre le service worker et n'affiche rien tant qu'aucune version n'est prête", () => {
    const { register } = setup()
    expect(register).toHaveBeenCalledTimes(1)
    expect(document.getElementById('update-banner')).toBeNull()
  })

  it('annonce la nouvelle version sans recharger la page', () => {
    const { needRefresh, applyUpdate } = setup()
    needRefresh()
    const banner = document.getElementById('update-banner')!
    expect(banner.getAttributeNames().sort()).toEqual(['class', 'id', 'role'])
    expect(banner.className).toBe('pwa-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.querySelector('span')!.textContent).toBe('Une nouvelle version est disponible.')
    expect([...banner.querySelectorAll('button')].map((b) => [b.id, b.type, b.textContent])).toEqual([
      ['update-reload', 'button', 'Recharger'],
      ['update-later', 'button', 'Plus tard'],
    ])
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('« Recharger » applique la mise à jour avec rechargement', async () => {
    const { needRefresh, applyUpdate } = setup()
    needRefresh()
    await userEvent.click(screen.getByRole('button', { name: 'Recharger' }))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(applyUpdate).toHaveBeenCalledWith(true)
  })

  it('« Plus tard » ferme le bandeau sans recharger', async () => {
    const { needRefresh, applyUpdate } = setup()
    needRefresh()
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(document.getElementById('update-banner')).toBeNull()
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it("se réenregistre si la fonction d'enregistrement change", () => {
    const first = setup()
    const second = vi.fn(() => vi.fn(async () => {}))
    first.rerender(<PwaBanners register={second} />)
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('PwaBanners — hors ligne', () => {
  function setOnLine(value: boolean) {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
  }

  it("n'affiche rien quand le navigateur est en ligne", () => {
    setOnLine(true)
    setup()
    expect(document.getElementById('offline-banner')).toBeNull()
  })

  it('affiche le bandeau quand le navigateur démarre hors ligne', () => {
    setOnLine(false)
    setup()
    const banner = document.getElementById('offline-banner')!
    expect(banner.getAttributeNames().sort()).toEqual(['class', 'id', 'role'])
    expect(banner.className).toBe('pwa-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.textContent).toBe(
      "Hors ligne : l'application reste utilisable, la synchronisation reprendra au retour du réseau.",
    )
  })

  it('suit les événements offline puis online', () => {
    setOnLine(true)
    setup()
    setOnLine(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(document.getElementById('offline-banner')).not.toBeNull()
    setOnLine(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(document.getElementById('offline-banner')).toBeNull()
  })

  it('retire ses écouteurs au démontage', () => {
    setOnLine(true)
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = setup()
    unmount()
    for (const type of ['online', 'offline']) {
      const added = add.mock.calls.find(([t]) => t === type)![1]
      expect(remove).toHaveBeenCalledWith(type, added)
    }
  })
})
