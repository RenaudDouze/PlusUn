import { useRef } from 'react'

// Délai avant qu'un appui maintenu déclenche la répétition, puis intervalle
// entre chaque répétition (comptage en rafale).
const HOLD_DELAY_MS = 350
const HOLD_REPEAT_MS = 100

/** Déclenche `bump` en rafale tant que le pointeur reste appuyé, après un
 * court délai initial. `longPressFiredRef` (ref, pas de re-rendu) permet à
 * l'appelant de savoir si le relâchement fait suite à une rafale, pour ne
 * pas appliquer en plus le clic de compatibilité émis par le navigateur. */
export function useHoldToRepeat(bump: (sign: 1 | -1) => void) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const holdInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const longPressFiredRef = useRef(false)

  const stopHold = () => {
    clearTimeout(holdTimer.current)
    clearInterval(holdInterval.current)
  }

  // Un appui bref reste un simple tap (géré par le onClick du bouton, qui
  // continue de fonctionner normalement au clavier et au clic/tap
  // classique). Passé le délai, on bascule en répétition continue et on
  // marque `longPressFiredRef` pour que le onClick qui suivra le relâchement
  // (toujours émis par le navigateur) n'applique pas un incrément en trop.
  const startHold = (sign: 1 | -1) => {
    stopHold()
    longPressFiredRef.current = false
    holdTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      bump(sign)
      holdInterval.current = setInterval(() => bump(sign), HOLD_REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  return { startHold, stopHold, longPressFiredRef }
}
