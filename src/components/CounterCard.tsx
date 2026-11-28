import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { motion, Reorder, useAnimationControls, useDragControls } from 'framer-motion'
import { CounterValueDisplay } from './CounterValueDisplay'
import { CounterSettingsPanel } from './CounterSettingsPanel'
import { CounterBehaviorSettingsPanel } from './CounterBehaviorSettingsPanel'
import { CounterActionsPanel } from './CounterActionsPanel'
import { DragHandleIcon, GearIcon, MoreIcon, PinIcon, SlidersIcon } from './icons'
import type { IconProps } from './icons'
import type { PanelKind } from './PanelNav'
import { useHoldToRepeat } from '../hooks/useHoldToRepeat'
import { useTapGesture } from '../hooks/useTapGesture'
import { useFillFontSize } from '../hooks/useFillFontSize'
import { useCelebration } from '../hooks/useCelebration'
import { cumulativeOdds, formatOdds, progressRatio } from '../odds'
import { daysBetween, formatAveragePerDay, formatDuration, toIsoDate } from '../date'
import { playDecrementSound, playIncrementSound } from '../sound'
import { showLocalNotification } from '../notifications'
import { sanitizeCounterName } from '../counterName'
import { CARD_MOTION, PULSE_ANIMATION } from './counterCardMotion'
import type { Counter } from '../types'

// Angles (en degrés) des particules du confetti, réparties en éventail sur
// un demi-cercle plutôt qu'un cercle complet : le bas de la carte contient
// souvent les boutons +/-, un confetti y retomberait dessus sans y être vu.
const CONFETTI_ANGLES = [-90, -65, -40, -15, 15, 40, 65, 90, -110, 110]
const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

// Icônes d'accès direct aux 3 modales, dans leur ordre d'affichage.
const PANEL_BUTTONS: { panel: PanelKind; className: string; label: string; title: string; icon: ComponentType<IconProps> }[] = [
  {
    panel: 'comportement',
    className: 'counter-behavior-btn',
    label: 'Régler le comportement du compteur',
    title: "Pas d'incrément, objectif, probabilité, date de début, partage, duplication",
    icon: SlidersIcon,
  },
  {
    panel: 'personnalisation',
    className: 'counter-settings-btn',
    label: 'Personnaliser le compteur',
    title: "Nom, couleur, style d'affichage, image de fond",
    icon: GearIcon,
  },
  {
    panel: 'actions',
    className: 'counter-actions-btn',
    label: 'Actions du compteur',
    title: 'Partager, dupliquer, supprimer',
    icon: MoreIcon,
  },
]

interface CounterCardProps {
  counter: Counter
  fill?: boolean
  // Ouvre directement le champ de nom en édition : pour le compteur qui
  // vient d'être créé, dont le nom par défaut ("Compteur N") n'est sinon pas
  // évident à renommer sans découvrir qu'on peut toucher le titre.
  autoEdit?: boolean
  colors: string[]
  onChange: (delta: number) => void
  onSetCount: (count: number) => void
  // Point d'entrée commun à tous les réglages simples qui ne font que
  // remplacer un ou plusieurs champs (nom, couleur, pas, objectif...),
  // relayé tel quel aux panneaux de réglages qui en ont besoin.
  onUpdate: (patch: Partial<Counter>) => void
  onDuplicate: () => void
  onToggleArchive: () => void
  onTogglePin: () => void
  onDelete: () => void
  // Équivalent clavier au glisser-déposer (souris/tactile uniquement) :
  // échange le compteur avec son voisin dans le sens donné.
  onMove: (direction: 1 | -1) => void
}

export function CounterCard({
  counter,
  fill = false,
  autoEdit = false,
  colors,
  onChange,
  onSetCount,
  onUpdate,
  onDuplicate,
  onToggleArchive,
  onTogglePin,
  onDelete,
  onMove,
}: CounterCardProps) {
  const [editing, setEditing] = useState(autoEdit)
  const [draftName, setDraftName] = useState(counter.name)
  // 3 modales distinctes : la personnalisation de l'apparence (couleur,
  // style, image de fond), le comportement du compteur (pas d'incrément,
  // objectif, probabilité, date de début, valeur actuelle), et les actions
  // (partage, duplication). Chacune peut naviguer vers les 2 autres.
  const [openPanel, setOpenPanel] = useState<PanelKind | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const pulseControls = useAnimationControls()
  const isFirstCount = useRef(true)
  const dragControls = useDragControls()

  // Un compteur archivé est en lecture seule : le comptage, le renommage et
  // le glisser-déposer sont bloqués (seuls désarchiver, dupliquer et
  // supprimer, dans la modale Actions, restent possibles).
  const locked = !!counter.archived

  // `sign` indique juste le sens (+1/-1) : l'amplitude réelle appliquée est
  // le pas personnalisable du compteur (par défaut 1). Unique point d'entrée
  // du comptage (tap, clic, +/-, clavier, rafale) : bloquer ici suffit à
  // verrouiller un compteur archivé partout à la fois.
  const bump = (sign: 1 | -1) => {
    if (locked) return
    setDirection(sign)
    // Absent sur la plupart des navigateurs desktop et sur iOS Safari :
    // l'appel optionnel évite une erreur silencieuse, le retour haptique
    // est un bonus, pas un pré-requis.
    navigator.vibrate?.(15)
    onChange(sign * (counter.behavior.step ?? 1))
  }

  const { startHold, stopHold, longPressFiredRef } = useHoldToRepeat(bump)
  // Partagé entre le relâchement souris/tactile (onClick, après un
  // pointerup) et le relâchement clavier (onKeyUp) : un tap bref applique
  // l'incrément, un relâchement qui suit une rafale ne l'applique pas une
  // fois de plus (déjà appliquée en boucle par useHoldToRepeat).
  const handleRelease = (sign: 1 | -1) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    bump(sign)
  }
  const {
    onPointerDown: handleCardPointerDown,
    onPointerUp: handleCardPointerUp,
    onPointerCancel: handleCardPointerCancel,
    onClick: handleCardClick,
  } = useTapGesture(bump)

  const commitName = () => {
    onUpdate({ name: sanitizeCounterName(draftName) })
    setEditing(false)
  }

  // La modale Valeur & réglages porte elle-même la validation/saisie ; ce
  // point d'entrée ne fait qu'ajouter la mise à jour de `direction`, propre à
  // l'animation de la carte (sens du défilement de l'odomètre).
  const handleSetCount = (newCount: number) => {
    setDirection(newCount >= counter.count ? 1 : -1)
    onSetCount(newCount)
  }

  // Quand il n'y a qu'1 ou 2 compteurs, on mesure l'espace réellement
  // disponible pour afficher le chiffre le plus grand possible, sans le
  // faire déborder ni en hauteur ni en largeur (nombre de chiffres compris).
  // Réglé spécifiquement pour les proportions de l'odomètre : les autres
  // styles s'appuient plutôt sur les tailles CSS par mode de grille (elles
  // s'expriment en `em`, donc elles suivent quand même l'espace disponible).
  const isDefaultStyle = !counter.appearance.displayStyle || counter.appearance.displayStyle === 'default'
  const { ref: valueRef, fontSize: fillFontSize } = useFillFontSize(fill && isDefaultStyle, counter.count)

  // Petit rebond élastique à chaque incrément/décrément, en plus du
  // défilement des chiffres. N'anime que `scale` (accéléré par le
  // compositeur) : une version précédente animait aussi `filter`
  // (drop-shadow/brightness), qui force un repaint à chaque frame et
  // causait des lags visibles sur les appareils moins puissants, en plus
  // du texte à dégradé déjà coûteux à peindre.
  // Réservé au style par défaut : chaque autre style a sa propre animation
  // de changement (voir CounterValueDisplay), un rebond supplémentaire ici
  // se superposerait à la sienne au lieu de la remplacer. `isDefaultStyle`
  // est volontairement absent des dépendances : un changement de style seul
  // (sans changement de compteur) ne doit pas déclencher de rebond.
  //
  // Le son, lui, se joue quel que soit le style : cet effet ne se déclenche
  // qu'après que React a posé la nouvelle valeur à l'écran (jamais au clic
  // lui-même).
  useEffect(() => {
    if (isFirstCount.current) {
      isFirstCount.current = false
      return
    }
    if (direction === 1) playIncrementSound()
    else playDecrementSound()
    if (!isDefaultStyle) return
    pulseControls.start(PULSE_ANIMATION)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counter.count, pulseControls])

  const celebrating = useCelebration(counter.count, counter.behavior.target)
  // Complète les confettis (invisibles si l'onglet n'est pas au premier
  // plan) par une notification système — voir notifications.ts pour les
  // conditions (permission déjà accordée, onglet effectivement en
  // arrière-plan).
  useEffect(() => {
    if (celebrating) void showLocalNotification('PlusUn', { body: `Objectif atteint pour « ${counter.name} » 🎉` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrating])

  const odds = counter.behavior.oddsDenominator ? cumulativeOdds(counter.behavior.oddsDenominator, counter.count) : null
  // Durée figée et moyenne d'incrément par jour entre le début du comptage
  // et l'archivage. `archivedAt` absent (compteur archivé avant l'ajout de
  // ce champ) : pas de stats affichées plutôt que des valeurs devinées.
  const archivedStartIso = counter.behavior.startDate ?? toIsoDate(counter.createdAt)
  const archivedEndIso = counter.archivedAt !== undefined ? toIsoDate(counter.archivedAt) : null
  const archivedStats =
    counter.archived && archivedEndIso !== null
      ? {
          duration: formatDuration(archivedStartIso, archivedEndIso),
          averagePerDay: formatAveragePerDay(counter.count, daysBetween(archivedStartIso, archivedEndIso)),
        }
      : null
  // Progression pour le style "anneau" : vers l'objectif libre s'il est
  // défini (le plus explicite), sinon vers le nombre moyen de tentatives —
  // mêmes formules que les barres de progression du panneau de réglages.
  const targetProgress = progressRatio(counter.count, counter.behavior.target)
  const oddsProgress = progressRatio(counter.count, counter.behavior.oddsDenominator)
  const progress = targetProgress ?? oddsProgress

  return (
    <Reorder.Item
      as="article"
      value={counter}
      id={counter.id}
      dragControls={dragControls}
      layout
      {...CARD_MOTION}
      className="counter-card"
      style={{ '--accent': counter.appearance.color } as React.CSSProperties}
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerCancel}
      role="button"
      tabIndex={0}
      aria-label={locked ? `${counter.name}, archivé, lecture seule` : `Incrémenter ${counter.name}`}
      onKeyDown={(e) => {
        // Ignore les touches qui bouillonnent depuis un enfant (bouton,
        // champ...) : seule une touche appuyée sur la carte elle-même doit
        // déclencher +1/-1, sinon un Entrée sur un bouton enfant doublerait
        // l'action déjà gérée par son propre onClick.
        if (e.target !== e.currentTarget) return
        if (['Enter', ' ', 'ArrowUp', '+', '='].includes(e.key)) {
          e.preventDefault()
          bump(1)
        } else if (['ArrowDown', '-'].includes(e.key)) {
          e.preventDefault()
          bump(-1)
        }
      }}
    >
      {counter.appearance.backgroundImageUrl && (
        <div
          className="counter-bg"
          style={{ backgroundImage: `url("${counter.appearance.backgroundImageUrl}")` }}
          aria-hidden="true"
        />
      )}

      {counter.pinned && (
        <span className="counter-pin-badge" aria-hidden="true">
          <PinIcon width={14} height={14} />
        </span>
      )}

      {celebrating && (
        <div className="counter-celebration" aria-hidden="true">
          {CONFETTI_ANGLES.map((angle, i) => (
            <span
              key={angle}
              className="counter-confetti"
              style={
                {
                  '--angle': `${angle}deg`,
                  '--delay': `${i * 25}ms`,
                  '--color': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {celebrating && (
        <span className="sr-only" role="status">
          Objectif atteint
        </span>
      )}

      <div className="counter-options-row">
        {!locked && (
          <button
            className="counter-drag-handle"
            onPointerDown={(e) => {
              e.stopPropagation()
              dragControls.start(e)
            }}
            onClick={(e) => e.stopPropagation()}
            // Flèches Haut/Bas : équivalent clavier du glisser-déposer, pour
            // les utilisateurs qui ne peuvent pas faire de glisser souris/tactile.
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                e.stopPropagation()
                onMove(-1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                e.stopPropagation()
                onMove(1)
              }
            }}
            aria-label="Réordonner le compteur (flèches Haut/Bas)"
            title="Glisser, ou flèches Haut/Bas, pour réordonner"
          >
            <DragHandleIcon width={15} height={15} />
          </button>
        )}

        {PANEL_BUTTONS.map(({ panel, className, label, title, icon: Icon }) => (
          <button
            key={panel}
            className={className}
            onClick={(e) => {
              e.stopPropagation()
              setOpenPanel(panel)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={label}
            title={title}
          >
            <Icon width={15} height={15} />
          </button>
        ))}
      </div>

      {editing ? (
        <input
          className="counter-name-input"
          autoFocus
          aria-label="Renommer le compteur"
          value={draftName}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
            // Pas de setDraftName ici : chaque ouverture du champ (clic, clavier)
            // réinitialise déjà le brouillon depuis le nom actuel.
            if (e.key === 'Escape') setEditing(false)
          }}
          maxLength={40}
        />
      ) : (
        <h2
          className="counter-name"
          onClick={(e) => {
            e.stopPropagation()
            if (locked) return
            setDraftName(counter.name)
            setEditing(true)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          // Raccourci clavier pour ce même accès rapide au renommage (la
          // modale Personnaliser reste l'accès pleinement clavier ; ceci
          // évite que ce raccourci reste réservé à la souris/au tactile).
          tabIndex={locked ? undefined : 0}
          onKeyDown={(e) => {
            // Un archivé n'a pas de tabIndex (donc pas de focus clavier) : garde de sûreté.
            if (locked) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setDraftName(counter.name)
              setEditing(true)
            }
          }}
          title={locked ? 'Compteur archivé : lecture seule' : 'Toucher pour renommer'}
        >
          {counter.name}
        </h2>
      )}

      <motion.div
        className={`counter-value${counter.appearance.displayStyle ? ` counter-value--${counter.appearance.displayStyle}` : ''}`}
        ref={valueRef}
        style={fillFontSize ? { fontSize: `${fillFontSize}px` } : undefined}
        animate={pulseControls}
        aria-hidden="true"
      >
        <CounterValueDisplay value={counter.count} direction={direction} style={counter.appearance.displayStyle} progress={progress} />
      </motion.div>

      {/* Les chiffres de l'odomètre se montent/démontent en continu pour
          l'animation de défilement (visuellement clair, mais illisible pour
          un lecteur d'écran) : cette région annonce la valeur à jour sous
          une forme stable et silencieuse jusqu'au prochain changement. */}
      <span className="sr-only" aria-live="polite">
        {counter.name} : {counter.count}
      </span>

      {odds !== null && (
        <div className="counter-odds-stats">
          <p className="counter-odds-hint">{formatOdds(odds)} de chances de l'avoir obtenu avant ce stade</p>
        </div>
      )}

      {archivedStats !== null && (
        <div className="counter-odds-stats">
          <p className="counter-odds-hint">Durée totale : {archivedStats.duration}</p>
          <p className="counter-odds-hint">Moyenne : {archivedStats.averagePerDay}</p>
        </div>
      )}

      <div className="counter-actions">
        <button
          className="counter-btn minus"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation()
            handleRelease(-1)
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            startHold(-1)
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          // Entrée/Espace : équivalent clavier de l'appui maintenu (rafale),
          // au lieu du simple appui unique déjà couvert nativement par le
          // clic déclenché par le navigateur. `e.repeat` (répétition clavier
          // du système) est ignoré : c'est notre propre minuteur qui pilote
          // la répétition, comme au pointeur.
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            if (e.repeat) return
            startHold(-1)
          }}
          onKeyUp={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            stopHold()
            handleRelease(-1)
          }}
          aria-label="Décrémenter"
          title="Maintenir pour décrémenter en rafale"
        >
          −{counter.behavior.step ?? 1}
        </button>
        <button
          className="counter-btn plus"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation()
            handleRelease(1)
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            startHold(1)
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            if (e.repeat) return
            startHold(1)
          }}
          onKeyUp={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            stopHold()
            handleRelease(1)
          }}
          aria-label="Incrémenter"
          title="Maintenir pour incrémenter en rafale"
        >
          +{counter.behavior.step ?? 1}
        </button>
      </div>

      {openPanel === 'personnalisation' && (
        <CounterSettingsPanel
          counter={counter}
          colors={colors}
          onClose={() => setOpenPanel(null)}
          onUpdate={onUpdate}
          onNavigate={setOpenPanel}
        />
      )}

      {openPanel === 'comportement' && (
        <CounterBehaviorSettingsPanel
          counter={counter}
          onClose={() => setOpenPanel(null)}
          onUpdate={onUpdate}
          onSetCount={handleSetCount}
          onNavigate={setOpenPanel}
        />
      )}

      {openPanel === 'actions' && (
        <CounterActionsPanel
          counter={counter}
          onClose={() => setOpenPanel(null)}
          onDuplicate={onDuplicate}
          onToggleArchive={onToggleArchive}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          onNavigate={setOpenPanel}
        />
      )}
    </Reorder.Item>
  )
}
