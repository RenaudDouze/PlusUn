import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { SyncPanel } from './SyncPanel'
import { buildShareUrl } from '../sync'
import type { UseRemoteSyncResult } from '../hooks/useRemoteSync'
import type { Counter } from '../types'

vi.mock('../sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync')>()
  return { ...actual, buildShareUrl: vi.fn(actual.buildShareUrl) }
})

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}))

function makeCounter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'id-1',
    name: 'Compteur 1',
    count: 3,
    createdAt: Date.now(),
    behavior: {},
    appearance: { color: '#2563eb' },
    ...overrides,
  }
}

// La section « Code de synchro » elle-même est testée dans une describe
// dédiée plus bas (avec VITE_SYNC_WORKER_URL simulée) : ce fixture ne sert
// qu'à satisfaire la prop requise des autres tests, qui ne l'exercent pas.
function makeRemoteSync(overrides: Partial<UseRemoteSyncResult> = {}): UseRemoteSyncResult {
  return {
    code: null,
    status: 'disabled',
    errorMessage: null,
    createCode: vi.fn(),
    joinCode: vi.fn(),
    disable: vi.fn(),
    ...overrides,
  }
}

describe('SyncPanel', () => {
  const toDataURLMock = QRCode.toDataURL as unknown as ReturnType<
    typeof vi.fn<(text: string, opts?: unknown) => Promise<string>>
  >

  beforeEach(() => {
    toDataURLMock.mockReset()
    toDataURLMock.mockResolvedValue('data:image/png;base64,fake')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("affiche la version de l'application", () => {
    render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    expect(screen.getByText('Version test')).toBeInTheDocument()
  })

  it('affiche un message quand aucun compteur ne permet de générer de QR code', () => {
    render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    expect(screen.getByText('Ajoute au moins un compteur pour générer un QR code.')).toBeInTheDocument()
    expect(toDataURLMock).not.toHaveBeenCalled()
  })

  it("n'affiche pas le bouton copier le lien sans compteur", () => {
    render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    expect(screen.queryByText('Copier le lien')).not.toBeInTheDocument()
  })

  it('génère et affiche le QR code quand il y a des compteurs', async () => {
    render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    await waitFor(() => {
      expect(screen.getByAltText('QR code de tes compteurs')).toBeInTheDocument()
    })
    const img = screen.getByAltText('QR code de tes compteurs') as HTMLImageElement
    expect(img.src).toBe('data:image/png;base64,fake')
  })

  it('affiche un message explicite si la génération du QR code échoue (trop de données)', async () => {
    toDataURLMock.mockRejectedValue(new Error('code length overflow'))
    render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    await waitFor(() => {
      expect(
        screen.getByText('Trop de compteurs pour un QR code : utilise le code de synchro ou le fichier de sauvegarde.')
      ).toBeInTheDocument()
    })
  })

  it('affiche le bouton copier le lien quand il y a des compteurs', async () => {
    render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    await waitFor(() => expect(screen.getByText('Copier le lien')).toBeInTheDocument())
  })

  it('ferme le panneau avec la touche Échap', () => {
    const onClose = vi.fn()
    render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ignore les autres touches que Échap", () => {
    const onClose = vi.fn()
    render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('se désabonne des touches au démontage', () => {
    const onClose = vi.fn()
    const { unmount } = render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("ferme le panneau au clic sur l'arrière-plan", () => {
    const onClose = vi.fn()
    const { container } = render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    fireEvent.click(container.querySelector('.modal-overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ne ferme pas le panneau au clic à l'intérieur", () => {
    const onClose = vi.fn()
    const { container } = render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    fireEvent.click(container.querySelector('.modal-panel')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ferme le panneau au clic sur la croix', () => {
    const onClose = vi.fn()
    render(<SyncPanel counters={[]} onClose={onClose} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('export', () => {
    it('désactive le bouton exporter sans compteur', () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
    })

    it('exporte les compteurs au clic', async () => {
      const counters = [makeCounter()]
      render(<SyncPanel counters={counters} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      expect(clickSpy).toHaveBeenCalledTimes(1)
      clickSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })
  })

  describe('import', () => {
    it('ouvre le sélecteur de fichier au clic sur Importer', () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
      fireEvent.click(screen.getByRole('button', { name: 'Importer' }))
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it("ne fait rien si aucun fichier n'est sélectionné", async () => {
      const onImport = vi.fn()
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={onImport} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [] } })
      })
      expect(onImport).not.toHaveBeenCalled()
    })

    it('remplace directement quand il n\'y a aucun compteur existant (sans confirmation)', async () => {
      const onImport = vi.fn()
      const onClose = vi.fn()
      const confirmSpy = vi.spyOn(window, 'confirm')
      render(<SyncPanel counters={[]} onClose={onClose} onImport={onImport} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'Importé', count: 5 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(onImport).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Importé' })]), 'replace')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('remplace après confirmation quand des compteurs existent déjà', async () => {
      const onImport = vi.fn()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={onImport} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'Importé', count: 5 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(onImport).toHaveBeenCalledWith(expect.any(Array), 'replace')
    })

    it('fusionne quand la confirmation est refusée', async () => {
      const onImport = vi.fn()
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={onImport} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'Importé', count: 5 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(onImport).toHaveBeenCalledWith(expect.any(Array), 'merge')
    })

    it('affiche une erreur pour un fichier invalide', async () => {
      const onImport = vi.fn()
      const onClose = vi.fn()
      render(<SyncPanel counters={[]} onClose={onClose} onImport={onImport} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['{invalide'], 'backup.json', { type: 'application/json' })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(screen.getByText('Fichier illisible ou invalide.')).toBeInTheDocument()
      expect(onImport).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    it("réinitialise la valeur de l'input après sélection", async () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'A', count: 1 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(input.value).toBe('')
    })
  })

  describe('copie du lien', () => {
    it('copie le lien de partage dans le presse-papiers', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: writeTextMock } })
      render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      await waitFor(() => expect(screen.getByText('Copier le lien')).toBeInTheDocument())
      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'))
      })
      expect(writeTextMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Lien copié ✓')).toBeInTheDocument()
      vi.unstubAllGlobals()
    })

    it('revient au libellé initial après le délai', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: writeTextMock } })
      render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      await waitFor(() => expect(screen.getByText('Copier le lien')).toBeInTheDocument())
      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'))
      })
      expect(screen.getByText('Lien copié ✓')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(2100)
      })
      expect(screen.getByText('Copier le lien')).toBeInTheDocument()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    })

    it('affiche une erreur si la copie échoue', async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error('refusé'))
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: writeTextMock } })
      render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      await waitFor(() => expect(screen.getByText('Copier le lien')).toBeInTheDocument())
      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'))
      })
      expect(
        screen.getByText("Impossible de copier automatiquement, sélectionne le lien manuellement.")
      ).toBeInTheDocument()
      vi.unstubAllGlobals()
    })
  })

  describe('code de synchro', () => {
    it("n'affiche pas la section sans worker de synchro configuré", () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(screen.queryByText('Code de synchro')).not.toBeInTheDocument()
    })

    describe('avec un worker configuré (VITE_SYNC_WORKER_URL)', () => {
      beforeEach(() => {
        vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.example.workers.dev')
      })

      afterEach(() => {
        vi.unstubAllEnvs()
      })

      it('propose de créer ou rejoindre un code quand la synchro est inactive', () => {
        render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
        expect(screen.getByText('Code de synchro')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Nouveau code' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Saisir un code' })).toBeInTheDocument()
      })

      it('déclenche la création au clic sur "Nouveau code"', () => {
        const createCode = vi.fn()
        render(
          <SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync({ createCode })} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Nouveau code' }))
        expect(createCode).toHaveBeenCalledTimes(1)
      })

      it('révèle un champ de saisie au clic sur "Saisir un code"', () => {
        render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        expect(screen.getByPlaceholderText('XXXX XXXX')).toBeInTheDocument()
      })

      it('donne un nom accessible au champ de saisie du code (aria-label)', () => {
        render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        expect(screen.getByLabelText('Code de synchronisation à saisir')).toBeInTheDocument()
      })

      it('désactive "Rejoindre" tant que le champ est vide', () => {
        render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeDisabled()
      })

      it('rejoint le code saisi au clic sur "Rejoindre"', async () => {
        const joinCode = vi.fn().mockResolvedValue('joined')
        render(
          <SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync({ joinCode })} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        fireEvent.change(screen.getByPlaceholderText('XXXX XXXX'), { target: { value: 'abcd efgh' } })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(joinCode).toHaveBeenCalledWith('abcd efgh')
        // Le champ se referme une fois rejoint avec succès.
        expect(screen.queryByPlaceholderText('XXXX XXXX')).not.toBeInTheDocument()
      })

      it('rejoint aussi via la touche Entrée', async () => {
        const joinCode = vi.fn().mockResolvedValue('joined')
        render(
          <SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync({ joinCode })} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        const input = screen.getByPlaceholderText('XXXX XXXX')
        fireEvent.change(input, { target: { value: 'ABCDEFGH' } })
        await act(async () => {
          fireEvent.keyDown(input, { key: 'Enter' })
        })
        expect(joinCode).toHaveBeenCalledWith('ABCDEFGH')
      })

      it('referme le champ de saisie sur Échap', () => {
        render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        const input = screen.getByPlaceholderText('XXXX XXXX')
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(screen.queryByPlaceholderText('XXXX XXXX')).not.toBeInTheDocument()
      })

      it.each([
        ['invalid', 'Code invalide (8 caractères attendus).'],
        ['not-found', 'Ce code de synchronisation est introuvable.'],
        ['error', 'Impossible de rejoindre ce code, réessaie.'],
      ] as const)('affiche une erreur adaptée pour l\'issue "%s"', async (outcome, message) => {
        const joinCode = vi.fn().mockResolvedValue(outcome)
        render(
          <SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync({ joinCode })} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        fireEvent.change(screen.getByPlaceholderText('XXXX XXXX'), { target: { value: 'ABCDEFGH' } })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(screen.getByText(message)).toBeInTheDocument()
        // Le champ reste ouvert pour corriger la saisie.
        expect(screen.getByPlaceholderText('XXXX XXXX')).toBeInTheDocument()
      })

      it("préfère le message d'erreur précis du hook au message générique quand il est disponible", async () => {
        const joinCode = vi.fn().mockResolvedValue('error')
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ joinCode, errorMessage: 'Failed to fetch' })}
          />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        fireEvent.change(screen.getByPlaceholderText('XXXX XXXX'), { target: { value: 'ABCDEFGH' } })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
        expect(screen.queryByText('Impossible de rejoindre ce code, réessaie.')).not.toBeInTheDocument()
      })

      it('affiche l\'échec de "Nouveau code" alors qu\'aucun code n\'est encore actif', () => {
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ status: 'error', errorMessage: 'Impossible de créer un code de synchronisation.' })}
          />
        )
        expect(screen.getByText('Impossible de créer un code de synchronisation.')).toBeInTheDocument()
        // Toujours proposé pour réessayer.
        expect(screen.getByRole('button', { name: 'Nouveau code' })).toBeInTheDocument()
      })

      it('retombe sur le message générique si "Nouveau code" échoue sans détail', () => {
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ status: 'error', errorMessage: null })}
          />
        )
        expect(screen.getByText('Erreur de synchronisation')).toBeInTheDocument()
      })

      it('affiche le code actif, son état "en cours" et permet de se déconnecter', () => {
        const disable = vi.fn()
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ code: 'ABCDEFGH', status: 'syncing', disable })}
          />
        )
        expect(screen.getByText('ABCD EFGH')).toBeInTheDocument()
        expect(screen.getByText('Synchronisation…')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
        expect(disable).toHaveBeenCalledTimes(1)
      })

      it('affiche "Synchronisé" une fois à jour', () => {
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ code: 'ABCDEFGH', status: 'synced' })}
          />
        )
        expect(screen.getByText('Synchronisé ✓')).toBeInTheDocument()
      })

      it("affiche le message d'erreur précis quand il y en a un", () => {
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ code: 'ABCDEFGH', status: 'error', errorMessage: 'Panne réseau' })}
          />
        )
        expect(screen.getByText('Panne réseau')).toBeInTheDocument()
      })

      it("retombe sur un message générique en erreur sans détail", () => {
        render(
          <SyncPanel
            counters={[]}
            onClose={vi.fn()}
            onImport={vi.fn()}
            remoteSync={makeRemoteSync({ code: 'ABCDEFGH', status: 'error', errorMessage: null })}
          />
        )
        expect(screen.getByText('Erreur de synchronisation')).toBeInTheDocument()
      })

      describe('suggestion du code de synchro pour un lien long', () => {
        const manyCounters = Array.from({ length: 20 }, (_, i) => makeCounter({ id: `c${i}`, name: `Compteur ${i}` }))

        it('suggère le code de synchro quand le lien devient long et la synchro est inactive', async () => {
          render(<SyncPanel counters={manyCounters} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
          await waitFor(() => expect(screen.getByAltText('QR code de tes compteurs')).toBeInTheDocument())
          expect(
            screen.getByText('Beaucoup de compteurs : le code de synchro (ci-dessus) reste pratique même quand ce lien devient long.')
          ).toBeInTheDocument()
        })

        it("ne suggère rien pour un lien court (peu de compteurs)", async () => {
          render(<SyncPanel counters={[makeCounter()]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
          await waitFor(() => expect(screen.getByAltText('QR code de tes compteurs')).toBeInTheDocument())
          expect(screen.queryByText(/reste pratique même quand ce lien devient long/)).not.toBeInTheDocument()
        })

        it('ne suggère rien si un code de synchro est déjà actif (rien à suggérer)', async () => {
          render(
            <SyncPanel
              counters={manyCounters}
              onClose={vi.fn()}
              onImport={vi.fn()}
              remoteSync={makeRemoteSync({ code: 'ABCDEFGH' })}
            />
          )
          await waitFor(() => expect(screen.getByAltText('QR code de tes compteurs')).toBeInTheDocument())
          expect(screen.queryByText(/reste pratique même quand ce lien devient long/)).not.toBeInTheDocument()
        })
      })
    })

    it('ne suggère jamais le code de synchro sans worker configuré (rien à proposer)', async () => {
      const manyCounters = Array.from({ length: 20 }, (_, i) => makeCounter({ id: `c${i}`, name: `Compteur ${i}` }))
      render(<SyncPanel counters={manyCounters} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      await waitFor(() => expect(screen.getByAltText('QR code de tes compteurs')).toBeInTheDocument())
      expect(screen.queryByText(/reste pratique même quand ce lien devient long/)).not.toBeInTheDocument()
    })
  })

  describe('accessibilité', () => {
    it('expose le panneau comme une boîte de dialogue modale, nommée par son titre', () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      const panel = screen.getByRole('dialog', { name: 'Synchroniser mes compteurs' })
      expect(panel).toHaveAttribute('aria-modal', 'true')
    })

    it('déplace le focus dans le panneau à l’ouverture (sur son premier élément focusable)', () => {
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
    })

    it('rend le focus à l’élément qui l’avait avant l’ouverture, une fois la modale fermée', () => {
      const trigger = document.createElement('button')
      trigger.textContent = 'Ouvrir'
      document.body.appendChild(trigger)
      trigger.focus()

      const { unmount } = render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(trigger).not.toHaveFocus()

      unmount()
      expect(trigger).toHaveFocus()
      trigger.remove()
    })
  })

  describe('détails de comportement', () => {
    const renderPanel = (props: Partial<Parameters<typeof SyncPanel>[0]> = {}) =>
      render(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} {...props} />)

    it('génère le QR code avec les réglages attendus', async () => {
      renderPanel({ counters: [makeCounter()] })
      await waitFor(() => expect(toDataURLMock).toHaveBeenCalled())
      expect(toDataURLMock).toHaveBeenCalledWith(expect.stringContaining('http'), {
        scale: 6,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
    })

    it('régénère le QR code quand les compteurs changent', async () => {
      const { rerender } = renderPanel({ counters: [makeCounter()] })
      await waitFor(() => expect(toDataURLMock).toHaveBeenCalledTimes(1))
      toDataURLMock.mockResolvedValue('data:image/png;base64,second')
      rerender(
        <SyncPanel counters={[makeCounter({ name: 'Autre' })]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />
      )
      await waitFor(() =>
        expect((screen.getByAltText('QR code de tes compteurs') as HTMLImageElement).src).toBe('data:image/png;base64,second')
      )
      expect(toDataURLMock).toHaveBeenCalledTimes(2)
    })

    it("retire le QR code quand il n'y a plus de compteur", async () => {
      const { rerender } = renderPanel({ counters: [makeCounter()] })
      await screen.findByAltText('QR code de tes compteurs')
      rerender(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(screen.queryByAltText('QR code de tes compteurs')).not.toBeInTheDocument()
      expect(screen.getByText('Ajoute au moins un compteur pour générer un QR code.')).toBeInTheDocument()
    })

    it("efface l'erreur de QR code quand il n'y a plus de compteur", async () => {
      toDataURLMock.mockRejectedValue(new Error('overflow'))
      const { rerender } = renderPanel({ counters: [makeCounter()] })
      await screen.findByText(/Trop de compteurs pour un QR code/)
      rerender(<SyncPanel counters={[]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      expect(screen.queryByText(/Trop de compteurs pour un QR code/)).not.toBeInTheDocument()
      expect(screen.getByText('Ajoute au moins un compteur pour générer un QR code.')).toBeInTheDocument()
    })

    it('retire un QR code précédent quand la génération suivante échoue', async () => {
      const { rerender } = renderPanel({ counters: [makeCounter()] })
      await screen.findByAltText('QR code de tes compteurs')
      toDataURLMock.mockRejectedValue(new Error('overflow'))
      rerender(
        <SyncPanel counters={[makeCounter({ name: 'Autre' })]} onClose={vi.fn()} onImport={vi.fn()} remoteSync={makeRemoteSync()} />
      )
      await screen.findByText(/Trop de compteurs pour un QR code/)
      expect(screen.queryByAltText('QR code de tes compteurs')).not.toBeInTheDocument()
    })

    it('Échap appelle le dernier onClose reçu', () => {
      const first = vi.fn()
      const second = vi.fn()
      const { rerender } = renderPanel({ onClose: first })
      rerender(<SyncPanel counters={[]} onClose={second} onImport={vi.fn()} remoteSync={makeRemoteSync()} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(second).toHaveBeenCalledTimes(1)
      expect(first).not.toHaveBeenCalled()
    })

    it('porte tabindex -1 sur la boîte de dialogue', () => {
      renderPanel()
      expect(screen.getByRole('dialog')).toHaveAttribute('tabindex', '-1')
    })

    it("ne montre ni erreur ni message d'erreur sans erreur", () => {
      renderPanel()
      expect(document.querySelector('.modal-error')).not.toBeInTheDocument()
    })

    it('demande confirmation avec le nombre de compteurs actuels et importés', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      renderPanel({ counters: [makeCounter()] })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'A', count: 1 }, { name: 'B', count: 2 }])], 'b.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(confirmSpy).toHaveBeenCalledWith(
        'Remplacer les 1 compteur(s) actuel(s) par les 2 importé(s) ?\n\nAnnuler pour les ajouter à la place.'
      )
    })

    it("ignore un changement d'input sans liste de fichiers", async () => {
      const onImport = vi.fn()
      renderPanel({ onImport })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: null } })
      })
      expect(onImport).not.toHaveBeenCalled()
    })

    describe('avec un worker configuré', () => {
      beforeEach(() => {
        vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.example.workers.dev')
      })
      afterEach(() => {
        vi.unstubAllEnvs()
      })

      const openJoin = () => {
        fireEvent.click(screen.getByRole('button', { name: 'Saisir un code' }))
        return screen.getByPlaceholderText('XXXX XXXX')
      }

      it("avertit que le code n'est pas un mot de passe", () => {
        renderPanel()
        expect(screen.getByText(/le code n'est pas un mot de passe/)).toBeInTheDocument()
      })

      it("n'avertit pas sans worker configuré", () => {
        vi.unstubAllEnvs()
        vi.stubEnv('VITE_SYNC_WORKER_URL', '')
        renderPanel()
        expect(screen.queryByText(/le code n'est pas un mot de passe/)).not.toBeInTheDocument()
      })

      it("expose l'état de synchro par classe et libellé vide quand désactivé", () => {
        renderPanel({ remoteSync: makeRemoteSync({ code: 'ABCDEFGH', status: 'disabled' }) })
        const status = document.querySelector('.sync-status')
        expect(status?.className).toBe('sync-status sync-status--disabled')
        expect(status?.textContent).toBe('')
      })

      it("n'affiche pas le message d'erreur du hook quand l'état n'est pas en erreur", () => {
        renderPanel({ remoteSync: makeRemoteSync({ code: 'ABCDEFGH', status: 'synced', errorMessage: 'Ancienne panne' }) })
        expect(screen.queryByText('Ancienne panne')).not.toBeInTheDocument()
        expect(screen.getByText('Synchronisé ✓')).toBeInTheDocument()
      })

      it("n'affiche pas d'erreur de création quand l'état n'est pas en erreur", () => {
        renderPanel({ remoteSync: makeRemoteSync({ status: 'synced', errorMessage: 'Ancienne panne' }) })
        expect(screen.queryByText('Ancienne panne')).not.toBeInTheDocument()
        expect(document.querySelector('.modal-error')).not.toBeInTheDocument()
      })

      it('« Rejoindre » reste désactivé pour une saisie faite uniquement d\'espaces', () => {
        renderPanel()
        fireEvent.change(openJoin(), { target: { value: '   ' } })
        expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeDisabled()
      })

      it("Entrée rejoint, mais pas une autre touche", () => {
        const joinCode = vi.fn().mockResolvedValue('invalid')
        renderPanel({ remoteSync: makeRemoteSync({ joinCode }) })
        const input = openJoin()
        fireEvent.change(input, { target: { value: 'ABCDEFGH' } })
        fireEvent.keyDown(input, { key: 'a' })
        expect(joinCode).not.toHaveBeenCalled()
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(joinCode).toHaveBeenCalledWith('ABCDEFGH')
      })

      it('une autre touche que Échap ne referme pas la saisie', () => {
        renderPanel()
        const input = openJoin()
        fireEvent.keyDown(input, { key: 'a' })
        expect(screen.getByPlaceholderText('XXXX XXXX')).toBeInTheDocument()
      })

      it("le message précis du hook n'écrase pas les erreurs « invalide » et « introuvable »", async () => {
        const joinCode = vi.fn().mockResolvedValue('invalid')
        renderPanel({ remoteSync: makeRemoteSync({ joinCode, errorMessage: 'Failed to fetch' }) })
        fireEvent.change(openJoin(), { target: { value: 'ABCDEFGH' } })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(screen.getByText('Code invalide (8 caractères attendus).')).toBeInTheDocument()
        expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument()
      })

      it('une nouvelle tentative réussie efface l\'erreur précédente et vide la saisie', async () => {
        const joinCode = vi.fn().mockResolvedValueOnce('not-found').mockResolvedValueOnce('joined')
        renderPanel({ remoteSync: makeRemoteSync({ joinCode }) })
        fireEvent.change(openJoin(), { target: { value: 'ABCDEFGH' } })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(screen.getByText('Ce code de synchronisation est introuvable.')).toBeInTheDocument()
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
        })
        expect(screen.queryByText('Ce code de synchronisation est introuvable.')).not.toBeInTheDocument()
        // Le champ est refermé puis vidé : rouvert, il n'a plus l'ancienne saisie.
        expect(openJoin()).toHaveValue('')
      })

      it('suggère le code de synchro dès que le lien dépasse 300 caractères (pas à 300 pile)', async () => {
        const buildMock = vi.mocked(buildShareUrl)
        buildMock.mockReturnValue('x'.repeat(300))
        const { unmount } = renderPanel({ counters: [makeCounter()] })
        await screen.findByAltText('QR code de tes compteurs')
        expect(screen.queryByText(/reste pratique même quand ce lien devient long/)).not.toBeInTheDocument()
        unmount()
        buildMock.mockReturnValue('x'.repeat(301))
        renderPanel({ counters: [makeCounter()] })
        await screen.findByAltText('QR code de tes compteurs')
        expect(screen.getByText(/reste pratique même quand ce lien devient long/)).toBeInTheDocument()
        buildMock.mockRestore()
      })
    })
  })
})
