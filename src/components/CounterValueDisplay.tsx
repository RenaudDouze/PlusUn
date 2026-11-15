import { AnimatePresence, motion } from 'framer-motion'
import { Odometer } from './Odometer'
import type { DisplayStyle } from '../types'
import {
  BADGE_MOTION,
  EDITORIAL_MOTION,
  FLAP_CHAR_MOTION,
  RING_ARC_TRANSITION,
  RING_CIRCUMFERENCE,
  RING_NUMBER_MOTION,
  SEGMENT_FLASH_MOTION,
  ringDashOffset,
  segmentsFor,
} from './valueDisplayMotion'

interface CounterValueDisplayProps {
  value: number
  direction: 1 | -1
  style?: DisplayStyle
  // Progression vers la moyenne (count / oddsDenominator, plafonnée à 1) pour
  // le style "anneau". null quand aucune probabilité n'est définie.
  progress: number | null
}

// Chaque volet bascule indépendamment (comme un vrai panneau à volets) :
// l'ancien chiffre pivote vers le haut en sortant, le nouveau arrive du bas.
function FlapValue({ value }: { value: number }) {
  return (
    <div className="value-flap">
      {value
        .toString()
        .split('')
        .map((char, i) => (
          <span className="value-flap-tile" key={i}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={char}
                className="value-flap-char"
                {...FLAP_CHAR_MOTION}
              >
                {char}
              </motion.span>
            </AnimatePresence>
            <span className="value-flap-hinge" aria-hidden="true" />
          </span>
        ))}
    </div>
  )
}

const SEGMENT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

function SegmentDigit({ char }: { char: string }) {
  const on = segmentsFor(char)
  return (
    <span className="value-segment-digit">
      {SEGMENT_KEYS.map((s) => (
        <i key={s} className={`value-segment value-segment--${s}${on.includes(s) ? ' is-on' : ''}`} />
      ))}
    </span>
  )
}

// Chaque chiffre qui change reçoit un bref sursaut de luminosité, comme un
// afficheur électronique qui se réactualise (le remontage par `key` ne se
// déclenche que sur les positions dont le caractère a réellement changé).
function Segment7Value({ value }: { value: number }) {
  return (
    <div className="value-segment7">
      {value
        .toString()
        .split('')
        .map((char, i) => (
          <motion.span
            key={`${i}-${char}`}
            className="value-segment7-flash"
            {...SEGMENT_FLASH_MOTION}
          >
            <SegmentDigit char={char} />
          </motion.span>
        ))}
    </div>
  )
}

// L'arc suit la progression avec un léger ressort, et le chiffre central
// fait un petit "pop" plutôt que le rebond générique des autres styles.
function RingValue({ value, progress }: { value: number; progress: number | null }) {
  return (
    <div className="value-ring">
      <svg viewBox="0 0 120 120" className="value-ring-svg" aria-hidden="true">
        <circle className="value-ring-track" cx="60" cy="60" r="54" />
        {progress !== null && (
          <motion.circle
            className="value-ring-fill"
            cx="60"
            cy="60"
            r="54"
            strokeDasharray={RING_CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset: ringDashOffset(progress) }}
            transition={RING_ARC_TRANSITION}
          />
        )}
      </svg>
      <div className="value-ring-center">
        <motion.span
          key={value}
          className="value-ring-number"
          {...RING_NUMBER_MOTION}
        >
          {value}
        </motion.span>
        {progress !== null && <span className="value-ring-pct">{Math.round(progress * 100)} %</span>}
      </div>
    </div>
  )
}

// Fondu discret avec un léger glissement vertical : pas de rebond ni
// d'ombre, pour rester fidèle au parti pris épuré de ce style.
function EditorialValue({ value }: { value: number }) {
  return (
    <div className="value-editorial">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="value-editorial-number"
          {...EDITORIAL_MOTION}
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span className="value-editorial-rule" aria-hidden="true" />
    </div>
  )
}

// Rebond élastique plus prononcé que le style par défaut, avec une légère
// rotation : assume le ton ludique de la pastille.
function BadgeValue({ value }: { value: number }) {
  return (
    <div className="value-badge">
      <motion.span
        key={value}
        className="value-badge-pill"
        {...BADGE_MOTION}
      >
        {value}
      </motion.span>
    </div>
  )
}

export function CounterValueDisplay({ value, direction, style, progress }: CounterValueDisplayProps) {
  switch (style) {
    case 'flap':
      return <FlapValue value={value} />
    case 'segment7':
      return <Segment7Value value={value} />
    case 'ring':
      return <RingValue value={value} progress={progress} />
    case 'editorial':
      return <EditorialValue value={value} />
    case 'badge':
      return <BadgeValue value={value} />
    default:
      return <Odometer value={value} direction={direction} />
  }
}
