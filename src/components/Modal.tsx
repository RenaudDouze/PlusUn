import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ModalProps {
  title: string
  onClose: () => void
  accentColor: string
  children: React.ReactNode
}

/** Coquille commune à toutes les modales de la carte (portail, superposition,
 * fermeture au clic hors panneau/à Échap, en-tête avec titre + croix, focus
 * piégé dans le panneau tant qu'elle reste ouverte). */
export function Modal({ title, onClose, accentColor, children }: ModalProps) {
  const titleId = useId()
  const panelRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Le panneau est monté dans un portail (document.body), donc en
          dehors de la carte dans le DOM réel : mais React fait toujours
          remonter les évènements le long de l'arbre React (pas du DOM), donc
          sans ce blocage, un pointerdown/up sur un bouton du panneau (ex:
          "Fermer") atteindrait quand même le suivi de tap de la carte et
          l'incrémenterait à tort. */}
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Le panneau est un portail hors de la carte : il n'hérite pas de la
        // variable --accent posée sur `.counter-card`. Les aperçus de style
        // (anneau, pastille) et le pourcentage en dépendent pour refléter la
        // couleur réelle de ce compteur.
        style={{ '--accent': accentColor } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer" title="Fermer">
            <CloseIcon />
          </button>
        </div>

        {/* Visible sur les 3 modales du compteur (via cette coquille commune),
            pas seulement dans le panneau Synchroniser : ce que fait la
            synchro n'est pas forcément évident depuis une modale de compteur
            qui n'en parle pas explicitement. */}
        {import.meta.env.VITE_SYNC_WORKER_URL && (
          <p className="modal-hint modal-hint--locked">
            ⚠️ Compteurs synchronisés entre appareils : le code n'est pas un mot de passe, quiconque le connaît peut
            les lire et les modifier — évite d'y mettre des données sensibles ou privées.
          </p>
        )}

        {children}
      </div>
    </div>,
    document.body
  )
}
