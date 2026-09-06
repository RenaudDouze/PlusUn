import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, Reorder } from 'framer-motion'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useRemoteSync } from './hooks/useRemoteSync'
import { useSystemDarkMode } from './hooks/useSystemDarkMode'
import { CounterCard } from './components/CounterCard'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  ArchiveIcon,
  BellIcon,
  CloseIcon,
  EyeIcon,
  FocusIcon,
  FullscreenIcon,
  MoonIcon,
  MoreIcon,
  SearchIcon,
  SunIcon,
  SyncIcon,
  ThemeAutoIcon,
} from './components/icons'
import { decodeCountersFromParam, migrateStoredCounter } from './sync'
import { mergeVisibleOrder } from './reorder'
import { computeArchiveStats } from './archiveStats'
import { makeId } from './id'
import { COLORS, pickColor } from './colors'
import { getNotificationPermission, requestNotificationPermission, showLocalNotification } from './notifications'
import type { NotificationPermissionState } from './notifications'
import type { Counter } from './types'
import './App.css'

// Chargé à la demande : n'entre dans le bundle initial que si le panneau de
// synchronisation est effectivement ouvert (embarque la dépendance QRCode).
const SyncPanel = lazy(() => import('./components/SyncPanel').then((m) => ({ default: m.SyncPanel })))

const UNDO_TIMEOUT_MS = 5000
const SYNC_NOTICE_TIMEOUT_MS = 4000
// Plafond raisonnable : au-delà, les actions les plus anciennes de la
// session tombent hors de portée plutôt que de faire grossir indéfiniment
// l'instantané gardé en mémoire.
const MAX_UNDO_STACK = 10

type ThemePreference = 'system' | 'light' | 'dark'

const THEME_ICON: Record<ThemePreference, typeof ThemeAutoIcon> = { system: ThemeAutoIcon, light: SunIcon, dark: MoonIcon }
const THEME_LABEL: Record<ThemePreference, string> = { system: 'Auto', light: 'Clair', dark: 'Sombre' }
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }

// 'unsupported' n'a pas de libellé de bouton : le bouton est masqué dans ce
// cas plutôt que de proposer une action qui ne peut rien faire.
const NOTIFICATION_LABEL: Record<Exclude<NotificationPermissionState, 'unsupported'>, string> = {
  default: 'Activer les notifications',
  granted: 'Notifications activées',
  denied: "Notifications refusées — à réactiver depuis les réglages du navigateur",
}

type ArchiveView = 'active' | 'archived'

// Même logique d'icône cyclique que le thème : un seul bouton dont
// l'icône/le libellé reflètent la vue courante, plutôt qu'une paire d'onglets
// affichés simultanément.
const ARCHIVE_VIEW_ICON: Record<ArchiveView, typeof EyeIcon> = { active: EyeIcon, archived: ArchiveIcon }
const NEXT_ARCHIVE_VIEW: Record<ArchiveView, ArchiveView> = { active: 'archived', archived: 'active' }

// Migration depuis les clés "compteur.*" (nom du projet avant son renommage
// en « +1 ») : copie puis nettoie, pour ne pas perdre les compteurs déjà
// enregistrés chez les utilisateurs existants. Appelée en tête du composant,
// avant les `useLocalStorage` ci-dessous : sur le premier rendu (le seul qui
// compte, leur état initial n'étant lu qu'une fois), la clé est donc déjà
// migrée au moment où ils la lisent. Cette fonction n'est pas un hook (pas
// d'appel à une API React) : l'appeler directement dans le corps du composant
// ne viole pas les règles des hooks, et la reste des rendus suivants ne
// coûte que quelques lectures `localStorage` (`newKey` déjà présente).
function migrateLegacyStorageKey(oldKey: string, newKey: string) {
  try {
    if (window.localStorage.getItem(newKey) !== null) return
    const legacy = window.localStorage.getItem(oldKey)
    if (legacy === null) return
    window.localStorage.setItem(newKey, legacy)
    window.localStorage.removeItem(oldKey)
  } catch {
    // stockage indisponible : rien à migrer
  }
}

// Migre les compteurs stockés au format à plat (avant le regroupement des
// réglages en `behavior`/`appearance`) vers le nouveau format imbriqué.
// Idempotente (un compteur déjà migré ressort inchangé) : peut donc être
// appelée à chaque montage sans vérification préalable, comme
// `migrateLegacyStorageKey` ci-dessus, et pour la même raison — s'exécuter
// avant que `useLocalStorage` ne lise la clé.
function migrateCounterShape(key: string) {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === null) return
    const parsed = JSON.parse(stored)
    // Pas de vérification explicite Array.isArray : un `parsed` qui n'est pas
    // un tableau fait échouer `.map` juste en dessous, intercepté par le
    // catch (rien à migrer dans ce cas non plus).
    window.localStorage.setItem(key, JSON.stringify(parsed.map(migrateStoredCounter)))
  } catch {
    // stockage indisponible ou contenu invalide : rien à migrer
  }
}

export default function App() {
  migrateLegacyStorageKey('compteur.counters.v1', '+1.counters.v1')
  migrateLegacyStorageKey('compteur.theme.v1', '+1.theme.v1')
  migrateCounterShape('+1.counters.v1')

  const [counters, setCounters] = useLocalStorage<Counter[]>('+1.counters.v1', [])
  // Message éphémère affiché quand des compteurs arrivent d'un autre appareil
  // pendant que l'app est déjà ouverte (voir `useRemoteSync`, `onRemoteUpdate`) :
  // seul indice visible en dehors du panneau Synchroniser qu'une mise à jour
  // vient d'être reçue.
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const syncNoticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showSyncNotice = () => {
    const message = 'Compteurs mis à jour depuis un autre appareil'
    setSyncNotice(message)
    clearTimeout(syncNoticeTimer.current)
    syncNoticeTimer.current = setTimeout(() => setSyncNotice(null), SYNC_NOTICE_TIMEOUT_MS)
    // Complète le toast (invisible si l'onglet n'est pas au premier plan) par
    // une notification système — voir notifications.ts pour les conditions
    // (permission déjà accordée, onglet effectivement en arrière-plan).
    void showLocalNotification('PlusUn', { body: message })
  }
  // Absent (fonctionnalité non configurée) tant que le worker de synchro n'a
  // pas été déployé et sa variable d'environnement renseignée au build — voir
  // worker/README.md. `useRemoteSync` reste alors inerte (aucun appel réseau).
  const remoteSync = useRemoteSync(import.meta.env.VITE_SYNC_WORKER_URL, counters, setCounters, showSyncNotice)
  // Id du compteur qui vient d'être créé, pour ouvrir directement son champ
  // de nom en édition (voir `addCounter`). Remis à `null` juste après le
  // montage de la carte concernée : sans ça, un futur remontage de la même
  // carte (ex: réordonnée hors puis de nouveau dans la liste filtrée)
  // rouvrirait l'édition de façon inattendue.
  const [autoEditId, setAutoEditId] = useState<string | null>(null)
  useEffect(() => {
    setAutoEditId(null)
  }, [autoEditId])

  // La recherche, le thème, le partage, le mode focus, le plein écran et le filtre
  // Actifs/Archivés vivent dans ce menu déroulant horizontal, replié par
  // défaut pour ne pas encombrer l'en-tête. Il s'ouvre en survol (position
  // absolue ancrée sous le bouton ⋯, pas en poussant le reste de la page) et
  // se referme après chaque sélection, comme un menu classique — sinon il
  // resterait posé par-dessus les compteurs en dessous. Contrairement à ces
  // actions, « + Nouveau compteur » reste toujours visible dans l'en-tête :
  // c'est l'action la plus fréquente, elle ne doit pas se cacher derrière un
  // clic supplémentaire.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Ferme le menu à l'appui sur Échap (en lui rendant le focus, comme les
  // autres panneaux de l'app) ou au clic/tap en dehors — sans quoi la seule
  // façon de le refermer au clavier était d'activer une de ses actions.
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  // Annonce (lecteur d'écran) du nouveau rang après un déplacement au clavier
  // (voir moveCounter) : le glisser-déposer souris/tactile est visible à
  // l'écran, son équivalent clavier a besoin de cette confirmation explicite.
  const [reorderAnnouncement, setReorderAnnouncement] = useState('')

  // Notifications système (objectif atteint, compteurs mis à jour depuis un
  // autre appareil) : voir notifications.ts. `getNotificationPermission`
  // lu une seule fois au montage suffit — la permission ne peut changer que
  // via `requestNotifications` ci-dessous (jamais en dehors d'une action de
  // cette app), pas besoin de la re-sonder ailleurs.
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission)
  const requestNotifications = async () => {
    setNotificationPermission(await requestNotificationPermission())
    setMenuOpen(false)
  }

  const [syncOpen, setSyncOpen] = useState(false)
  // Pile (dernier entré, premier sorti) : chaque action destructrice
  // consécutive s'empile plutôt que d'écraser la précédente, pour pouvoir
  // remonter plusieurs actions d'affilée tant que le délai n'est pas écoulé.
  const [undoStack, setUndoStack] = useState<Array<{ label: string; counters: Counter[] }>>([])
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
  }
  const matchesSearch = (c: Counter) => {
    const query = searchQuery.trim().toLowerCase()
    return query === '' || c.name.toLowerCase().includes(query)
  }

  // Bascule l'ensemble de la liste (archivés masqués par défaut) ; la
  // recherche filtre ensuite par nom à l'intérieur de la vue active.
  const [archiveView, setArchiveView] = useState<'active' | 'archived'>('active')
  const archivedCount = useMemo(() => counters.filter((c) => c.archived).length, [counters])
  // Statistiques cumulées sur l'ensemble des compteurs archivés (par
  // opposition aux stats déjà affichées par carte, propres à un seul
  // compteur) : indépendantes de la recherche, comme `archivedCount`
  // ci-dessus — elles portent sur l'ensemble des archives, pas seulement sur
  // ce que le filtre en cours laisse visible.
  const archiveStats = useMemo(() => computeArchiveStats(counters), [counters])
  const filteredCounters = useMemo(
    () => counters.filter((c) => (archiveView === 'archived' ? !!c.archived : !c.archived) && matchesSearch(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counters, archiveView, searchQuery]
  )
  // Fait remonter les compteurs épinglés en tête d'affichage, sans toucher à
  // leur ordre de tri manuel entre eux (tri stable) : une alternative rapide
  // au glisser-déposer pour les compteurs qu'on veut garder à portée de main.
  const sortedCounters = useMemo(
    () => [...filteredCounters].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)),
    [filteredCounters]
  )

  const [themePreference, setThemePreference] = useLocalStorage<ThemePreference>('+1.theme.v1', 'system')
  const systemDark = useSystemDarkMode()
  const activeTheme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference

  // Masque l'en-tête (titre, icônes, recherche, filtre archivés) pour ne
  // garder que les compteurs à l'écran, sans passer par le plein écran natif
  // du navigateur (`requestFullscreen`) : celui-ci prend tout l'écran de
  // l'appareil (masque aussi la barre d'adresse/les onglets, voire déborde
  // sur d'autres écrans en configuration multi-écran) plutôt que de rester
  // dans la fenêtre/onglet déjà ouvert — pas ce qui est recherché ici, un
  // simple affichage épuré dans l'espace disponible.
  const [focusMode, setFocusMode] = useState(false)
  const focusExitBtnRef = useRef<HTMLButtonElement>(null)
  // Mémorise qu'on était en mode focus, pour détecter la transition
  // true -> false dans l'effet ci-dessous (comparer à la seule valeur
  // courante de `focusMode` ne suffit pas à savoir d'où l'on vient).
  const wasFocusModeRef = useRef(false)

  // Déplace explicitement le focus clavier à chaque bascule, une fois le DOM
  // à jour (donc après le rendu, dans un effet plutôt que dans le handler de
  // clic lui-même) : à l'activation, le bouton de sortie qui vient d'
  // apparaître ; à la désactivation, le bouton menu qui avait déclenché le
  // mode — comme une modale le fait déjà à son ouverture/fermeture. Sans ce
  // déplacement, le focus resterait sur un élément qui vient de disparaître
  // du DOM, perdu jusqu'au prochain Tab.
  useEffect(() => {
    if (focusMode) {
      focusExitBtnRef.current?.focus()
      wasFocusModeRef.current = true
    } else if (wasFocusModeRef.current) {
      wasFocusModeRef.current = false
      menuButtonRef.current?.focus()
    }
  }, [focusMode])

  const exitFocusMode = () => {
    setFocusMode(false)
    // Un seul bouton de sortie visible dans cet état : il ramène à
    // l'affichage normal en une fois, y compris si le plein écran natif de
    // l'appareil était aussi actif.
    setDeviceFullscreen(false)
  }

  useEffect(() => {
    if (!focusMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFocusMode()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode])

  // Bascule indépendante vers le plein écran natif de l'appareil
  // (`requestFullscreen`) : contrairement au mode focus ci-dessus, réclame
  // vraiment tout l'écran (masque la barre d'adresse/les onglets), pour qui
  // le souhaite explicitement (ex : poser la tablette en écran dédié). Les
  // deux modes sont combinables mais indépendants l'un de l'autre.
  const [deviceFullscreen, setDeviceFullscreen] = useState(false)

  useEffect(() => {
    if (deviceFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [deviceFullscreen])

  // Resynchronise l'état si le plein écran natif est quitté autrement que
  // par notre bouton (ex : touche Échap gérée nativement par le navigateur,
  // ou raccourci système).
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setDeviceFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Applique le thème au document (déjà posé une première fois par le script
  // inline de index.html, pour éviter un flash) et adapte la couleur de la
  // barre de statut du navigateur/PWA en conséquence.
  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', activeTheme === 'dark' ? '#0f172a' : '#f8fafc')
  }, [activeTheme])

  // Garde un instantané des compteurs avant une action destructrice (ou
  // difficile à corriger à la main), pour permettre de l'annuler pendant
  // quelques secondes via le message qui apparaît en bas d'écran. Empilé
  // plutôt qu'écrasé : des actions consécutives (ex : plusieurs suppressions
  // d'affilée) restent chacune annulable individuellement, dans l'ordre
  // inverse. Chaque nouvelle action relance le délai pour l'ensemble de la
  // pile — le temps disponible reflète toujours l'inactivité écoulée, pas le
  // nombre d'actions en attente.
  const pushUndo = (label: string) => {
    setUndoStack((prev) => [...prev, { label, counters }].slice(-MAX_UNDO_STACK))
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndoStack([]), UNDO_TIMEOUT_MS)
  }

  // N'est rendu accessible que via le bouton du message d'annulation, qui
  // n'existe dans le DOM que lorsque la pile n'est pas vide. Ne restaure que
  // la dernière action empilée ; s'il en reste d'autres en dessous, le
  // message reste affiché (avec un délai relancé) pour permettre de
  // continuer à remonter.
  const handleUndo = () => {
    const last = undoStack[undoStack.length - 1]
    setCounters(last.counters)
    setUndoStack((prev) => prev.slice(0, -1))
    clearTimeout(undoTimer.current)
    if (undoStack.length > 1) {
      undoTimer.current = setTimeout(() => setUndoStack([]), UNDO_TIMEOUT_MS)
    }
  }

  // Import automatique si l'app est ouverte via un lien de partage (?import=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payload = params.get('import')
    if (!payload) return

    const imported = decodeCountersFromParam(payload)
    const url = new URL(window.location.href)
    url.searchParams.delete('import')
    window.history.replaceState({}, '', url.toString())

    if (!imported || imported.length === 0) return

    setCounters((prev) => {
      if (prev.length === 0) return imported
      const replace = window.confirm(
        `Importer ${imported.length} compteur(s) partagé(s) ?\n\nOK pour remplacer tes ${prev.length} compteur(s) actuel(s), Annuler pour les ajouter à la suite.`
      )
      return replace ? imported : [...prev, ...imported]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCounter = () => {
    const newCounter: Counter = {
      id: makeId(),
      name: `Compteur ${counters.length + 1}`,
      count: 0,
      createdAt: Date.now(),
      behavior: {},
      appearance: { color: pickColor(counters.length) },
    }
    setCounters((prev) => [...prev, newCounter])
    // Sinon le nouveau compteur atterrit hors champ si on était sur l'onglet
    // Archivés, sans indice visible pour l'utilisateur.
    setArchiveView('active')
    setAutoEditId(newCounter.id)
  }

  // Action rapide depuis un raccourci de l'app installée (?action=new|sync),
  // déclarés dans le manifest PWA (voir vite.config.ts).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    if (!action) return

    const url = new URL(window.location.href)
    url.searchParams.delete('action')
    window.history.replaceState({}, '', url.toString())

    if (action === 'new') addCounter()
    if (action === 'sync') setSyncOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Applique un patch de champs à un seul compteur, identifié par son id.
  // Point d'entrée commun à tous les réglages simples (nom, couleur, pas,
  // objectif...) qui remplacent juste un ou plusieurs champs sans logique
  // additionnelle (contrairement à updateCount/setCount, qui tiennent aussi
  // l'historique et l'undo à jour).
  const updateCounter = (id: string, patch: Partial<Counter>) => {
    setCounters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const updateCount = (id: string, delta: number) => {
    setCounters((prev) => prev.map((c) => (c.id === id ? { ...c, count: c.count + delta } : c)))
  }

  const setCount = (id: string, count: number) => {
    const target = counters.find((c) => c.id === id)!
    if (target.count !== count) pushUndo(`Valeur de « ${target.name} » modifiée`)
    setCounters((prev) => prev.map((c) => (c.id === id ? { ...c, count } : c)))
  }

  const deleteCounter = (id: string) => {
    const target = counters.find((c) => c.id === id)!
    pushUndo(`Compteur « ${target.name} » supprimé`)
    setCounters((prev) => prev.filter((c) => c.id !== id))
  }

  // Reprend l'apparence et la configuration du compteur source (couleur,
  // style, pas, probabilité, objectif, image de fond), mais repart de zéro :
  // nouvel id, compte et historique vierges, pas de date de début figée. Un
  // compteur archivé ne doit pas produire une copie elle-même déjà archivée.
  const duplicateCounter = (id: string) => {
    const source = counters.find((c) => c.id === id)!
    const copy: Counter = {
      ...source,
      id: makeId(),
      name: `${source.name} (copie)`,
      count: 0,
      createdAt: Date.now(),
      archived: undefined,
      archivedAt: undefined,
      behavior: { ...source.behavior, startDate: undefined },
    }
    setCounters((prev) => [...prev, copy])
  }

  // Fige `archivedAt` à l'archivage : sert de date de fin pour figer la
  // durée totale affichée (carte + modale Valeur & réglages). Effacé au
  // désarchivage, un ré-archivage ultérieur repart d'une nouvelle date.
  const toggleArchive = (id: string) => {
    setCounters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archived: !c.archived, archivedAt: c.archived ? undefined : Date.now() } : c))
    )
  }

  const togglePin = (id: string) => {
    setCounters((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)))
  }

  const handleImport = (imported: Counter[], mode: 'replace' | 'merge') => {
    setCounters((prev) => (mode === 'replace' ? imported : [...prev, ...imported]))
  }

  // Le glisser-déposer peut porter sur un sous-ensemble filtré (recherche,
  // vue Actifs/Archivés) : fusionne le nouvel ordre dans la liste complète en
  // gardant les compteurs masqués à leur position. La logique de fusion
  // elle-même est testée unitairement dans reorder.test.ts ; ce point de
  // branchement ne s'exécute qu'au relâchement d'un vrai glisser-déposer
  // (Reorder.Group de framer-motion), qui ne se déclenche pas dans jsdom
  // (mesures de layout absentes) — vérifié par un test dédié dans
  // advanced-features.spec.ts (e2e, navigateur réel).
  /* v8 ignore next 3 */
  const reorderVisible = (newOrder: Counter[]) => {
    setCounters((prev) => mergeVisibleOrder(prev, newOrder))
  }

  // Équivalent clavier au glisser-déposer (Reorder.Item ci-dessus ne réagit
  // qu'au pointeur) : échange le compteur avec son voisin dans la liste
  // affichée, et annonce le nouveau rang via la région aria-live ci-dessous
  // — un glisser-déposer réussi est visible à l'écran, mais silencieux pour
  // un lecteur d'écran sans cette annonce explicite.
  const moveCounter = (id: string, direction: 1 | -1) => {
    const index = sortedCounters.findIndex((c) => c.id === id)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= sortedCounters.length) return
    const newOrder = [...sortedCounters]
    ;[newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
    reorderVisible(newOrder)
    setReorderAnnouncement(`${sortedCounters[index].name} déplacé en position ${targetIndex + 1} sur ${sortedCounters.length}`)
  }

  // Signale une erreur de synchro dès l'en-tête (bouton menu) et sur le
  // bouton Synchroniser dans le menu déroulant : sans ça, rien ne
  // l'indiquait en dehors de la modale Synchroniser elle-même, qu'il faut
  // donc ouvrir "à l'aveugle" pour découvrir qu'un souci existe.
  const hasSyncError = remoteSync.status === 'error'

  // Calculés une fois pour servir à la fois d'aria-label et d'infobulle
  // (`title`) sur leur bouton respectif.
  const menuButtonLabel = `${menuOpen ? 'Masquer le menu' : 'Ouvrir le menu'}${hasSyncError ? ' (erreur de synchronisation)' : ''}`
  const syncButtonLabel = `Synchroniser${hasSyncError ? ' (erreur de synchronisation)' : ''}`
  const deviceFullscreenLabel = deviceFullscreen ? 'Quitter le plein écran' : 'Plein écran'
  const archiveViewLabel =
    archiveView === 'archived'
      ? `Vue : Archivés (${archivedCount})`
      : archivedCount > 0
        ? `Vue : Actifs (${archivedCount} archivé(s))`
        : 'Vue : Actifs'
  const ThemeIcon = THEME_ICON[themePreference]
  const ArchiveViewIcon = ARCHIVE_VIEW_ICON[archiveView]

  return (
    <div className="app">
      <span className="sr-only" aria-live="polite">
        {reorderAnnouncement}
      </span>

      {focusMode && (
        <button
          ref={focusExitBtnRef}
          className="focus-exit-btn"
          onClick={exitFocusMode}
          aria-label="Quitter le mode focus"
          title="Quitter le mode focus"
        >
          <CloseIcon />
        </button>
      )}

      {!focusMode && (
        <>
          <header className="app-header">
            <h1>PlusUn</h1>
            <div className="app-header-actions">
              <button className="add-btn" onClick={addCounter}>
                + Nouveau compteur
              </button>
              <button
                ref={menuButtonRef}
                className={`add-btn icon-btn${hasSyncError ? ' icon-btn--alert' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label={menuButtonLabel}
                title={menuButtonLabel}
              >
                <MoreIcon />
              </button>
            </div>

            {menuOpen && (
              <div className="app-menu" ref={menuRef}>
                {counters.length > 0 && (
                  <button
                    className="add-btn icon-btn"
                    onClick={() => {
                      setSearchOpen((v) => !v)
                      setMenuOpen(false)
                    }}
                    aria-label="Rechercher"
                    title="Rechercher"
                  >
                    <SearchIcon />
                  </button>
                )}
                <button
                  className="add-btn icon-btn"
                  onClick={() => {
                    setThemePreference(NEXT_THEME[themePreference])
                    setMenuOpen(false)
                  }}
                  aria-label={`Thème : ${THEME_LABEL[themePreference]}`}
                  title={`Thème : ${THEME_LABEL[themePreference]}`}
                >
                  <ThemeIcon />
                </button>
                <button
                  className={`add-btn icon-btn${hasSyncError ? ' icon-btn--alert' : ''}`}
                  onClick={() => {
                    setSyncOpen(true)
                    setMenuOpen(false)
                  }}
                  aria-label={syncButtonLabel}
                  title={syncButtonLabel}
                >
                  <SyncIcon />
                </button>
                {notificationPermission !== 'unsupported' && (
                  <button
                    className="add-btn icon-btn"
                    onClick={requestNotifications}
                    aria-label={NOTIFICATION_LABEL[notificationPermission]}
                    title={NOTIFICATION_LABEL[notificationPermission]}
                  >
                    <BellIcon />
                  </button>
                )}
                {counters.length > 0 && (
                  <button
                    className="add-btn icon-btn"
                    onClick={() => {
                      setFocusMode(true)
                      setMenuOpen(false)
                    }}
                    aria-label="Mode focus"
                    title="Mode focus"
                  >
                    <FocusIcon />
                  </button>
                )}
                {counters.length > 0 && (
                  <button
                    className="add-btn icon-btn"
                    onClick={() => {
                      setDeviceFullscreen((v) => !v)
                      setMenuOpen(false)
                    }}
                    aria-label={deviceFullscreenLabel}
                    title={deviceFullscreenLabel}
                  >
                    <FullscreenIcon />
                  </button>
                )}
                <button
                  className="add-btn icon-btn"
                  onClick={() => {
                    setArchiveView(NEXT_ARCHIVE_VIEW[archiveView])
                    setMenuOpen(false)
                  }}
                  aria-label={archiveViewLabel}
                  title={archiveViewLabel}
                >
                  <ArchiveViewIcon />
                </button>
              </div>
            )}
          </header>

          {searchOpen && counters.length > 0 && (
            <div className="search-bar">
              <input
                autoFocus
                type="text"
                className="modal-input search-input"
                aria-label="Rechercher un compteur"
                placeholder="Rechercher un compteur…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch()
                }}
              />
              <button className="modal-close" onClick={closeSearch} aria-label="Fermer la recherche" title="Fermer la recherche">
                <CloseIcon />
              </button>
            </div>
          )}
        </>
      )}

      <main>
        {archiveView === 'archived' && archiveStats.count > 0 && (
          <div className="archive-stats-bar" role="group" aria-label="Statistiques des compteurs archivés">
            <div className="archive-stat">
              <span className="archive-stat-value">{archiveStats.count}</span>
              <span className="archive-stat-label">{archiveStats.count > 1 ? 'compteurs archivés' : 'compteur archivé'}</span>
            </div>
            <div className="archive-stat">
              <span className="archive-stat-value">{archiveStats.totalValue.toLocaleString('fr-FR')}</span>
              <span className="archive-stat-label">total cumulé</span>
            </div>
            <div className="archive-stat">
              <span className="archive-stat-value">{archiveStats.averageValue}</span>
              <span className="archive-stat-label">valeur moyenne</span>
            </div>
            <div className="archive-stat">
              <span className="archive-stat-value">{archiveStats.medianValue}</span>
              <span className="archive-stat-label">valeur médiane</span>
            </div>
            {archiveStats.averagePerDay !== null && (
              <div className="archive-stat">
                <span className="archive-stat-value">{archiveStats.averagePerDay}</span>
                <span className="archive-stat-label">en moyenne</span>
              </div>
            )}
            {archiveStats.averageDurationDays !== null && (
              <div className="archive-stat">
                <span className="archive-stat-value">{archiveStats.averageDurationDays}</span>
                <span className="archive-stat-label">durée moyenne</span>
              </div>
            )}
          </div>
        )}

        {filteredCounters.length === 0 ? (
          <div className="empty-state">
            {counters.length === 0 ? (
              <>
                <p>Aucun compteur pour l'instant.</p>
                <button className="add-btn large" onClick={addCounter}>
                  Créer mon premier compteur
                </button>
                {import.meta.env.VITE_SYNC_WORKER_URL && (
                  <p className="modal-hint modal-hint--locked">
                    ⚠️ Compteurs synchronisés entre appareils : le code n'est pas un mot de passe, quiconque le
                    connaît peut les lire et les modifier — évite d'y mettre des données sensibles ou privées.
                  </p>
                )}
              </>
            ) : searchQuery.trim() !== '' ? (
              <p>Aucun compteur ne correspond à « {searchQuery.trim()} ».</p>
            ) : archiveView === 'archived' ? (
              <p>Aucun compteur archivé.</p>
            ) : (
              <p>Tous tes compteurs sont archivés.</p>
            )}
          </div>
        ) : (
          <Reorder.Group
            as="div"
            axis="y"
            values={sortedCounters}
            onReorder={reorderVisible}
            className={`counter-grid ${
              filteredCounters.length === 1
                ? 'counter-grid--solo'
                : filteredCounters.length === 2
                  ? 'counter-grid--duo'
                  : 'counter-grid--pack'
            }`}
          >
            <AnimatePresence mode="popLayout">
              {sortedCounters.map((counter) => (
                <CounterCard
                  key={counter.id}
                  counter={counter}
                  fill={filteredCounters.length <= 2}
                  autoEdit={counter.id === autoEditId}
                  colors={COLORS}
                  onChange={(delta) => updateCount(counter.id, delta)}
                  onSetCount={(count) => setCount(counter.id, count)}
                  onUpdate={(patch) => updateCounter(counter.id, patch)}
                  onDuplicate={() => duplicateCounter(counter.id)}
                  onToggleArchive={() => toggleArchive(counter.id)}
                  onTogglePin={() => togglePin(counter.id)}
                  onDelete={() => deleteCounter(counter.id)}
                  onMove={(direction) => moveCounter(counter.id, direction)}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </main>

      {syncOpen && (
        <ErrorBoundary
          fallback={(retry) => (
            // Suspense seul ne rattrape que l'attente du chunk, pas son
            // échec (ex : fichier disparu après un déploiement pendant que
            // cet onglet restait ouvert) — voir ErrorBoundary.tsx. Sans ce
            // filet, cet échec démonterait toute l'app en page blanche.
            <div className="modal-overlay" onClick={() => setSyncOpen(false)}>
              <div className="modal-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="modal-panel-header">
                  <h2>Synchroniser mes compteurs</h2>
                </div>
                <p className="modal-hint">
                  Le panneau de synchronisation n'a pas pu se charger — une nouvelle version de l'app est
                  probablement disponible. Recharge la page pour la récupérer.
                </p>
                <div className="modal-row">
                  <button className="modal-btn" onClick={retry}>
                    Recharger la page
                  </button>
                  <button className="modal-btn" onClick={() => setSyncOpen(false)}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        >
          <Suspense fallback={null}>
            <SyncPanel counters={counters} onClose={() => setSyncOpen(false)} onImport={handleImport} remoteSync={remoteSync} />
          </Suspense>
        </ErrorBoundary>
      )}

      {syncNotice && (
        <div className="sync-toast" role="status">
          <SyncIcon width={16} height={16} />
          <span>{syncNotice}</span>
        </div>
      )}

      {undoStack.length > 0 && (
        <div className="undo-toast" role="status">
          <span>{undoStack[undoStack.length - 1].label}</span>
          <button onClick={handleUndo}>Annuler{undoStack.length > 1 ? ` (${undoStack.length})` : ''}</button>
        </div>
      )}
    </div>
  )
}
