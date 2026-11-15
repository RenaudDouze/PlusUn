import { useId, useState } from 'react'
import { cumulativeOdds, formatOdds, formatRemainingAttempts, formatConstantChanceReminder, progressRatio } from '../odds'
import { daysBetween, formatAveragePerDay, formatDuration, formatStartDate, toIsoDate, todayIsoDate } from '../date'
import { usePositiveIntField } from '../hooks/usePositiveIntField'
import { Modal } from './Modal'
import { PanelNav } from './PanelNav'
import type { PanelKind } from './PanelNav'
import type { Counter } from '../types'

interface CounterBehaviorSettingsPanelProps {
  counter: Counter
  onClose: () => void
  onUpdate: (patch: Partial<Counter>) => void
  onSetCount: (count: number) => void
  onNavigate: (panel: PanelKind) => void
}

export function CounterBehaviorSettingsPanel({
  counter,
  onClose,
  onUpdate,
  onSetCount,
  onNavigate,
}: CounterBehaviorSettingsPanelProps) {
  const startDate = counter.behavior.startDate ?? toIsoDate(counter.createdAt)

  // Chaque champ n'a qu'un <h3> visuel comme repère : ces id le relient à son
  // input via aria-labelledby, pour un nom accessible exploitable par un
  // lecteur d'écran qui navigue directement de champ en champ (sans lire le
  // reste de la modale autour).
  const valueLabelId = useId()
  const stepLabelId = useId()
  const targetLabelId = useId()
  const oddsLabelId = useId()
  const oddsPrefixId = useId()
  const startDateLabelId = useId()

  const [draftCount, setDraftCount] = useState(counter.count.toString())
  const [countError, setCountError] = useState<string | null>(null)

  const commitCount = () => {
    const trimmed = draftCount.trim()
    // N'accepte que des chiffres (et un signe moins optionnel) : une saisie
    // comme "abd7" doit être rejetée, pas silencieusement réduite à "7".
    if (!/^-?\d+$/.test(trimmed)) {
      setCountError('Nombre entier requis.')
      return
    }
    // Pas de setCountError(null) ici : l'erreur n'existe qu'après un commit
    // invalide, et toute modification de la saisie l'efface déjà (onChange).
    onSetCount(parseInt(trimmed, 10))
  }

  const stepField = usePositiveIntField(counter.behavior.step, (step) =>
    onUpdate({ behavior: { ...counter.behavior, step } })
  )
  const targetField = usePositiveIntField(counter.behavior.target, (target) =>
    onUpdate({ behavior: { ...counter.behavior, target } })
  )
  const oddsField = usePositiveIntField(counter.behavior.oddsDenominator, (oddsDenominator) =>
    onUpdate({ behavior: { ...counter.behavior, oddsDenominator } })
  )
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [startDateError, setStartDateError] = useState<string | null>(null)

  const handleStartDateChange = (value: string) => {
    setDraftStartDate(value)
    if (value === '') {
      setStartDateError(null)
      onUpdate({ behavior: { ...counter.behavior, startDate: undefined } })
    } else if (value > todayIsoDate()) {
      // Bloqué en pratique par `max` sur le sélecteur natif, mais gardé en
      // filet de sécurité (saisie clavier manuelle selon le navigateur).
      setStartDateError('La date ne peut pas être dans le futur.')
    } else {
      setStartDateError(null)
      onUpdate({ behavior: { ...counter.behavior, startDate: value } })
    }
  }

  const denominator = counter.behavior.oddsDenominator
  const odds = denominator ? cumulativeOdds(denominator, counter.count) : null
  const target = counter.behavior.target
  const targetProgress = progressRatio(counter.count, target)
  const oddsProgress = progressRatio(counter.count, denominator)
  const locked = !!counter.archived

  return (
    <Modal title={`Valeur & réglages « ${counter.name} »`} onClose={onClose} accentColor={counter.appearance.color}>
      {locked && (
        <p className="modal-hint modal-hint--locked">
          🔒 Compteur archivé : lecture seule. Désarchive-le pour le modifier.
        </p>
      )}

      <section className="modal-section">
        <h3 id={valueLabelId}>Valeur actuelle</h3>
        <input
          className="modal-input"
          inputMode="numeric"
          pattern="-?[0-9]*"
          disabled={locked}
          aria-labelledby={valueLabelId}
          aria-invalid={countError !== null}
          value={draftCount}
          onChange={(e) => {
            setDraftCount(e.target.value)
            setCountError(null)
          }}
          onBlur={commitCount}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitCount()
          }}
        />
        {countError && <p className="modal-error">{countError}</p>}
      </section>

      <section className="modal-section">
        <h3 id={stepLabelId}>Pas d'incrément</h3>
        <input
          className="modal-input modal-input--odds"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={locked}
          aria-labelledby={stepLabelId}
          aria-invalid={stepField.error !== null}
          value={stepField.value}
          placeholder="1"
          onChange={stepField.onChange}
          onBlur={stepField.onBlur}
          onKeyDown={stepField.onKeyDown}
        />
        {stepField.error && <p className="modal-error">{stepField.error}</p>}
        <p className="modal-hint">
          +{counter.behavior.step ?? 1} / −{counter.behavior.step ?? 1} à chaque appui
        </p>
      </section>

      <section className="modal-section">
        <h3 id={targetLabelId}>Objectif</h3>
        <input
          className="modal-input modal-input--odds"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={locked}
          aria-labelledby={targetLabelId}
          aria-invalid={targetField.error !== null}
          value={targetField.value}
          placeholder="ex : 50"
          onChange={targetField.onChange}
          onBlur={targetField.onBlur}
          onKeyDown={targetField.onKeyDown}
        />
        {targetField.error && <p className="modal-error">{targetField.error}</p>}
        {target !== undefined && (
          <>
            <div
              className="odds-progress"
              role="progressbar"
              aria-valuenow={Math.round(targetProgress! * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progression vers l'objectif"
            >
              <div className="odds-progress-fill" style={{ width: `${targetProgress! * 100}%` }} />
            </div>
            <p className="modal-hint">
              {counter.count.toLocaleString('fr-FR')} / {target.toLocaleString('fr-FR')} (
              {Math.round(targetProgress! * 100)} %)
            </p>
          </>
        )}
      </section>

      <section className="modal-section">
        <h3 id={oddsLabelId}>Probabilité</h3>
        <div className="modal-row">
          <span id={oddsPrefixId}>1 chance sur</span>
          <input
            className="modal-input modal-input--odds"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={locked}
            aria-labelledby={`${oddsLabelId} ${oddsPrefixId}`}
            aria-invalid={oddsField.error !== null}
            value={oddsField.value}
            placeholder="4096"
            onChange={oddsField.onChange}
            onBlur={oddsField.onBlur}
            onKeyDown={oddsField.onKeyDown}
          />
        </div>
        {oddsField.error && <p className="modal-error">{oddsField.error}</p>}
        {denominator !== undefined && (
          <>
            <p className="modal-hint">{formatOdds(odds!)} de chances de l'avoir obtenu avant ce stade</p>
            <p className="modal-hint">
              {formatOdds(1 - odds!)} de chances de ne toujours pas l'avoir obtenu (autant d'échecs d'affilée)
            </p>
            <div
              className="odds-progress"
              role="progressbar"
              aria-valuenow={Math.round(oddsProgress! * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progression vers le nombre moyen de tentatives"
            >
              <div className="odds-progress-fill" style={{ width: `${oddsProgress! * 100}%` }} />
            </div>
            <p className="modal-hint">{formatRemainingAttempts(denominator, counter.count)}</p>
            <p className="modal-hint modal-hint--reminder">💡 {formatConstantChanceReminder(denominator)}</p>
          </>
        )}
      </section>

      <section className="modal-section">
        <h3 id={startDateLabelId}>Date de début</h3>
        <input
          type="date"
          className="modal-input"
          disabled={locked}
          aria-labelledby={startDateLabelId}
          aria-invalid={startDateError !== null}
          value={draftStartDate}
          max={todayIsoDate()}
          onChange={(e) => handleStartDateChange(e.target.value)}
        />
        {startDateError && <p className="modal-error">{startDateError}</p>}
        {locked && counter.archivedAt !== undefined ? (
          <>
            <p className="modal-hint">{formatDuration(startDate, toIsoDate(counter.archivedAt))}</p>
            <p className="modal-hint">
              Moyenne : {formatAveragePerDay(counter.count, daysBetween(startDate, toIsoDate(counter.archivedAt)))}
            </p>
          </>
        ) : (
          <p className="modal-hint">{formatStartDate(startDate)}</p>
        )}
      </section>

      <PanelNav current="comportement" onNavigate={onNavigate} />
    </Modal>
  )
}
