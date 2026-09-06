# PlusUn

Application web (PWA) pour gérer plusieurs compteurs indépendants, à installer sur
téléphone ou tablette. Fonctionne 100% hors-ligne : les compteurs vivent dans le
`localStorage` de l'appareil, sans compte ni serveur — la synchronisation entre
appareils (optionnelle) est le seul point qui parle au réseau.

## Fonctionnalités

**Compteurs**
- Plusieurs compteurs distincts, affichés en même temps dans une grille, réordonnables
  par glisser-déposer.
- Incrément/décrément, avec un pas personnalisable (pas seulement ±1) et un appui long
  pour incrémenter en rafale.
- Objectif optionnel avec petite animation de célébration une fois atteint.
- Probabilité de réussite : suit combien de tentatives ont réussi, avec la statistique
  affichée sur la carte.
- Épingler un compteur pour le faire remonter en tête de liste.
- Renommage (toucher le nom), duplication, suppression avec confirmation.
- 6 styles d'affichage du chiffre au choix : odomètre, volets, 7 segments, anneau,
  éditorial, pastille — chacun avec sa propre animation.
- Couleur et image de fond personnalisables par compteur.
- Mode focus (masque l'en-tête, sans passer par le plein écran natif du navigateur) pour se concentrer sur un seul compteur.
- Plein écran de l'appareil (API Fullscreen native), indépendant du mode focus et combinable avec lui.

**Organisation**
- Recherche/filtre discret des compteurs par nom.
- Archivage (masque un compteur sans le supprimer, avec sa propre vue dédiée) ;
  verrouillage optionnel des compteurs archivés contre les modifications accidentelles.
- Statistiques cumulées (nombre, total, valeur moyenne et médiane par compteur,
  moyenne par jour, durée moyenne) sur l'ensemble des compteurs archivés.

**Partage et synchronisation entre appareils**
- Lien ou QR code de partage (compressé) pour transférer l'état de tes compteurs vers
  un autre appareil, ou fichier de sauvegarde JSON à importer/exporter.
- Carte visuelle partageable (image PNG) pour un compteur, générée localement.
- Code de synchronisation à 8 caractères (optionnel, nécessite un petit worker
  Cloudflare — voir `worker/README.md`) : synchronise automatiquement l'état entre
  plusieurs appareils en tâche de fond (les changements rapprochés sont regroupés,
  jusqu'à 5s, pour limiter le nombre de requêtes), avec notification quand des
  changements arrivent d'un autre appareil. Une erreur de synchro (worker
  injoignable, code expiré...) reste visible dès l'en-tête de l'app, sans avoir à
  ouvrir la modale Synchroniser pour la découvrir. Le code n'est pas protégé par
  un mot de passe ni chiffré : quiconque le connaît peut lire et modifier les
  compteurs associés, à réserver donc à des données non sensibles.

**Autres**
- Effet de défilement façon odomètre, son et retour haptique à l'incrément/
  décrément, retour visuel type toast pour les actions annulables et les
  événements de synchronisation.
- Annulation multi-niveaux (empile les dernières actions destructrices ou
  modifications de valeur, dans l'ordre inverse, tant que le délai n'est pas
  écoulé).
- Notifications système optionnelles (objectif atteint, compteurs mis à jour
  depuis un autre appareil) en complément du toast in-app.
- Accessibilité : focus piégé et restauré dans les modales, navigation clavier.
- Thème clair/sombre/automatique.
- Installable comme application (PWA), avec raccourcis d'app et fonctionnement garanti
  hors-ligne.

## Développement

```bash
npm install
npm run dev
```

## Build de production

```bash
npm run build
npm run preview
```

## Installer sur téléphone / tablette

1. Déployez le contenu de `dist/` sur un petit serveur local (ou ouvrez le site
   hébergé si vous le publiez quelque part accessible depuis l'appareil).
2. Ouvrez l'URL dans le navigateur du téléphone/tablette (Chrome, Safari...).
3. Utilisez « Ajouter à l'écran d'accueil » / « Installer l'application ».
4. L'application se lance ensuite comme une app native, et fonctionne hors-ligne
   grâce au service worker.

## Qualité du code

| Commande               | Rôle                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `npm run lint`          | Linter (oxlint)                                               |
| `npm run typecheck`     | Vérification des types TypeScript                             |
| `npm run test`          | Tests unitaires (Vitest)                                      |
| `npm run test:watch`    | Tests unitaires en mode watch                                 |
| `npm run test:coverage` | Tests unitaires + couverture de code (seuil 100% sur tout)    |
| `npm run test:e2e`      | Tests fonctionnels (Playwright, build + preview automatiques) |
| `npm run test:mutation` | Mutation testing (Stryker, logique pure uniquement)           |

- **Couverture de code** : seuil 100% (lignes, branches, fonctions, statements)
  sur l'ensemble du code source.
- **Mutation testing** : seuil 100%, mais scopé volontairement aux modules de
  logique pure sans JSX/animation (voir la liste `mutate` dans
  `stryker.config.json` — actuellement `src/odds.ts`, `src/date.ts`,
  `src/sync.ts`, `src/remoteSync.ts`, `src/share.ts`, `src/id.ts`, `src/url.ts`,
  `src/colors.ts`, `src/sound.ts`, `src/reorder.ts`, `src/notifications.ts`,
  `src/shareCard.ts`, `src/counterName.ts`, `src/archiveStats.ts`) — un score
  de 100% strict sur les composants React (drag & drop, animations, QR
  code...) n'est pas un objectif réaliste (mutants équivalents, contenu
  visuel difficile à mutation-tester utilement). En CI cette liste est
  répartie automatiquement (`.github/scripts/mutation-shard-files.mjs`) sur 2
  jobs en parallèle pour réduire le temps total — la liste elle-même reste la
  seule source de vérité, ajouter un module à `stryker.config.json` suffit,
  aucun autre fichier à mettre à jour.
- **Tests fonctionnels** : `e2e/` couvre les parcours de base, les
  fonctionnalités avancées (probabilité, date, glisser-déposer), la
  synchronisation/partage, et le fonctionnement PWA/hors-ligne. En CI, la
  suite tourne sur 4 workers Playwright en parallèle (`playwright.config.ts`)
  — chaque test isole son propre contexte navigateur, donc aucun état n'est
  partagé entre eux malgré le serveur `preview` unique.

## Intégration continue

Le workflow `.github/workflows/ci.yml` exécute lint, typecheck, tests
unitaires + couverture, tests E2E et mutation testing sur chaque pull
request. Pour bloquer réellement la fusion tant que ces vérifications ne
sont pas au vert, active les *required status checks* du dépôt :

**Settings → Branches → Branch protection rules → `main`** → coche
« Require status checks to pass before merging » et sélectionne les jobs
`Linter`, `Vérification des types`, `Tests unitaires + couverture`, `Tests
fonctionnels (Playwright)`, `Mutation testing (logique pure)` et `Build de
production`. En interne, `Mutation testing (logique pure)` est un job
d'agrégation qui ne fait qu'attendre les 2 lots parallèles
(`Mutation testing (logique pure) — lot 1/2`, voir `ci.yml`) — le required
status check garde ce nom stable, à ne surtout pas renommer sans mettre à
jour la protection de branche en même temps.

## Déploiement

- `.github/workflows/deploy.yml` construit et publie l'app sur GitHub Pages à
  chaque push sur `main`.
- `.github/workflows/worker-deploy.yml` déploie le worker de synchro Cloudflare à
  chaque changement sous `worker/` poussé sur `main` (voir `worker/README.md` pour
  la configuration initiale et les secrets requis).
