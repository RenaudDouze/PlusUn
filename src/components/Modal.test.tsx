import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <Modal title="Titre du test" onClose={onClose} accentColor="#2563eb" {...props}>
      <p>Contenu</p>
    </Modal>
  )
  return { onClose, ...utils }
}

describe('Modal', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("n'affiche pas le rappel sur la synchro quand aucun worker n'est configuré", () => {
    renderModal()
    expect(screen.queryByText(/Compteurs synchronisés entre appareils/)).not.toBeInTheDocument()
  })

  it('affiche un rappel que la synchro entre appareils n’est pas chiffrée quand un worker est configuré', () => {
    vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.example.workers.dev')
    renderModal()
    expect(screen.getByText(/Compteurs synchronisés entre appareils/)).toBeInTheDocument()
  })

  it('affiche le titre et le contenu', () => {
    renderModal()
    expect(screen.getByText('Titre du test')).toBeInTheDocument()
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it('pose la couleur du compteur en variable CSS --accent sur le panneau', () => {
    renderModal({ accentColor: '#16a34a' })
    const panel = document.querySelector('.modal-panel') as HTMLElement
    expect(panel.style.getPropertyValue('--accent')).toBe('#16a34a')
  })

  it('ferme au clic sur la croix', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ferme au clic sur l'arrière-plan", () => {
    // Le panneau est monté via un portail dans document.body : le conteneur
    // de rendu de RTL ne le contient pas, il faut interroger le document.
    const { onClose } = renderModal()
    fireEvent.click(document.querySelector('.modal-overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ne ferme pas au clic à l'intérieur du panneau", () => {
    const { onClose } = renderModal()
    fireEvent.click(document.querySelector('.modal-panel')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("un pointerdown à l'intérieur du panneau ne remonte pas plus haut dans le document (le panneau est un portail : sans ce blocage, il atteindrait quand même le suivi de tap de la carte via l'arbre React)", () => {
    const outerHandler = vi.fn()
    document.addEventListener('pointerdown', outerHandler)
    renderModal()
    fireEvent.pointerDown(document.querySelector('.modal-panel')!)
    document.removeEventListener('pointerdown', outerHandler)
    expect(outerHandler).not.toHaveBeenCalled()
  })

  it("un pointerdown sur l'arrière-plan du panneau ne remonte pas plus haut dans le document", () => {
    const outerHandler = vi.fn()
    document.addEventListener('pointerdown', outerHandler)
    renderModal()
    fireEvent.pointerDown(document.querySelector('.modal-overlay')!)
    document.removeEventListener('pointerdown', outerHandler)
    expect(outerHandler).not.toHaveBeenCalled()
  })

  it('ferme avec la touche Échap', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("n'écoute plus Échap après démontage", () => {
    const { onClose, unmount } = renderModal()
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  describe('accessibilité', () => {
    it('expose le panneau comme une boîte de dialogue modale, nommée par son titre', () => {
      renderModal({ title: 'Un titre précis' })
      const panel = screen.getByRole('dialog', { name: 'Un titre précis' })
      expect(panel).toHaveAttribute('aria-modal', 'true')
    })

    it('déplace le focus dans le panneau à l’ouverture (sur son premier élément focusable)', () => {
      renderModal()
      expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
    })

    it('rend le focus à l’élément qui l’avait avant l’ouverture, une fois la modale fermée', () => {
      const trigger = document.createElement('button')
      trigger.textContent = 'Ouvrir'
      document.body.appendChild(trigger)
      trigger.focus()

      const { unmount } = renderModal()
      expect(trigger).not.toHaveFocus()

      unmount()
      expect(trigger).toHaveFocus()
      trigger.remove()
    })
  })
})
