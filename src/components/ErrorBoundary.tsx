import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendu à la place de `children` en cas d'erreur ; reçoit `retry`, qui
   * recharge complètement la page (voir la classe pour pourquoi un simple
   * nouveau rendu ne suffit pas). */
  fallback: (retry: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Filet de sécurité générique : sans lui, une exception non rattrapée
 * n'importe où dans le sous-arbre React démonte tout jusqu'à la racine,
 * laissant une page blanche sans aucune indication pour l'utilisateur — le
 * seul recours étant alors de deviner qu'il faut recharger. Déclencheur le
 * plus probable ici : un chunk JS chargé à la demande (`SyncPanel`, voir
 * App.tsx) dont le fichier n'existe plus après un nouveau déploiement (noms
 * de fichiers hashés par Vite, anciens hashs jamais conservés côté GitHub
 * Pages) alors qu'un onglet resté ouvert y fait encore référence. La
 * promesse de `import()` rejette dans ce cas, ce que `Suspense` seul ne
 * rattrape pas (il ne gère que l'attente, pas l'échec) — d'où ce filet
 * séparé plutôt qu'un simple `fallback` de `Suspense`. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur rattrapée par ErrorBoundary :', error, info)
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback(() => window.location.reload())
    }
    return this.props.children
  }
}
