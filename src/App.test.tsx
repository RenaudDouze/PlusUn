import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import App from './App'
import { encodeCountersToParam } from './sync'
import { COLORS } from './colors'
import { useRemoteSync } from './hooks/useRemoteSync'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getNotificationPermission, requestNotificationPermission } from './notifications'
import type { Counter } from './types'

// Enveloppe la vraie classe dans un composant fonction (délègue à elle par
// défaut, donc n'affecte aucun autre test) : sert uniquement à simuler
// directement le chemin "chunk introuvable" (voir le test dédié plus bas)
// sans avoir à faire réellement échouer l'import() paresseux de SyncPanel.
vi.mock('./components/ErrorBoundary', async () => {
  const actual = await vi.importActual<typeof import('./components/ErrorBoundary')>('./components/ErrorBoundary')
  return { ErrorBoundary: vi.fn((props: ComponentProps<typeof actual.ErrorBoundary>) => <actual.ErrorBoundary {...props} />) }
})
const defaultErrorBoundaryImpl = vi.mocked(ErrorBoundary).getMockImplementation()!

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
  },
}))

// Enveloppe l'implémentation réelle (délègue à elle par défaut, donc n'affecte
// aucun autre test) : sert uniquement à intercepter le callback
// `onRemoteUpdate` passé par App.tsx, pour le déclencher directement plutôt
// que de simuler un aller-retour réseau complet (déjà couvert au niveau du
// hook dans useRemoteSync.test.ts, et bout en bout en e2e).
vi.mock('./hooks/useRemoteSync', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useRemoteSync')>('./hooks/useRemoteSync')
  return { ...actual, useRemoteSync: vi.fn(actual.useRemoteSync) }
})
const defaultUseRemoteSyncImpl = vi.mocked(useRemoteSync).getMockImplementation()!

// Toujours 'unsupported' par défaut (comme dans jsdom, où `Notification`
// n'existe pas) : le bouton de notifications reste caché dans tous les
// autres tests, seul le bloc dédié plus bas le fait apparaître pour couvrir
// son rendu et son clic.
vi.mock('./notifications', () => ({
  getNotificationPermission: vi.fn(() => 'unsupported' as const),
  requestNotificationPermission: vi.fn(),
  showLocalNotification: vi.fn(),
}))

function makeCounter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'existing-1',
    name: 'Existant',
    count: 1,
    createdAt: Date.now(),
    behavior: {},
    appearance: { color: '#2563eb' },
    ...overrides,
  }
}

// La recherche, le thème, le partage, le mode focus et le filtre
// Actifs/Archivés vivent dans le menu déroulant de l'en-tête, replié par
// défaut : chaque test qui les exerce doit d'abord l'ouvrir. « + Nouveau
// compteur » reste hors menu, toujours visible : inutile de l'ouvrir pour lui.
function openMenu() {
  // Préfixe seul (regex) : le libellé complet gagne un suffixe quand la
  // synchro est en erreur (voir "indicateur d'erreur de synchro...").
  const trigger = screen.queryByRole('button', { name: /^Ouvrir le menu/ })
  if (trigger) fireEvent.click(trigger)
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it("affiche l'état vide au premier lancement", () => {
    render(<App />)
    expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
  })

  it("n'affiche pas le rappel sur la synchro dans l'état vide quand aucun worker n'est configuré", () => {
    render(<App />)
    expect(screen.queryByText(/Compteurs synchronisés entre appareils/)).not.toBeInTheDocument()
  })

  it("affiche un rappel sur la synchro non chiffrée dans l'état vide quand un worker est configuré", () => {
    vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.example.workers.dev')
    render(<App />)
    expect(screen.getByText(/Compteurs synchronisés entre appareils/)).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('crée un premier compteur depuis l\'état vide', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon premier compteur' }))
    expect(screen.getByDisplayValue('Compteur 1')).toBeInTheDocument()
    expect(screen.queryByText("Aucun compteur pour l'instant.")).not.toBeInTheDocument()
  })

  it('ajoute un compteur depuis le bouton d\'en-tête', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    expect(screen.getByDisplayValue('Compteur 1')).toBeInTheDocument()
  })

  it('numérote les compteurs successifs', () => {
    render(<App />)
    const addBtn = screen.getByRole('button', { name: '+ Nouveau compteur' })
    fireEvent.click(addBtn)
    fireEvent.click(addBtn)
    // Le focus du champ de nom du 2ᵈ compteur (autoFocus) fait perdre le
    // focus à celui du 1er, ce qui le valide et referme son édition.
    expect(screen.getByText('Compteur 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Compteur 2')).toBeInTheDocument()
  })

  it('utilise la classe --solo pour un seul compteur', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    expect(document.querySelector('.counter-grid--solo')).toBeInTheDocument()
  })

  it('utilise la classe --duo pour deux compteurs', () => {
    render(<App />)
    const addBtn = screen.getByRole('button', { name: '+ Nouveau compteur' })
    fireEvent.click(addBtn)
    fireEvent.click(addBtn)
    expect(document.querySelector('.counter-grid--duo')).toBeInTheDocument()
  })

  it('utilise la classe --pack à partir de trois compteurs', () => {
    render(<App />)
    const addBtn = screen.getByRole('button', { name: '+ Nouveau compteur' })
    fireEvent.click(addBtn)
    fireEvent.click(addBtn)
    fireEvent.click(addBtn)
    expect(document.querySelector('.counter-grid--pack')).toBeInTheDocument()
  })

  it('incrémente un compteur au clic', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByText('0'))
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('définit directement la valeur depuis la modale Valeur & réglages', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Régler le comportement du compteur' }))
    const input = screen.getByDisplayValue('0')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Les chiffres qui quittent l'affichage restent brièvement montés le temps
    // de leur animation de sortie (AnimatePresence) : le texte combiné
    // ancien/nouveau ne se stabilise qu'une fois celle-ci terminée.
    await waitFor(() => expect(document.querySelector('.counter-value')).toHaveTextContent('99'))
  })

  it('renomme un compteur', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    // Le champ de nom s'ouvre déjà en édition à la création (voir plus bas) :
    // on le referme d'abord pour tester le renommage ultérieur au clic sur
    // le titre, l'autre façon d'y accéder.
    fireEvent.keyDown(screen.getByDisplayValue('Compteur 1'), { key: 'Escape' })
    fireEvent.click(screen.getByText('Compteur 1'))
    const input = screen.getByDisplayValue('Compteur 1')
    fireEvent.change(input, { target: { value: 'Renommé' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Renommé')).toBeInTheDocument()
  })

  it('ouvre directement le champ de nom en édition à la création', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    const input = screen.getByDisplayValue('Compteur 1')
    fireEvent.change(input, { target: { value: 'Immédiat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Immédiat')).toBeInTheDocument()
  })

  it('définit une probabilité', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    const input = screen.getByPlaceholderText('4096')
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  it("définit un pas d'incrément personnalisé et l'applique au clic", () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    const input = screen.getByPlaceholderText('1')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(screen.getByRole('button', { name: /Incrémenter Compteur 1/ }))
    expect(document.querySelector('.counter-value')).toHaveTextContent('5')
  })

  it('définit une date de début', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    const input = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2020-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(document.querySelector('input[type="date"]')).toHaveValue('2020-01-01')
  })

  it('définit une image de fond', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
    fireEvent.change(input, { target: { value: 'https://exemple.com/fond.jpg' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(document.querySelector('.counter-bg')).toBeInTheDocument()
  })

  it('change la couleur du compteur', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${COLORS[1]}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    const selected = screen.getByRole('button', { name: `Choisir la couleur ${COLORS[1]}` })
    expect(selected.className).toContain('selected')
  })

  it("définit un style d'affichage pour le compteur", () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le style Volets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(document.querySelector('.counter-value--flap')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    expect(screen.getByRole('button', { name: 'Choisir le style Volets' }).className).toContain('selected')
  })

  it('définit un objectif pour le compteur', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    const input = screen.getByPlaceholderText('ex : 50')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
  })

  it('duplique un compteur avec sa configuration, mais repart de zéro', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${COLORS[1]}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le style Volets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer ce compteur' }))

    // Le champ de nom du premier compteur s'était ouvert en édition à sa
    // création (autoEdit) : l'ouverture de la modale Personnalisation juste
    // après lui fait perdre le focus, ce qui valide/ferme cette édition.
    expect(screen.getByText('Compteur 1')).toBeInTheDocument()
    expect(screen.getByText('Compteur 1 (copie)')).toBeInTheDocument()
    expect(document.querySelectorAll('.counter-value--flap')).toHaveLength(2)
    expect(document.querySelectorAll('.counter-value')[1]).toHaveTextContent('0')
  })

  it('supprime un compteur après confirmation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
    fireEvent.click(screen.getByText('Supprimer ce compteur'))
    fireEvent.click(screen.getByText('Confirmer la suppression'))
    expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
  })

  describe('annulation', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("propose d'annuler après une suppression et restaure le compteur", () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 1'), { target: { value: 'À restaurer' } })
      fireEvent.keyDown(screen.getByDisplayValue('À restaurer'), { key: 'Enter' })

      fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      fireEvent.click(screen.getByText('Confirmer la suppression'))
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
      expect(screen.getByText('Compteur « À restaurer » supprimé')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(screen.getByText('À restaurer')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    })

    it("propose d'annuler après une modification directe de la valeur", async () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.click(screen.getByRole('button', { name: 'Régler le comportement du compteur' }))
      const input = screen.getByDisplayValue('0')
      fireEvent.change(input, { target: { value: '99' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('Valeur de « Compteur 1 » modifiée')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      // Les chiffres qui quittent l'affichage restent brièvement montés le
      // temps de leur animation de sortie (AnimatePresence) : le texte
      // combiné ancien/nouveau ne se stabilise qu'une fois celle-ci terminée.
      await waitFor(() => expect(document.querySelector('.counter-value')).toHaveTextContent('0'))
    })

    it("ne propose pas d'annuler si la valeur éditée est identique", () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.click(screen.getByRole('button', { name: 'Régler le comportement du compteur' }))
      const input = screen.getByDisplayValue('0')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    })

    it("le message d'annulation disparaît après le délai", () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Supprimer ce compteur'))
      fireEvent.click(screen.getByText('Confirmer la suppression'))
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(5100)
      })
      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    })

    // Cible une carte précise par son nom plutôt que par position, et scope
    // la modale à son titre (« Actions « Nom » ») : une carte tout juste
    // supprimée reste montée le temps de son animation de sortie
    // (AnimatePresence), avec sa propre modale « Actions » toujours ouverte
    // (fermée uniquement via le bouton dédié, jamais par la suppression
    // elle-même) — un index ou une recherche non scopée seraient ambigus
    // entre cette carte/modale fantôme et celle qui reste.
    function actionsButtonFor(name: string) {
      const card = screen.getByText(name).closest('.counter-card')
      return within(card as HTMLElement).getByRole('button', { name: 'Actions du compteur' })
    }

    function deleteCounterNamed(name: string) {
      fireEvent.click(actionsButtonFor(name))
      const modal = screen.getByRole('heading', { name: `Actions « ${name} »` }).closest('.modal-panel') as HTMLElement
      fireEvent.click(within(modal).getByText('Supprimer ce compteur'))
      fireEvent.click(within(modal).getByText('Confirmer la suppression'))
    }

    it('empile plusieurs suppressions consécutives, annulables une à une dans l’ordre inverse', () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 1'), { target: { value: 'Premier' } })
      fireEvent.keyDown(screen.getByDisplayValue('Premier'), { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 2'), { target: { value: 'Second' } })
      fireEvent.keyDown(screen.getByDisplayValue('Second'), { key: 'Enter' })

      deleteCounterNamed('Premier')
      expect(screen.getByText('Compteur « Premier » supprimé')).toBeInTheDocument()

      deleteCounterNamed('Second')
      // La pile contient deux actions : le libellé affiché est celui de la
      // plus récente, et le bouton indique le nombre d'actions empilées.
      expect(screen.getByText('Compteur « Second » supprimé')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Annuler (2)' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Annuler (2)' }))
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByText('Premier')).not.toBeInTheDocument()
      // Il reste une action à annuler : le message ne disparaît pas.
      expect(screen.getByText('Compteur « Premier » supprimé')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(screen.getByText('Premier')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    })

    it('relance le délai à chaque nouvelle action empilée, plutôt que de le laisser filer depuis la première', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 1'), { target: { value: 'Premier' } })
      fireEvent.keyDown(screen.getByDisplayValue('Premier'), { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 2'), { target: { value: 'Second' } })
      fireEvent.keyDown(screen.getByDisplayValue('Second'), { key: 'Enter' })

      deleteCounterNamed('Premier')

      act(() => {
        vi.advanceTimersByTime(4000)
      })
      // Toujours dans les 5s de la première suppression : une seconde
      // relance le délai plutôt que d'expirer avec elle.
      deleteCounterNamed('Second')
      expect(screen.getByRole('button', { name: 'Annuler (2)' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(4000)
      })
      // 8s après la première action mais seulement 4s après la seconde :
      // le message reste affiché, le délai a bien été relancé.
      expect(screen.getByRole('button', { name: 'Annuler (2)' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1100)
      })
      expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    })

    it("expire aussi la dernière action restante, une fois le reste de la pile annulé", () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 1'), { target: { value: 'Premier' } })
      fireEvent.keyDown(screen.getByDisplayValue('Premier'), { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      fireEvent.change(screen.getByDisplayValue('Compteur 2'), { target: { value: 'Second' } })
      fireEvent.keyDown(screen.getByDisplayValue('Second'), { key: 'Enter' })

      deleteCounterNamed('Premier')
      deleteCounterNamed('Second')
      expect(screen.getByRole('button', { name: 'Annuler (2)' })).toBeInTheDocument()

      // Il ne reste qu'une action après ce clic : le délai est relancé pour
      // elle aussi, pas seulement pour un empilement de plusieurs actions.
      fireEvent.click(screen.getByRole('button', { name: 'Annuler (2)' }))
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(5100)
      })
      expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    })
  })

  describe('thème', () => {
    afterEach(() => {
      document.documentElement.removeAttribute('data-theme')
    })

    it('démarre en mode automatique et suit la préférence système', () => {
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
      // matchMedia est mocké sur `matches: false` (clair) dans le setup des tests.
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('applique le thème sombre en mode automatique si le système le préfère', () => {
      // vi.spyOn(window, 'matchMedia').mockRestore() ne restaure pas
      // proprement le mock déjà posé par setup.ts : on sauvegarde/remplace
      // la référence à la main pour ne pas casser les tests suivants.
      const original = window.matchMedia
      window.matchMedia = ((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as typeof window.matchMedia
      render(<App />)
      expect(document.documentElement.dataset.theme).toBe('dark')
      window.matchMedia = original
    })

    it('permet de forcer le thème clair puis sombre puis de revenir en automatique', () => {
      render(<App />)
      openMenu()
      const toggle = screen.getByRole('button', { name: 'Thème : Auto' })

      fireEvent.click(toggle)
      // Le menu se referme après chaque sélection (comme un menu classique) :
      // il faut le rouvrir avant chaque clic suivant sur le même bouton.
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Clair' })).toBeInTheDocument()
      expect(document.documentElement.dataset.theme).toBe('light')

      fireEvent.click(screen.getByRole('button', { name: 'Thème : Clair' }))
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Sombre' })).toBeInTheDocument()
      expect(document.documentElement.dataset.theme).toBe('dark')

      fireEvent.click(screen.getByRole('button', { name: 'Thème : Sombre' }))
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
    })

    it('retient le thème choisi après rechargement', () => {
      const { unmount } = render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Thème : Auto' }))
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Clair' })).toBeInTheDocument()
      unmount()

      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Clair' })).toBeInTheDocument()
    })

    it('adapte la couleur de la barre de statut au thème actif', () => {
      render(<App />)
      openMenu()
      const meta = document.querySelector('meta[name="theme-color"]')
      fireEvent.click(screen.getByRole('button', { name: 'Thème : Auto' }))
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Thème : Clair' }))
      expect(meta?.getAttribute('content')).toBe('#0f172a')
    })
  })

  it('persiste les compteurs dans le localStorage', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
    const stored = JSON.parse(window.localStorage.getItem('+1.counters.v1') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Compteur 1')
  })

  it('recharge les compteurs déjà stockés', () => {
    window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Persisté' })]))
    render(<App />)
    expect(screen.getByText('Persisté')).toBeInTheDocument()
  })

  describe('migration du stockage (renommage du projet en "+1")', () => {
    it("migre les compteurs depuis l'ancienne clé et la nettoie", () => {
      window.localStorage.setItem('compteur.counters.v1', JSON.stringify([makeCounter({ name: 'Historique' })]))
      render(<App />)
      expect(screen.getByText('Historique')).toBeInTheDocument()
      expect(window.localStorage.getItem('compteur.counters.v1')).toBeNull()
      expect(JSON.parse(window.localStorage.getItem('+1.counters.v1') ?? '[]')).toHaveLength(1)
    })

    it("ne migre pas si la nouvelle clé existe déjà (n'écrase pas des données plus récentes)", () => {
      window.localStorage.setItem('compteur.counters.v1', JSON.stringify([makeCounter({ name: 'Ancien' })]))
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Actuel' })]))
      render(<App />)
      expect(screen.getByText('Actuel')).toBeInTheDocument()
      expect(screen.queryByText('Ancien')).not.toBeInTheDocument()
    })

    it("migre la préférence de thème depuis l'ancienne clé et la nettoie", () => {
      window.localStorage.setItem('compteur.theme.v1', JSON.stringify('dark'))
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Sombre' })).toBeInTheDocument()
      expect(window.localStorage.getItem('compteur.theme.v1')).toBeNull()
    })

    it("ne fait rien si ni l'ancienne ni la nouvelle clé n'existent (premier lancement)", () => {
      render(<App />)
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
    })

    it("n'explose pas si le stockage est indisponible pendant la migration", () => {
      const getItemSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
        throw new Error('stockage indisponible')
      })
      expect(() => render(<App />)).not.toThrow()
      getItemSpy.mockRestore()
    })
  })

  describe('migration du modèle de compteur (regroupement behavior/appearance)', () => {
    it('migre un compteur enregistré au format à plat (avant le regroupement)', () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([
          { id: 'a', name: 'À plat', count: 3, color: '#16a34a', createdAt: Date.now(), step: 5 },
        ])
      )
      render(<App />)
      expect(screen.getByText('À plat')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Incrémenter' })).toHaveTextContent('+5')
      const stored = JSON.parse(window.localStorage.getItem('+1.counters.v1') ?? '[]')
      expect(stored[0].behavior).toEqual({ step: 5 })
      expect(stored[0].appearance.color).toBe('#16a34a')
    })
  })

  it("ne modifie que le compteur ciblé quand plusieurs compteurs existent", () => {
    window.localStorage.setItem(
      '+1.counters.v1',
      JSON.stringify([makeCounter({ id: 'a', name: 'Un', count: 0 }), makeCounter({ id: 'b', name: 'Deux', count: 0 })])
    )
    render(<App />)

    // Incrémente uniquement le premier compteur.
    fireEvent.click(screen.getByRole('button', { name: 'Incrémenter Un' }))
    expect(document.getElementById('a')?.textContent).toContain('1')
    expect(document.getElementById('b')?.textContent).toContain('0')

    // Renomme uniquement le premier.
    fireEvent.click(screen.getByText('Un'))
    fireEvent.change(screen.getByDisplayValue('Un'), { target: { value: 'UnModifié' } })
    fireEvent.keyDown(screen.getByDisplayValue('UnModifié'), { key: 'Enter' })
    expect(screen.getByText('Deux')).toBeInTheDocument()

    // Définit une probabilité uniquement sur le premier (le panneau de
    // personnalisation est affiché via un portail : on le referme après
    // chaque interaction pour ne jamais en avoir deux ouverts à la fois).
    const firstCard = document.getElementById('a') as HTMLElement
    const secondCard = document.getElementById('b') as HTMLElement
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    fireEvent.change(screen.getByPlaceholderText('4096'), { target: { value: '5' } })
    fireEvent.keyDown(screen.getByPlaceholderText('4096'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(within(secondCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.queryByDisplayValue('5')).not.toBeInTheDocument()

    // Définit une date de début uniquement sur le premier.
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(within(secondCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(document.querySelector('input[type="date"]')).not.toHaveValue('2020-01-01')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    // Définit une image de fond uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.change(screen.getByPlaceholderText('https://exemple.com/image.jpg'), {
      target: { value: 'https://exemple.com/fond.jpg' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('https://exemple.com/image.jpg'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(firstCard.querySelector('.counter-bg')).toBeInTheDocument()
    expect(secondCard.querySelector('.counter-bg')).not.toBeInTheDocument()

    // Change la couleur uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${COLORS[1]}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(within(secondCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    const secondSelected = screen.getByRole('button', { name: `Choisir la couleur ${COLORS[0]}` })
    expect(secondSelected.className).toContain('selected')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    // Définit un pas d'incrément uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    fireEvent.change(screen.getByPlaceholderText('1'), { target: { value: '5' } })
    fireEvent.keyDown(screen.getByPlaceholderText('1'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(within(secondCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.queryByDisplayValue('5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    // Définit un style d'affichage uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le style Volets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(firstCard.querySelector('.counter-value--flap')).toBeInTheDocument()
    expect(secondCard.querySelector('.counter-value--flap')).not.toBeInTheDocument()

    // Définit un objectif uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    fireEvent.change(screen.getByPlaceholderText('ex : 50'), { target: { value: '20' } })
    fireEvent.keyDown(screen.getByPlaceholderText('ex : 50'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(within(secondCard).getByRole('button', { name: 'Personnaliser le compteur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(screen.queryByDisplayValue('20')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    // Définit directement la valeur uniquement sur le premier.
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Régler le comportement du compteur' }))
    const countInput = screen.getByDisplayValue('1')
    fireEvent.change(countInput, { target: { value: '50' } })
    fireEvent.keyDown(countInput, { key: 'Enter' })
    expect(document.getElementById('a')?.textContent).toContain('50')
    expect(document.getElementById('b')?.textContent).toContain('0')
  })

  describe('panneau de synchronisation', () => {
    it("s'ouvre et se ferme", async () => {
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))
      // Le panneau est chargé à la demande (React.lazy) : son apparition est
      // donc asynchrone, contrairement au reste de l'interface.
      expect(await screen.findByText('Synchroniser mes compteurs')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
      expect(screen.queryByText('Synchroniser mes compteurs')).not.toBeInTheDocument()
    })

    describe("secours si le panneau n'a pas pu se charger (chunk introuvable après un déploiement)", () => {
      afterEach(() => {
        vi.mocked(ErrorBoundary).mockImplementation(defaultErrorBoundaryImpl)
      })

      it('propose de recharger la page plutôt que de laisser une page blanche', async () => {
        vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}))
        render(<App />)
        openMenu()
        fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))

        expect(
          screen.getByText(
            "Le panneau de synchronisation n'a pas pu se charger — une nouvelle version de l'app est probablement disponible. Recharge la page pour la récupérer."
          )
        ).toBeInTheDocument()
      })

      it('recharge la page au clic sur "Recharger la page"', async () => {
        const reloadSpy = vi.fn()
        vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(reloadSpy))
        render(<App />)
        openMenu()
        fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))

        fireEvent.click(screen.getByRole('button', { name: 'Recharger la page' }))
        expect(reloadSpy).toHaveBeenCalledTimes(1)
      })

      it('referme le secours sans recharger au clic sur "Fermer"', async () => {
        vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}))
        render(<App />)
        openMenu()
        fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))

        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
        expect(screen.queryByText('Synchroniser mes compteurs')).not.toBeInTheDocument()
      })

      it("referme le secours au clic sur l'arrière-plan, sans que le clic sur le panneau lui-même ne le ferme", async () => {
        vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}))
        const { container } = render(<App />)
        openMenu()
        fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))

        fireEvent.click(container.querySelector('.modal-panel')!)
        expect(screen.getByText('Synchroniser mes compteurs')).toBeInTheDocument()

        fireEvent.click(container.querySelector('.modal-overlay')!)
        expect(screen.queryByText('Synchroniser mes compteurs')).not.toBeInTheDocument()
      })
    })

    it('importe des compteurs partagés (remplacement quand la liste est vide)', async () => {
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))
      await screen.findByText('Synchroniser mes compteurs')
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'Depuis fichier', count: 4 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(screen.getByText('Depuis fichier')).toBeInTheDocument()
    })

    it('fusionne les compteurs importés quand refusé et existants', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Déjà là' })]))
      render(<App />)
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }))
      await screen.findByText('Synchroniser mes compteurs')
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([JSON.stringify([{ name: 'Ajouté', count: 2 }])], 'backup.json', {
        type: 'application/json',
      })
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      expect(screen.getByText('Déjà là')).toBeInTheDocument()
      expect(screen.getByText('Ajouté')).toBeInTheDocument()
    })
  })

  describe('notification de mise à jour à distance', () => {
    afterEach(() => {
      vi.mocked(useRemoteSync).mockImplementation(defaultUseRemoteSyncImpl)
    })

    it("affiche un message quand useRemoteSync signale une mise à jour reçue d'un autre appareil, qui disparaît après le délai", () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      let triggerRemoteUpdate: (() => void) | undefined
      vi.mocked(useRemoteSync).mockImplementation((_workerUrl, _counters, _setCounters, onRemoteUpdate) => {
        triggerRemoteUpdate = onRemoteUpdate
        return { code: null, status: 'disabled', errorMessage: null, createCode: async () => false, joinCode: async () => 'error', disable: () => {} }
      })

      render(<App />)
      act(() => {
        triggerRemoteUpdate?.()
      })
      expect(screen.getByText('Compteurs mis à jour depuis un autre appareil')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(4100)
      })
      expect(screen.queryByText('Compteurs mis à jour depuis un autre appareil')).not.toBeInTheDocument()
    })
  })

  describe('indicateur d\'erreur de synchro visible en dehors de la modale', () => {
    afterEach(() => {
      vi.mocked(useRemoteSync).mockImplementation(defaultUseRemoteSyncImpl)
    })

    it("marque le bouton du menu quand la synchro est en erreur, sans avoir à ouvrir la modale Synchroniser", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: 'ABCDEFGH',
        status: 'error',
        errorMessage: 'Failed to fetch',
        createCode: async () => false,
        joinCode: async () => 'error',
        disable: () => {},
      })

      render(<App />)

      const menuBtn = screen.getByRole('button', { name: 'Ouvrir le menu (erreur de synchronisation)' })
      expect(menuBtn).toHaveClass('icon-btn--alert')
    })

    it("marque aussi le bouton Synchroniser du menu déroulant quand la synchro est en erreur", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: 'ABCDEFGH',
        status: 'error',
        errorMessage: 'Failed to fetch',
        createCode: async () => false,
        joinCode: async () => 'error',
        disable: () => {},
      })

      render(<App />)
      openMenu()

      const syncBtn = screen.getByRole('button', { name: 'Synchroniser (erreur de synchronisation)' })
      expect(syncBtn).toHaveClass('icon-btn--alert')
    })

    it("n'affiche aucun indicateur quand la synchro n'est pas en erreur", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: 'ABCDEFGH',
        status: 'synced',
        errorMessage: null,
        createCode: async () => false,
        joinCode: async () => 'error',
        disable: () => {},
      })

      render(<App />)
      openMenu()

      expect(screen.getByRole('button', { name: 'Masquer le menu' })).not.toHaveClass('icon-btn--alert')
      expect(screen.getByRole('button', { name: 'Synchroniser' })).not.toHaveClass('icon-btn--alert')
      expect(screen.queryByRole('button', { name: /erreur de synchronisation/ })).not.toBeInTheDocument()
    })
  })

  describe('notifications système', () => {
    beforeEach(() => {
      vi.mocked(requestNotificationPermission).mockClear()
    })

    afterEach(() => {
      vi.mocked(getNotificationPermission).mockReturnValue('unsupported')
    })

    it("masque le bouton de notifications quand l'API n'est pas supportée", () => {
      vi.mocked(getNotificationPermission).mockReturnValue('unsupported')
      render(<App />)
      openMenu()
      expect(screen.queryByRole('button', { name: /notification/i })).not.toBeInTheDocument()
    })

    it("affiche le bouton et demande la permission au clic quand elle n'a pas encore été tranchée", async () => {
      vi.mocked(getNotificationPermission).mockReturnValue('default')
      vi.mocked(requestNotificationPermission).mockResolvedValue('granted')
      render(<App />)
      openMenu()
      const button = screen.getByRole('button', { name: 'Activer les notifications' })

      await act(async () => {
        fireEvent.click(button)
      })

      expect(requestNotificationPermission).toHaveBeenCalledTimes(1)
      // Comme les autres actions du menu (thème, synchro...), cliquer referme
      // le menu : le rouvrir pour vérifier que le libellé reflète bien le
      // nouvel état.
      openMenu()
      expect(screen.getByRole('button', { name: 'Notifications activées' })).toBeInTheDocument()
    })

    it('affiche déjà l\'état "activées" sans redemander tant que rien n\'est cliqué', () => {
      vi.mocked(getNotificationPermission).mockReturnValue('granted')
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Notifications activées' })).toBeInTheDocument()
      expect(requestNotificationPermission).not.toHaveBeenCalled()
    })
  })

  describe('import automatique via lien de partage', () => {
    it("ne fait rien sans paramètre import dans l'URL", () => {
      render(<App />)
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
    })

    it('retire le paramètre import de l\'URL même si le payload est invalide', () => {
      window.history.pushState({}, '', '/?import=!!!invalide')
      render(<App />)
      expect(window.location.search).toBe('')
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
    })

    it("n'ajoute rien si le lien encode une liste vide", () => {
      const encoded = encodeCountersToParam([])
      window.history.pushState({}, '', `/?import=${encoded}`)
      render(<App />)
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
    })

    it('importe directement quand aucun compteur existant (sans confirmation)', () => {
      const confirmSpy = vi.spyOn(window, 'confirm')
      const encoded = encodeCountersToParam([makeCounter({ name: 'Partagé' })])
      window.history.pushState({}, '', `/?import=${encoded}`)
      render(<App />)
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(screen.getByText('Partagé')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })

    it('remplace les compteurs existants si confirmé', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Ancien' })]))
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const encoded = encodeCountersToParam([makeCounter({ name: 'Nouveau' })])
      window.history.pushState({}, '', `/?import=${encoded}`)
      render(<App />)
      expect(screen.getByText('Nouveau')).toBeInTheDocument()
      // La carte de l'ancien compteur reste montée le temps de son animation
      // de sortie (AnimatePresence) : on attend qu'elle ait fini de disparaître.
      await waitFor(() => expect(screen.queryByText('Ancien')).not.toBeInTheDocument())
    })

    it('ajoute à la suite des compteurs existants si non confirmé', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Ancien' })]))
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const encoded = encodeCountersToParam([makeCounter({ name: 'Nouveau' })])
      window.history.pushState({}, '', `/?import=${encoded}`)
      render(<App />)
      expect(screen.getByText('Ancien')).toBeInTheDocument()
      expect(screen.getByText('Nouveau')).toBeInTheDocument()
    })
  })

  describe("raccourcis d'app PWA (?action=)", () => {
    it("ne fait rien sans paramètre action dans l'URL", () => {
      render(<App />)
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
    })

    it('?action=new crée un compteur et retire le paramètre de l\'URL', () => {
      window.history.pushState({}, '', '/?action=new')
      render(<App />)
      expect(screen.getByDisplayValue('Compteur 1')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })

    it('?action=sync ouvre le panneau de synchronisation et retire le paramètre de l\'URL', async () => {
      window.history.pushState({}, '', '/?action=sync')
      render(<App />)
      expect(await screen.findByText('Synchroniser mes compteurs')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })

    it('ignore une valeur inconnue de action et retire quand même le paramètre', () => {
      window.history.pushState({}, '', '/?action=inconnu')
      render(<App />)
      expect(screen.getByText("Aucun compteur pour l'instant.")).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })
  })

  describe('recherche', () => {
    it("n'affiche pas le bouton de recherche sans compteur", () => {
      render(<App />)
      openMenu()
      expect(screen.queryByRole('button', { name: 'Rechercher' })).not.toBeInTheDocument()
    })

    it('aucun champ de recherche visible avant un clic sur le bouton', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Un' })]))
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Rechercher' })).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Rechercher un compteur…')).not.toBeInTheDocument()
    })

    it('donne un nom accessible au champ de recherche (aria-label)', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Un' })]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      expect(screen.getByLabelText('Rechercher un compteur')).toBeInTheDocument()
    })

    it('révèle le champ au clic et filtre les compteurs par nom', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Pompes' }), makeCounter({ id: 'b', name: 'Squats' })])
      )
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      const input = screen.getByPlaceholderText('Rechercher un compteur…')
      fireEvent.change(input, { target: { value: 'pom' } })
      expect(screen.getByText('Pompes')).toBeInTheDocument()
      // La carte masquée reste montée le temps de son animation de sortie
      // (AnimatePresence) : on attend qu'elle ait fini de disparaître.
      await waitFor(() => expect(screen.queryByText('Squats')).not.toBeInTheDocument())
    })

    it("affiche un message dédié quand aucun compteur ne correspond", () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Pompes' })]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      fireEvent.change(screen.getByPlaceholderText('Rechercher un compteur…'), { target: { value: 'zzz' } })
      expect(screen.getByText('Aucun compteur ne correspond à « zzz ».')).toBeInTheDocument()
      expect(screen.queryByText('Créer mon premier compteur')).not.toBeInTheDocument()
    })

    it('ferme et réinitialise la recherche au clic sur la croix', () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Pompes' }), makeCounter({ id: 'b', name: 'Squats' })])
      )
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      fireEvent.change(screen.getByPlaceholderText('Rechercher un compteur…'), { target: { value: 'pom' } })
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la recherche' }))
      expect(screen.queryByPlaceholderText('Rechercher un compteur…')).not.toBeInTheDocument()
      expect(screen.getByText('Pompes')).toBeInTheDocument()
      expect(screen.getByText('Squats')).toBeInTheDocument()
    })

    it('ferme et réinitialise la recherche sur Échap', () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Pompes' }), makeCounter({ id: 'b', name: 'Squats' })])
      )
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      const input = screen.getByPlaceholderText('Rechercher un compteur…')
      fireEvent.change(input, { target: { value: 'pom' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByPlaceholderText('Rechercher un compteur…')).not.toBeInTheDocument()
      expect(screen.getByText('Squats')).toBeInTheDocument()
    })

    it("ignore une touche sans effet dans le champ de recherche", () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Pompes' })]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      const input = screen.getByPlaceholderText('Rechercher un compteur…')
      fireEvent.keyDown(input, { key: 'a' })
      expect(screen.getByPlaceholderText('Rechercher un compteur…')).toBeInTheDocument()
    })
  })

  describe('archivage', () => {
    const archiveCounter = (name: string) => {
      fireEvent.click(within(screen.getByText(name).closest('article')!).getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Archiver ce compteur'))
    }

    // Le filtre Actifs/Archivés est désormais un bouton unique (élément fixe
    // du menu, comme le thème) qui bascule entre les deux vues au clic — plus
    // un couple d'onglets affichés simultanément. Le menu se referme après
    // chaque sélection : on le rouvre à chaque appel.
    const toggleArchiveView = () => {
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: /^Vue : / }))
    }

    it('affiche le filtre Actifs/Archivés même sans compteur (élément fixe du menu)', () => {
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Vue : Actifs' })).toBeInTheDocument()
    })

    it('reste sur la vue Actifs par défaut et affiche le nombre de compteurs archivés une fois un compteur archivé', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
      render(<App />)
      archiveCounter('À ranger')
      openMenu()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Vue : Actifs (1 archivé(s))' })).toBeInTheDocument())
    })

    it("masque un compteur archivé de la vue Actifs", async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
      render(<App />)
      archiveCounter('À ranger')
      await waitFor(() => expect(screen.queryByText('À ranger')).not.toBeInTheDocument())
    })

    it('retrouve un compteur archivé via la vue Archivés', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
      render(<App />)
      archiveCounter('À ranger')
      await waitFor(() => expect(screen.queryByText('À ranger')).not.toBeInTheDocument())

      toggleArchiveView()
      expect(screen.getByText('À ranger')).toBeInTheDocument()
      openMenu()
      expect(screen.getByRole('button', { name: 'Vue : Archivés (1)' })).toBeInTheDocument()
    })

    it('désarchive un compteur et le fait réapparaître dans les actifs', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
      render(<App />)
      archiveCounter('À ranger')
      await waitFor(() => expect(screen.queryByText('À ranger')).not.toBeInTheDocument())

      toggleArchiveView()
      fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Désarchiver ce compteur'))
      await waitFor(() => expect(screen.queryByText('À ranger')).not.toBeInTheDocument())

      toggleArchiveView()
      expect(screen.getByText('À ranger')).toBeInTheDocument()
    })

    it('affiche un message dédié quand tous les compteurs sont archivés', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Seul' })]))
      render(<App />)
      archiveCounter('Seul')
      await waitFor(() => expect(screen.getByText('Tous tes compteurs sont archivés.')).toBeInTheDocument())
    })

    it('affiche un message dédié une fois la vue Archivés vidée (dernier compteur désarchivé)', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
      render(<App />)
      archiveCounter('À ranger')
      openMenu()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Vue : Actifs (1 archivé(s))' })).toBeInTheDocument())

      toggleArchiveView()
      fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Désarchiver ce compteur'))
      expect(screen.getByText('Aucun compteur archivé.')).toBeInTheDocument()
    })

    it('filtre par nom à l\'intérieur de la vue Archivés', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Pompes' }), makeCounter({ id: 'b', name: 'Squats' })])
      )
      render(<App />)
      archiveCounter('Pompes')
      archiveCounter('Squats')
      await waitFor(() => expect(screen.getByText('Tous tes compteurs sont archivés.')).toBeInTheDocument())

      toggleArchiveView()
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
      fireEvent.change(screen.getByPlaceholderText('Rechercher un compteur…'), { target: { value: 'pom' } })
      expect(screen.getByText('Pompes')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText('Squats')).not.toBeInTheDocument())
    })

    it('duplique un compteur archivé en une copie active (non archivée)', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Source' })]))
      render(<App />)
      archiveCounter('Source')
      await waitFor(() => expect(screen.getByText('Tous tes compteurs sont archivés.')).toBeInTheDocument())

      toggleArchiveView()
      fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByText('Dupliquer ce compteur'))

      toggleArchiveView()
      expect(screen.getByText('Source (copie)')).toBeInTheDocument()
    })

    it("revient sur la vue Actifs à la création d'un compteur depuis la vue Archivés", async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Existant' })]))
      render(<App />)
      archiveCounter('Existant')
      await waitFor(() => expect(screen.queryByText('Existant')).not.toBeInTheDocument())

      toggleArchiveView()
      expect(screen.getByText('Existant')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compteur' }))
      openMenu()
      expect(screen.getByRole('button', { name: /^Vue : Actifs/ })).toBeInTheDocument()
      expect(screen.getByDisplayValue('Compteur 2')).toBeInTheDocument()
    })

    it('garde le glisser-déposer actif même avec des compteurs archivés (ils gardent leur place hors vue)', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Un' }), makeCounter({ id: 'b', name: 'Deux' })])
      )
      render(<App />)
      archiveCounter('Un')
      await waitFor(() => expect(screen.queryByText('Un')).not.toBeInTheDocument())
      expect(document.querySelector('.counter-drag-handle')).toBeInTheDocument()
    })

    describe('archivedAt (durée figée)', () => {
      beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date(2026, 7, 10))
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it("enregistre la date d'archivage", async () => {
        window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'À ranger' })]))
        render(<App />)
        archiveCounter('À ranger')
        await waitFor(() => {
          const stored = JSON.parse(window.localStorage.getItem('+1.counters.v1') ?? '[]')
          expect(stored[0].archivedAt).toBe(new Date(2026, 7, 10).getTime())
        })
      })

      it("efface la date d'archivage au désarchivage", async () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({ name: 'À ranger', archived: true, archivedAt: new Date(2026, 7, 5).getTime() }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        fireEvent.click(screen.getByRole('button', { name: 'Actions du compteur' }))
        fireEvent.click(screen.getByText('Désarchiver ce compteur'))
        await waitFor(() => {
          const stored = JSON.parse(window.localStorage.getItem('+1.counters.v1') ?? '[]')
          expect(stored[0].archivedAt).toBeUndefined()
        })
      })
    })

    describe('statistiques cumulées (vue Archivés)', () => {
      it("n'affiche pas de barre de statistiques sans compteur archivé", () => {
        window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter({ name: 'Actif' })]))
        render(<App />)
        expect(document.querySelector('.archive-stats-bar')).not.toBeInTheDocument()
      })

      it("n'affiche pas de barre de statistiques en vue Actifs, même avec des compteurs archivés", () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([makeCounter({ name: 'Rangé', archived: true, count: 5 })])
        )
        render(<App />)
        expect(document.querySelector('.archive-stats-bar')).not.toBeInTheDocument()
      })

      it('regroupe la barre de statistiques sous un role="group" nommé, pour un lecteur d\'écran', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([makeCounter({ name: 'Rangé', archived: true, count: 5 })])
        )
        render(<App />)
        toggleArchiveView()
        expect(screen.getByRole('group', { name: 'Statistiques des compteurs archivés' })).toBeInTheDocument()
      })

      it('cumule le nombre et le total sur tous les compteurs archivés (singulier)', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([makeCounter({ name: 'Rangé', archived: true, count: 42 })])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).getByText('1')).toBeInTheDocument()
        expect(within(bar).getByText('compteur archivé')).toBeInTheDocument()
        expect(within(bar).getByText('total cumulé')).toBeInTheDocument()
        // Un seul compteur : la valeur totale, moyenne et médiane valent
        // toutes 42 — on scope la recherche à chaque puce pour ne pas
        // confondre les 3 occurrences du texte "42".
        const totalChip = within(bar).getByText('total cumulé').closest('.archive-stat') as HTMLElement
        expect(within(totalChip).getByText('42')).toBeInTheDocument()
      })

      it('affiche la valeur moyenne et la valeur médiane par compteur archivé', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({ id: 'a', name: 'Un', archived: true, count: 10 }),
            makeCounter({ id: 'b', name: 'Deux', archived: true, count: 20 }),
            makeCounter({ id: 'c', name: 'Trois', archived: true, count: 60 }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        // Moyenne : (10 + 20 + 60) / 3 = 30. Médiane : valeur centrale une
        // fois triées (10, 20, 60) = 20.
        const averageChip = within(bar).getByText('valeur moyenne').closest('.archive-stat') as HTMLElement
        expect(within(averageChip).getByText('30')).toBeInTheDocument()
        const medianChip = within(bar).getByText('valeur médiane').closest('.archive-stat') as HTMLElement
        expect(within(medianChip).getByText('20')).toBeInTheDocument()
      })

      it('accorde le libellé au pluriel avec plusieurs compteurs archivés, et cumule leur total', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({ id: 'a', name: 'Un', archived: true, count: 10 }),
            makeCounter({ id: 'b', name: 'Deux', archived: true, count: 5 }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).getByText('2')).toBeInTheDocument()
        expect(within(bar).getByText('compteurs archivés')).toBeInTheDocument()
        expect(within(bar).getByText('15')).toBeInTheDocument()
      })

      it("n'affiche pas de moyenne par jour quand aucun compteur archivé n'a de date d'archivage connue", () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([makeCounter({ name: 'Rangé', archived: true, count: 10 })])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).queryByText('en moyenne')).not.toBeInTheDocument()
      })

      it("affiche la moyenne par jour cumulée dès qu'un compteur archivé a une date d'archivage connue", () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({
              name: 'Rangé',
              archived: true,
              count: 20,
              createdAt: new Date(2026, 0, 1).getTime(),
              archivedAt: new Date(2026, 0, 11).getTime(), // 10 jours -> 2/jour
            }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).getByText('2 / jour')).toBeInTheDocument()
        expect(within(bar).getByText('en moyenne')).toBeInTheDocument()
      })

      it("n'affiche pas de durée moyenne quand aucun compteur archivé n'a de date d'archivage connue", () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([makeCounter({ name: 'Rangé', archived: true, count: 10 })])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).queryByText('durée moyenne')).not.toBeInTheDocument()
      })

      it('affiche le nombre de jours moyen passé sur les compteurs archivés', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({
              id: 'a',
              name: 'Un',
              archived: true,
              createdAt: new Date(2026, 0, 1).getTime(),
              archivedAt: new Date(2026, 0, 11).getTime(), // 10 jours
            }),
            makeCounter({
              id: 'b',
              name: 'Deux',
              archived: true,
              createdAt: new Date(2026, 0, 1).getTime(),
              archivedAt: new Date(2026, 0, 21).getTime(), // 20 jours
            }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        // (10 + 20) / 2 = 15 jours
        expect(within(bar).getByText('15 jours')).toBeInTheDocument()
        expect(within(bar).getByText('durée moyenne')).toBeInTheDocument()
      })

      it('reste basée sur tous les compteurs archivés, indépendamment du filtre de recherche actif', () => {
        window.localStorage.setItem(
          '+1.counters.v1',
          JSON.stringify([
            makeCounter({ id: 'a', name: 'Pompes', archived: true, count: 10 }),
            makeCounter({ id: 'b', name: 'Squats', archived: true, count: 5 }),
          ])
        )
        render(<App />)
        toggleArchiveView()
        openMenu()
        fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
        fireEvent.change(screen.getByPlaceholderText('Rechercher un compteur…'), { target: { value: 'pom' } })
        expect(screen.getByText('Pompes')).toBeInTheDocument()

        // Calculée à partir de tous les compteurs archivés (`counters`), pas
        // du sous-ensemble filtré par la recherche (`filteredCounters`) :
        // reste à 2/15 même une fois la recherche appliquée.
        const bar = document.querySelector('.archive-stats-bar') as HTMLElement
        expect(within(bar).getByText('2')).toBeInTheDocument()
        expect(within(bar).getByText('15')).toBeInTheDocument()
      })
    })
  })

  describe('épinglage', () => {
    const counterNames = () => Array.from(document.querySelectorAll('.counter-name')).map((el) => el.textContent)

    const togglePinFor = (name: string) => {
      fireEvent.click(within(screen.getByText(name).closest('article')!).getByRole('button', { name: 'Actions du compteur' }))
      fireEvent.click(screen.getByRole('button', { name: /Épingler|Détacher/ }))
    }

    it('fait remonter un compteur épinglé en tête de liste, devant les compteurs non épinglés', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([
          makeCounter({ id: 'a', name: 'Un' }),
          makeCounter({ id: 'b', name: 'Deux' }),
          makeCounter({ id: 'c', name: 'Trois' }),
        ])
      )
      render(<App />)
      togglePinFor('Trois')
      await waitFor(() => expect(counterNames()).toEqual(['Trois', 'Un', 'Deux']))
    })

    it('détache un compteur et le laisse à sa position de tri normale', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Un' }), makeCounter({ id: 'b', name: 'Deux', pinned: true })])
      )
      render(<App />)
      expect(counterNames()).toEqual(['Deux', 'Un'])
      togglePinFor('Deux')
      await waitFor(() => expect(counterNames()).toEqual(['Un', 'Deux']))
    })
  })

  describe('réordonnancement au clavier (équivalent du glisser-déposer)', () => {
    const counterNames = () => Array.from(document.querySelectorAll('.counter-name')).map((el) => el.textContent)
    const dragHandleFor = (name: string) =>
      within(screen.getByText(name).closest('article')!).getByRole('button', {
        name: 'Réordonner le compteur (flèches Haut/Bas)',
      })

    it("ArrowDown sur la poignée échange le compteur avec son suivant", async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([
          makeCounter({ id: 'a', name: 'Un' }),
          makeCounter({ id: 'b', name: 'Deux' }),
          makeCounter({ id: 'c', name: 'Trois' }),
        ])
      )
      render(<App />)
      fireEvent.keyDown(dragHandleFor('Un'), { key: 'ArrowDown' })
      await waitFor(() => expect(counterNames()).toEqual(['Deux', 'Un', 'Trois']))
    })

    it("ArrowUp sur la poignée du premier compteur ne change rien (déjà en tête)", () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Un' }), makeCounter({ id: 'b', name: 'Deux' })])
      )
      render(<App />)
      fireEvent.keyDown(dragHandleFor('Un'), { key: 'ArrowUp' })
      expect(counterNames()).toEqual(['Un', 'Deux'])
    })

    it('annonce le nouveau rang pour les lecteurs d\'écran (région aria-live)', async () => {
      window.localStorage.setItem(
        '+1.counters.v1',
        JSON.stringify([makeCounter({ id: 'a', name: 'Un' }), makeCounter({ id: 'b', name: 'Deux' })])
      )
      render(<App />)
      fireEvent.keyDown(dragHandleFor('Un'), { key: 'ArrowDown' })
      await waitFor(() => expect(screen.getByText('Un déplacé en position 2 sur 2')).toBeInTheDocument())
    })
  })

  describe("menu de l'en-tête", () => {
    it("se ferme et rend le focus au bouton menu à l'appui sur Échap", () => {
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('button', { name: 'Thème : Auto' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toHaveFocus()
    })

    it("ignore les autres touches que Échap", () => {
      render(<App />)
      openMenu()
      fireEvent.keyDown(document, { key: 'a' })
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
    })

    it('se ferme au clic/tap en dehors', () => {
      render(<App />)
      openMenu()
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
      fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('button', { name: 'Thème : Auto' })).not.toBeInTheDocument()
    })

    it("un pointerdown à l'intérieur du menu ne le ferme pas", () => {
      render(<App />)
      openMenu()
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Thème : Auto' }))
      expect(screen.getByRole('button', { name: 'Thème : Auto' })).toBeInTheDocument()
    })
  })

  describe('mode focus', () => {
    it("n'affiche pas le bouton mode focus sans compteur", () => {
      render(<App />)
      openMenu()
      expect(screen.queryByRole('button', { name: 'Mode focus' })).not.toBeInTheDocument()
    })

    it('masque l\'en-tête et affiche le bouton de sortie au clic', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      expect(screen.queryByRole('heading', { name: 'PlusUn' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quitter le mode focus' })).toBeInTheDocument()
    })

    it('quitte le mode focus au clic sur le bouton de sortie', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      fireEvent.click(screen.getByRole('button', { name: 'Quitter le mode focus' }))
      expect(screen.getByRole('heading', { name: 'PlusUn' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Quitter le mode focus' })).not.toBeInTheDocument()
    })

    it('déplace le focus clavier vers le bouton de sortie à l\'activation', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      expect(screen.getByRole('button', { name: 'Quitter le mode focus' })).toHaveFocus()
    })

    it('rend le focus au bouton menu à la sortie', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      fireEvent.click(screen.getByRole('button', { name: 'Quitter le mode focus' }))
      expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toHaveFocus()
    })

    it('quitte le mode focus avec Échap', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getByRole('heading', { name: 'PlusUn' })).toBeInTheDocument()
    })

    it('ignore une autre touche que Échap en mode focus', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      fireEvent.keyDown(document, { key: 'a' })
      expect(screen.queryByRole('heading', { name: 'PlusUn' })).not.toBeInTheDocument()
    })
  })

  describe("plein écran de l'appareil", () => {
    // `document.fullscreenElement` est en lecture seule dans jsdom : on la
    // redéfinit pour simuler l'état plein écran natif du navigateur.
    function stubFullscreenElement(value: Element | null) {
      Object.defineProperty(document, 'fullscreenElement', { value, configurable: true })
    }

    afterEach(() => {
      stubFullscreenElement(null)
    })

    it("n'affiche pas le bouton plein écran sans compteur", () => {
      render(<App />)
      openMenu()
      expect(screen.queryByRole('button', { name: 'Plein écran' })).not.toBeInTheDocument()
    })

    it("demande le plein écran natif du navigateur à l'activation, et ignore silencieusement un refus", async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      const requestFullscreen = vi.fn().mockRejectedValue(new Error('refusé'))
      document.documentElement.requestFullscreen = requestFullscreen
      render(<App />)
      openMenu()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      })
      expect(requestFullscreen).toHaveBeenCalledTimes(1)
      openMenu()
      expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toBeInTheDocument()
      // @ts-expect-error nettoyage du stub posé pour ce test
      delete document.documentElement.requestFullscreen
    })

    it('quitte le plein écran natif du navigateur au reclic, et ignore silencieusement un refus', async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      const exitFullscreen = vi.fn().mockRejectedValue(new Error('refusé'))
      document.exitFullscreen = exitFullscreen
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      stubFullscreenElement(document.body)
      openMenu()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Quitter le plein écran' }))
      })
      expect(exitFullscreen).toHaveBeenCalledTimes(1)
      // @ts-expect-error nettoyage du stub posé pour ce test
      delete document.exitFullscreen
    })

    it("resynchronise l'état si le plein écran natif est quitté autrement que par notre bouton", () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      stubFullscreenElement(null)
      fireEvent(document, new Event('fullscreenchange'))
      openMenu()
      expect(screen.getByRole('button', { name: 'Plein écran' })).toBeInTheDocument()
    })

    it('ignore un changement de plein écran natif tant que celui-ci reste actif', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      stubFullscreenElement(document.body)
      fireEvent(document, new Event('fullscreenchange'))
      openMenu()
      expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toBeInTheDocument()
    })

    it('est indépendant du mode focus : activable seul sans masquer l\'en-tête', () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      expect(screen.getByRole('heading', { name: 'PlusUn' })).toBeInTheDocument()
    })

    it("le bouton de sortie du mode focus quitte aussi le plein écran de l'appareil", async () => {
      window.localStorage.setItem('+1.counters.v1', JSON.stringify([makeCounter()]))
      const exitFullscreen = vi.fn().mockResolvedValue(undefined)
      document.exitFullscreen = exitFullscreen
      render(<App />)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
      stubFullscreenElement(document.body)
      openMenu()
      fireEvent.click(screen.getByRole('button', { name: 'Mode focus' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Quitter le mode focus' }))
      })
      expect(exitFullscreen).toHaveBeenCalledTimes(1)
      // @ts-expect-error nettoyage du stub posé pour ce test
      delete document.exitFullscreen
    })
  })
})
