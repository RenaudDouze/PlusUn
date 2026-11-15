import type { TargetAndTransition } from 'framer-motion'

// Réglages d'animation de la carte : de simples données testables, hors du
// composant (la règle react/only-export-components interdit de les y exporter).

/** Entrée, sortie, appui et glisser de la carte (Reorder.Item). `dragListener`
 * reste à false : seule la poignée démarre un glisser (via dragControls), un
 * appui sur le reste de la carte doit compter, pas déplacer. */
export const CARD_MOTION = {
  dragListener: false,
  initial: { opacity: 0, scale: 0.9, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.85, y: -8 },
  whileTap: { scale: 0.98 },
  whileDrag: { scale: 1.03, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.25)', zIndex: 10 },
  transition: { type: 'spring', stiffness: 300, damping: 26 },
} as const

/** Petit rebond élastique de la valeur à chaque changement (`scale` seul :
 * accéléré par le compositeur). */
export const PULSE_ANIMATION: TargetAndTransition = {
  scale: [1, 1.16, 0.97, 1],
  transition: { duration: 0.35, ease: 'easeOut', times: [0, 0.3, 0.7, 1] },
}
