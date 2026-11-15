import { useState } from 'react'

const POSITIVE_INT_ERROR = 'Nombre entier positif requis.'

// N'accepte que des chiffres (contrairement à un simple filtrage des
// caractères non numériques) : une saisie comme "abd7" doit être rejetée,
// pas silencieusement réduite à "7".
function parsePositiveInt(trimmed: string): number | undefined {
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = parseInt(trimmed, 10)
  return value > 0 ? value : undefined
}

/** Gère le brouillon, l'erreur et la validation d'un champ "entier positif ou
 * vide" (pas d'incrément, objectif, probabilité...), qui ne se commite qu'au
 * blur ou à l'Entrée. `value` n'est lu qu'à l'initialisation : le champ garde
 * ensuite son propre brouillon tant que le composant reste monté (ces
 * panneaux étant remontés à chaque ouverture, une resynchronisation externe
 * n'est pas nécessaire). */
export function usePositiveIntField(value: number | undefined, onCommit: (value: number | undefined) => void) {
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit(undefined)
      return
    }
    const parsed = parsePositiveInt(trimmed)
    if (parsed !== undefined) {
      onCommit(parsed)
    } else {
      // Laisse la saisie invalide affichée (plutôt que de revenir à la
      // valeur précédente) : sinon un blur qui reperd le focus sur ce champ
      // (ex: en cliquant ailleurs) recommetterait un brouillon déjà vidé, et
      // ferait silencieusement disparaître le message d'erreur.
      setError(POSITIVE_INT_ERROR)
    }
  }

  return {
    value: draft,
    error,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value)
      setError(null)
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commit()
    },
  }
}
