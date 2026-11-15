// Réglages d'animation et table des segments des styles d'affichage de la
// valeur. Ils vivent ici (et non dans CounterValueDisplay.tsx) pour rester
// de simples données testables, et parce que la règle
// react/only-export-components interdit de les exporter depuis un composant.

/** Volet : l'ancien chiffre pivote vers le haut, le nouveau arrive du bas. */
export const FLAP_CHAR_MOTION = {
  initial: { rotateX: -90, opacity: 0 },
  animate: { rotateX: 0, opacity: 1 },
  exit: { rotateX: 90, opacity: 0 },
  transition: { duration: 0.26, ease: 'easeInOut' },
} as const

/** 7 segments : bref sursaut de luminosité sur le chiffre qui change. */
export const SEGMENT_FLASH_MOTION = {
  initial: { filter: 'brightness(2.6)' },
  animate: { filter: 'brightness(1)' },
  transition: { duration: 0.25, ease: 'easeOut' },
} as const

/** Anneau : l'arc suit la progression avec un léger ressort. */
export const RING_ARC_TRANSITION = { type: 'spring', stiffness: 120, damping: 22 } as const

/** Anneau : petit « pop » du chiffre central. */
export const RING_NUMBER_MOTION = {
  initial: { scale: 0.8, opacity: 0.3 },
  animate: { scale: 1, opacity: 1 },
  transition: { duration: 0.22, ease: 'easeOut' },
} as const

/** Éditorial : fondu avec un léger glissement vertical. */
export const EDITORIAL_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.32, ease: 'easeOut' },
} as const

/** Pastille : rebond élastique avec une légère rotation. */
export const BADGE_MOTION = {
  initial: { scale: 0.6, rotate: -8 },
  animate: { scale: 1, rotate: 0 },
  transition: { type: 'spring', stiffness: 420, damping: 12 },
} as const

const RING_RADIUS = 54

/** Longueur de l'arc complet de l'anneau (rayon du cercle SVG). */
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** Décalage du trait pour que l'arc couvre `progress` (0 à 1) de l'anneau. */
export function ringDashOffset(progress: number) {
  return RING_CIRCUMFERENCE * (1 - progress)
}

// Segments allumés (a-g, cadran horaire classique) par caractère possible
// dans la valeur d'un compteur (chiffres et signe moins).
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgecd',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
}

/** Segments allumés pour un caractère ; vide s'il est hors table (ex :
 * notation exponentielle d'une très grande valeur), pour ne jamais planter. */
export function segmentsFor(char: string) {
  return SEGMENTS[char] ?? ''
}
