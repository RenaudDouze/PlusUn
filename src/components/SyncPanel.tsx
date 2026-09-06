import { useEffect, useId, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { buildShareUrl, downloadBackup, parseBackupJson } from '../sync'
import { formatSyncCode } from '../remoteSync'
import { CloseIcon } from './icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { UseRemoteSyncResult } from '../hooks/useRemoteSync'
import type { Counter } from '../types'

interface SyncPanelProps {
  counters: Counter[]
  onClose: () => void
  onImport: (counters: Counter[], mode: 'replace' | 'merge') => void
  remoteSync: UseRemoteSyncResult
}

const REMOTE_STATUS_LABEL: Record<UseRemoteSyncResult['status'], string> = {
  disabled: '',
  syncing: 'Synchronisation…',
  synced: 'Synchronisé ✓',
  error: 'Erreur de synchronisation',
}

const JOIN_OUTCOME_ERROR: Record<'invalid' | 'not-found' | 'error', string> = {
  invalid: 'Code invalide (8 caractères attendus).',
  'not-found': 'Ce code de synchronisation est introuvable.',
  error: 'Impossible de rejoindre ce code, réessaie.',
}

// Repère "ça devient long à coller dans un message" (bien avant la capacité
// maximale d'un QR code, ~2,9 Ko) : au-delà, le code de synchro — un simple
// code à 8 caractères, sans lien à recopier — reste pratique là où le lien ne
// l'est déjà plus.
const SHARE_URL_LONG_THRESHOLD = 300

export function SyncPanel({ counters, onClose, onImport, remoteSync }: SyncPanelProps) {
  const titleId = useId()
  const panelRef = useFocusTrap<HTMLDivElement>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  // oxlint-disable react/set-state-in-effect -- synchronise avec la
  // génération asynchrone du QR code (dépend de `counters`, ne peut pas être
  // dérivé pendant le rendu).
  useEffect(() => {
    if (counters.length === 0) {
      setQrDataUrl(null)
      setQrError(null)
      return
    }
    const url = buildShareUrl(counters)
    setShareUrl(url)
    // `scale` (pixels par module) plutôt qu'un `width` fixe : un lien plus
    // long (beaucoup de compteurs) produit un QR code à plus de modules, qui
    // grandit en conséquence pour rester scannable, au lieu d'être compressé
    // dans une image de taille constante (modules devenant illisibles).
    QRCode.toDataURL(url, { scale: 6, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl)
        setQrError(null)
      })
      .catch(() => {
        // Dépassement de la capacité maximale d'un QR code (~2,9 Ko) : au-delà,
        // pas de version qui l'encode. Message explicite plutôt que de
        // réutiliser par erreur celui de la liste vide.
        setQrDataUrl(null)
        setQrError('Trop de compteurs pour un QR code : utilise le code de synchro ou le fichier de sauvegarde.')
      })
  }, [counters])
  // oxlint-enable react/set-state-in-effect

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleFileChosen = async (file: File) => {
    setError(null)
    const text = await file.text()
    const imported = parseBackupJson(text)
    if (!imported) {
      setError('Fichier illisible ou invalide.')
      return
    }
    const mode =
      counters.length === 0 || window.confirm(`Remplacer les ${counters.length} compteur(s) actuel(s) par les ${imported.length} importé(s) ?\n\nAnnuler pour les ajouter à la place.`)
        ? 'replace'
        : 'merge'
    onImport(imported, mode)
    onClose()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Impossible de copier automatiquement, sélectionne le lien manuellement.")
    }
  }

  const handleJoinCode = async () => {
    setJoinError(null)
    const outcome = await remoteSync.joinCode(joinInput)
    if (outcome === 'joined') {
      setJoinOpen(false)
      setJoinInput('')
      return
    }
    setJoinError(outcome === 'error' && remoteSync.errorMessage ? remoteSync.errorMessage : JOIN_OUTCOME_ERROR[outcome])
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h2 id={titleId}>Synchroniser mes compteurs</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer" title="Fermer">
            <CloseIcon />
          </button>
        </div>

        {import.meta.env.VITE_SYNC_WORKER_URL && (
          <section className="modal-section">
            <h3>Code de synchro</h3>
            {remoteSync.code ? (
              <>
                <p className="sync-code">{formatSyncCode(remoteSync.code)}</p>
                <p className={`sync-status sync-status--${remoteSync.status}`} aria-live="polite" aria-atomic="true">
                  {remoteSync.status === 'error' && remoteSync.errorMessage
                    ? remoteSync.errorMessage
                    : REMOTE_STATUS_LABEL[remoteSync.status]}
                </p>
                <button className="modal-btn" onClick={remoteSync.disable}>
                  Se déconnecter
                </button>
              </>
            ) : joinOpen ? (
              <div className="modal-row">
                <input
                  autoFocus
                  className="modal-input"
                  aria-label="Code de synchronisation à saisir"
                  placeholder="XXXX XXXX"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinCode()
                    if (e.key === 'Escape') setJoinOpen(false)
                  }}
                />
                <button className="modal-btn" onClick={handleJoinCode} disabled={joinInput.trim() === ''}>
                  Rejoindre
                </button>
              </div>
            ) : (
              <>
                <p className="modal-hint">
                  Synchronise automatiquement tes compteurs avec un autre appareil, sans compte : génère un code sur
                  le premier, saisis-le sur le second. Le code n'est pas un mot de passe : quiconque le connaît peut
                  lire et modifier les compteurs synchronisés — évite d'y mettre des informations sensibles ou
                  privées.
                </p>
                <div className="modal-row">
                  <button className="modal-btn" onClick={() => remoteSync.createCode()}>
                    Nouveau code
                  </button>
                  <button className="modal-btn" onClick={() => setJoinOpen(true)}>
                    Saisir un code
                  </button>
                </div>
                {remoteSync.status === 'error' && (
                  <p className="modal-error">{remoteSync.errorMessage ?? REMOTE_STATUS_LABEL.error}</p>
                )}
              </>
            )}
            {joinError && <p className="modal-error">{joinError}</p>}
          </section>
        )}

        <section className="modal-section">
          <h3>Vers un autre appareil</h3>
          <p className="modal-hint">
            Scanne ce QR code depuis l'autre appareil (appareil photo ou navigateur), ou copie le lien.
          </p>
          {qrDataUrl ? (
            <img className="sync-qr" src={qrDataUrl} alt="QR code de tes compteurs" />
          ) : (
            <p className="modal-hint">
              {qrError ?? 'Ajoute au moins un compteur pour générer un QR code.'}
            </p>
          )}
          {qrDataUrl &&
            !remoteSync.code &&
            import.meta.env.VITE_SYNC_WORKER_URL &&
            shareUrl.length > SHARE_URL_LONG_THRESHOLD && (
              <p className="modal-hint">
                Beaucoup de compteurs : le code de synchro (ci-dessus) reste pratique même quand ce lien devient long.
              </p>
            )}
          {shareUrl && (
            <button className="modal-btn" onClick={copyLink} aria-live="polite" aria-atomic="true">
              {copied ? 'Lien copié ✓' : 'Copier le lien'}
            </button>
          )}
        </section>

        <section className="modal-section">
          <h3>Fichier de sauvegarde</h3>
          <div className="modal-row">
            <button className="modal-btn" onClick={() => downloadBackup(counters)} disabled={counters.length === 0}>
              Exporter
            </button>
            <button className="modal-btn" onClick={() => fileInputRef.current?.click()}>
              Importer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileChosen(file)
                e.target.value = ''
              }}
            />
          </div>
        </section>

        {error && <p className="modal-error">{error}</p>}

        <p className="sync-version">Version {__APP_VERSION__}</p>
      </div>
    </div>
  )
}
