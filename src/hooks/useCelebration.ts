import { useEffect, useRef, useState } from 'react'

// Durée d'affichage de la célébration (confetti) à l'atteinte de l'objectif.
const CELEBRATION_DURATION_MS = 1100

/** true brièvement au moment où `count` franchit `target` (d'en dessous vers
 * au moins sa valeur), pas juste quand `count` s'y trouve déjà — sinon
 * toucher l'objectif au montage (ex: après rechargement de la page)
 * déclencherait la célébration à chaque fois. Un pas d'incrément personnalisé
 * peut sauter par-dessus l'objectif sans tomber pile dessus (ex: pas de 3,
 * objectif à 10 : 9 → 12) : on compare donc à un dépassement, pas à une
 * égalité. */
export function useCelebration(count: number, target: number | undefined): boolean {
  const [celebrating, setCelebrating] = useState(false)
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previousCount = useRef(count)

  useEffect(() => {
    const previous = previousCount.current
    previousCount.current = count
    // Sans objectif défini, il est inatteignable : aucune célébration.
    const goal = target ?? Infinity
    if (previous < goal && count >= goal) {
      setCelebrating(true)
      clearTimeout(celebrateTimer.current)
      celebrateTimer.current = setTimeout(() => setCelebrating(false), CELEBRATION_DURATION_MS)
    }
  }, [count, target])

  return celebrating
}
