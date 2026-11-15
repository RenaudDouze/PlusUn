import { useId, useState } from 'react'
import { isValidImageUrl } from '../url'
import { sanitizeCounterName } from '../counterName'
import { CounterValueDisplay } from './CounterValueDisplay'
import { DISPLAY_STYLES } from '../displayStyles'
import { Modal } from './Modal'
import { PanelNav } from './PanelNav'
import { CloseIcon } from './icons'
import type { PanelKind } from './PanelNav'
import type { Counter, DisplayStyle } from '../types'

interface CounterSettingsPanelProps {
  counter: Counter
  colors: string[]
  onClose: () => void
  onUpdate: (patch: Partial<Counter>) => void
  onNavigate: (panel: PanelKind) => void
}

export function CounterSettingsPanel({ counter, colors, onClose, onUpdate, onNavigate }: CounterSettingsPanelProps) {
  // Relie chaque champ à son <h3> visuel via aria-labelledby : sans ça, un
  // lecteur d'écran qui navigue directement de champ en champ n'a aucun nom
  // accessible pour ces deux inputs.
  const nameLabelId = useId()
  const backgroundLabelId = useId()

  const [draftName, setDraftName] = useState(counter.name)
  const [draftBackground, setDraftBackground] = useState(counter.appearance.backgroundImageUrl ?? '')
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  const commitName = () => {
    const trimmed = sanitizeCounterName(draftName)
    setDraftName(trimmed)
    onUpdate({ name: trimmed })
  }

  const commitBackground = () => {
    // Pas de trim() : un <input type="url"> retire déjà les espaces de bord
    // (assainissement de la valeur par le navigateur).
    const url = draftBackground
    // Pas de setBackgroundError(null) ici : une erreur n'existe qu'après un
    // commit invalide, et toute modification de la saisie l'efface déjà (onChange).
    if (!url) {
      onUpdate({ appearance: { ...counter.appearance, backgroundImageUrl: undefined } })
    } else if (isValidImageUrl(url)) {
      onUpdate({ appearance: { ...counter.appearance, backgroundImageUrl: url } })
    } else {
      setBackgroundError('URL http(s) invalide.')
    }
  }

  const clearBackground = () => {
    setDraftBackground('')
    setBackgroundError(null)
    onUpdate({ appearance: { ...counter.appearance, backgroundImageUrl: undefined } })
  }

  const activeStyle: DisplayStyle = counter.appearance.displayStyle ?? 'default'
  const locked = !!counter.archived

  return (
    <Modal title={`Personnaliser « ${counter.name} »`} onClose={onClose} accentColor={counter.appearance.color}>
      {locked && (
        <p className="modal-hint modal-hint--locked">
          🔒 Compteur archivé : lecture seule. Désarchive-le pour le modifier.
        </p>
      )}

      <section className="modal-section">
        <h3 id={nameLabelId}>Nom</h3>
        <input
          type="text"
          className="modal-input"
          disabled={locked}
          aria-labelledby={nameLabelId}
          value={draftName}
          maxLength={40}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
          }}
        />
      </section>

      <section className="modal-section">
        <h3>Couleur</h3>
        <div className="settings-color-grid">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              disabled={locked}
              className={`counter-color-option${c === counter.appearance.color ? ' selected' : ''}`}
              style={{ background: c }}
              aria-label={`Choisir la couleur ${c}`}
              aria-pressed={c === counter.appearance.color}
              title={`Choisir la couleur ${c}`}
              onClick={() => onUpdate({ appearance: { ...counter.appearance, color: c } })}
            />
          ))}
        </div>
      </section>

      <section className="modal-section">
        <h3>Style d'affichage</h3>
        <div className="display-style-grid">
          {DISPLAY_STYLES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={locked}
              className={`display-style-option${opt.id === activeStyle ? ' selected' : ''}`}
              aria-label={`Choisir le style ${opt.label}`}
              aria-pressed={opt.id === activeStyle}
              onClick={() =>
                onUpdate({ appearance: { ...counter.appearance, displayStyle: opt.id === 'default' ? undefined : opt.id } })
              }
            >
              <span className="display-style-preview">
                <CounterValueDisplay value={8} direction={1} style={opt.id} progress={0.6} />
              </span>
              <span className="display-style-name">{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="modal-section">
        <h3 id={backgroundLabelId}>Image de fond</h3>
        <div className="modal-row">
          <input
            type="url"
            inputMode="url"
            className="modal-input"
            disabled={locked}
            aria-labelledby={backgroundLabelId}
            aria-invalid={backgroundError !== null}
            value={draftBackground}
            placeholder="https://exemple.com/image.jpg"
            onChange={(e) => {
              setDraftBackground(e.target.value)
              setBackgroundError(null)
            }}
            onBlur={commitBackground}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitBackground()
            }}
          />
          {draftBackground !== '' && (
            <button
              className="modal-close"
              disabled={locked}
              onClick={clearBackground}
              aria-label="Vider l'image de fond"
              title="Vider l'image de fond"
            >
              <CloseIcon width={14} height={14} />
            </button>
          )}
        </div>
        {backgroundError && <p className="modal-error">{backgroundError}</p>}
      </section>

      <PanelNav current="personnalisation" onNavigate={onNavigate} />
    </Modal>
  )
}
