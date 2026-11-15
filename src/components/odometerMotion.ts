// Décalage vertical (px) d'un chiffre qui entre ou sort, puis ressort qui
// l'amène à sa place.
const DIGIT_SLIDE_PX = 32
const DIGIT_SPRING = { type: 'spring', stiffness: 420, damping: 32 } as const

/** Props d'animation d'un chiffre : il entre depuis `direction` (1 : par le
 * bas, -1 : par le haut) et sort du côté opposé. */
export function digitMotion(direction: 1 | -1) {
  return {
    initial: { y: direction * DIGIT_SLIDE_PX, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -direction * DIGIT_SLIDE_PX, opacity: 0 },
    transition: DIGIT_SPRING,
  }
}
