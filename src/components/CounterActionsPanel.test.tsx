import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CounterActionsPanel } from './CounterActionsPanel'
import { counterShareImageBlob } from '../shareCard'
import type { Counter } from '../types'

vi.mock('../shareCard', () => ({
  counterShareImageBlob: vi.fn(),
}))

const realNavigator = window.navigator
const mockedCounterShareImageBlob = vi.mocked(counterShareImageBlob)

function makeCounter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'counter-1',
    name: 'Compteur 1',
    count: 0,
    createdAt: new Date(2026, 7, 1).getTime(),
    behavior: {},
    appearance: { color: '#2563eb' },
    ...overrides,
  }
}

function renderPanel(
  counterOverrides: Partial<Counter> = {},
  props: Partial<Parameters<typeof CounterActionsPanel>[0]> = {}
) {
  const counter = makeCounter(counterOverrides)
  const handlers = {
    onClose: vi.fn(),
    onDuplicate: vi.fn(),
    onToggleArchive: vi.fn(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
    onNavigate: vi.fn(),
    ...props,
  }
  const utils = render(<CounterActionsPanel counter={counter} {...handlers} {...props} />)
  return { counter, ...handlers, ...utils }
}

describe('CounterActionsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le nom du compteur dans le titre', () => {
    renderPanel({ name: 'Mon compteur' })
    expect(screen.getByText('Actions « Mon compteur »')).toBeInTheDocument()
  })

  it('ferme au clic sur la croix', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('navigue vers un autre panneau au clic sur un lien dédié', () => {
    const { onNavigate } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(onNavigate).toHaveBeenCalledWith('comportement')
  })

  describe('partage', () => {
    afterEach(() => {
      vi.stubGlobal('navigator', realNavigator)
    })

    it('utilise navigator.share quand disponible', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, share: shareMock, clipboard: { writeText: vi.fn() } })
      renderPanel({ name: 'Partagé', count: 3 })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      expect(shareMock).toHaveBeenCalledTimes(1)
      expect(shareMock.mock.calls[0][0].text).toContain('Partagé : 3')
    })

    it('ignore silencieusement une annulation de navigator.share', async () => {
      const shareMock = vi.fn().mockRejectedValue(new Error('annulé'))
      vi.stubGlobal('navigator', { ...navigator, share: shareMock, clipboard: { writeText: vi.fn() } })
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      expect(screen.getByText('Partager ce compteur')).toBeInTheDocument()
    })

    it('copie dans le presse-papiers quand navigator.share est indisponible', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: writeTextMock } })
      renderPanel({ name: 'Copié', count: 9 })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      expect(writeTextMock).toHaveBeenCalledTimes(1)
      expect(writeTextMock.mock.calls[0][0]).toContain('Copié : 9')
      expect(screen.getByText('Copié')).toBeInTheDocument()
    })

    it('repousse le retour au libellé "Partager" quand on copie une seconde fois', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        share: undefined,
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      })
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })
      await act(async () => {
        fireEvent.click(screen.getByText('Copié'))
      })
      // 1,5 s + 1 s : le premier délai (2 s) est écoulé, pas le second.
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByText('Copié')).toBeInTheDocument()
    })

    it('revient au libellé "Partager" après le délai', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        share: undefined,
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      })
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      expect(screen.getByText('Copié')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(2100)
      })
      expect(screen.getByText('Partager ce compteur')).toBeInTheDocument()
    })

    it('ignore silencieusement un échec de copie', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        share: undefined,
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('refusé')) },
      })
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager ce compteur'))
      })
      expect(screen.getByText('Partager ce compteur')).toBeInTheDocument()
    })
  })

  describe('partage en image', () => {
    let createElementSpy: ReturnType<typeof vi.spyOn>
    let clickSpy: ReturnType<typeof vi.fn<() => void>>
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      mockedCounterShareImageBlob.mockReset()
      clickSpy = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') (el as HTMLAnchorElement).click = clickSpy
        return el
      })
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.stubGlobal('navigator', realNavigator)
      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('affiche un état de génération pendant la création du visuel', () => {
      mockedCounterShareImageBlob.mockReturnValue(new Promise(() => {}))
      renderPanel()
      fireEvent.click(screen.getByText('Partager en image'))
      expect(screen.getByText('Génération…')).toBeInTheDocument()
    })

    it('partage un fichier via navigator.share quand le partage de fichiers est possible', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined)
      const canShareMock = vi.fn().mockReturnValue(true)
      vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: canShareMock })
      mockedCounterShareImageBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
      renderPanel({ name: 'Pompes' })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      expect(canShareMock).toHaveBeenCalledWith({ files: [expect.any(File)] })
      expect(shareMock).toHaveBeenCalledTimes(1)
      const sharedFile = shareMock.mock.calls[0][0].files[0] as File
      expect(sharedFile.name).toBe('Pompes.png')
      expect(sharedFile.type).toBe('image/png')
      expect(sharedFile.size).toBe(1)
      expect(createObjectURLSpy).not.toHaveBeenCalled()
      expect(screen.getByText('Partager en image')).toBeInTheDocument()
    })

    it('ignore silencieusement une annulation du partage de fichiers', async () => {
      const shareMock = vi.fn().mockRejectedValue(new Error('annulé'))
      vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: vi.fn().mockReturnValue(true) })
      mockedCounterShareImageBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      expect(screen.getByText('Partager en image')).toBeInTheDocument()
    })

    it('télécharge le visuel quand le partage de fichiers est indisponible', async () => {
      vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined })
      mockedCounterShareImageBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
      renderPanel({ name: 'Éléva/tions' })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1)
    })

    it('nettoie le nom de fichier des caractères non compatibles', async () => {
      vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined })
      mockedCounterShareImageBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
      renderPanel({ name: 'Éléva/tions !' })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      const anchorCall = createElementSpy.mock.results.find(
        (r: { value: unknown }) => (r.value as HTMLElement).tagName === 'A'
      )
      const anchor = anchorCall?.value as HTMLAnchorElement
      expect(anchor.download).toMatch(/^-l-va-tions-\.png$/)
    })

    it("affiche une erreur si la génération du visuel échoue, qui disparaît après le délai", async () => {
      mockedCounterShareImageBlob.mockResolvedValue(null)
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      expect(screen.getByText('Erreur')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2600)
      })
      expect(screen.getByText('Partager en image')).toBeInTheDocument()
    })

    it("repousse la disparition de l'erreur quand elle se reproduit", async () => {
      mockedCounterShareImageBlob.mockResolvedValue(null)
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      await act(async () => {
        fireEvent.click(screen.getByText('Erreur'))
      })
      // 1,5 s + 1,5 s : le premier délai (2,5 s) est écoulé, pas le second.
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(screen.getByText('Erreur')).toBeInTheDocument()
    })

    it('désactive le bouton pendant la génération, empêchant un second clic', async () => {
      let resolveBlob: (blob: Blob | null) => void = () => {}
      mockedCounterShareImageBlob.mockReturnValue(
        new Promise((resolve) => {
          resolveBlob = resolve
        })
      )
      renderPanel()
      const button = screen.getByText('Partager en image')
      fireEvent.click(button)
      expect(button).toBeDisabled()
      fireEvent.click(button)
      expect(mockedCounterShareImageBlob).toHaveBeenCalledTimes(1)
      await act(async () => {
        resolveBlob(new Blob(['x'], { type: 'image/png' }))
      })
    })

    it("utilise un nom de fichier de secours quand le nom du compteur est vide", async () => {
      vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined })
      mockedCounterShareImageBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
      renderPanel({ name: '' })
      await act(async () => {
        fireEvent.click(screen.getByText('Partager en image'))
      })
      const anchorCall = createElementSpy.mock.results.find(
        (r: { value: unknown }) => (r.value as HTMLElement).tagName === 'A'
      )
      const anchor = anchorCall?.value as HTMLAnchorElement
      expect(anchor.download).toBe('compteur.png')
    })
  })

  describe('duplication', () => {
    it('déclenche la duplication au clic', () => {
      const { onDuplicate } = renderPanel()
      fireEvent.click(screen.getByText('Dupliquer ce compteur'))
      expect(onDuplicate).toHaveBeenCalledTimes(1)
    })

    it('ferme le panneau après duplication', () => {
      const { onClose } = renderPanel()
      fireEvent.click(screen.getByText('Dupliquer ce compteur'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('archivage', () => {
    it('propose d\'archiver un compteur actif', () => {
      renderPanel({ archived: false })
      expect(screen.getByText('Archiver ce compteur')).toBeInTheDocument()
      expect(screen.queryByText('Désarchiver ce compteur')).not.toBeInTheDocument()
    })

    it('propose de désarchiver un compteur déjà archivé', () => {
      renderPanel({ archived: true })
      expect(screen.getByText('Désarchiver ce compteur')).toBeInTheDocument()
      expect(screen.queryByText('Archiver ce compteur')).not.toBeInTheDocument()
    })

    it('déclenche le basculement au clic', () => {
      const { onToggleArchive } = renderPanel({ archived: false })
      fireEvent.click(screen.getByText('Archiver ce compteur'))
      expect(onToggleArchive).toHaveBeenCalledTimes(1)
    })

    it('ferme le panneau après le basculement', () => {
      const { onClose } = renderPanel({ archived: false })
      fireEvent.click(screen.getByText('Archiver ce compteur'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('épinglage', () => {
    it('propose d\'épingler un compteur non épinglé', () => {
      renderPanel({ pinned: false })
      expect(screen.getByText('Épingler en haut')).toBeInTheDocument()
      expect(screen.queryByText('Détacher ce compteur')).not.toBeInTheDocument()
    })

    it('propose de détacher un compteur déjà épinglé', () => {
      renderPanel({ pinned: true })
      expect(screen.getByText('Détacher ce compteur')).toBeInTheDocument()
      expect(screen.queryByText('Épingler en haut')).not.toBeInTheDocument()
    })

    it('déclenche le basculement au clic', () => {
      const { onTogglePin } = renderPanel({ pinned: false })
      fireEvent.click(screen.getByText('Épingler en haut'))
      expect(onTogglePin).toHaveBeenCalledTimes(1)
    })

    it('ferme le panneau après le basculement', () => {
      const { onClose } = renderPanel({ pinned: false })
      fireEvent.click(screen.getByText('Épingler en haut'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('suppression', () => {
    it('affiche la suppression dans une zone de danger séparée', () => {
      renderPanel()
      expect(screen.getByText('Zone de danger')).toBeInTheDocument()
    })

    it('demande une confirmation avant de supprimer', () => {
      const { onDelete } = renderPanel()
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      expect(onDelete).not.toHaveBeenCalled()
      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument()
    })

    it('supprime au second clic de confirmation', () => {
      const { onDelete } = renderPanel()
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      fireEvent.click(screen.getByText('Confirmer la suppression'))
      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('ne revient pas au libellé initial après la confirmation, même après le délai', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      fireEvent.click(screen.getByText('Confirmer la suppression'))
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument()
    })

    it('annule la confirmation après le délai', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2600)
      })
      expect(screen.getByText('Supprimer ce compteur')).toBeInTheDocument()
    })
  })
})
