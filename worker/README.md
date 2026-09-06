# Worker de synchronisation PlusUn

Petit service Cloudflare Worker qui sert de relais entre tes appareils : chacun
pousse et récupère un instantané JSON de ses compteurs, identifié par un code
de synchronisation à 8 caractères (pas de compte, pas de mot de passe). Voir
`../src/hooks/useRemoteSync.ts` côté app pour la logique qui l'appelle.

## Déployer ton propre worker

Il te faut un compte Cloudflare (gratuit). Toutes les commandes ci-dessous
s'exécutent depuis ce dossier (`worker/`).

```sh
npm install
npx wrangler login
```

Crée l'espace de stockage clé-valeur :

```sh
npx wrangler kv namespace create SYNC_KV
```

La commande affiche un `id` — colle-le dans `wrangler.toml` :

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "colle-l-id-ici"
```

Optionnel : dans `wrangler.toml`, remplace `ALLOWED_ORIGIN = "*"` par le
domaine exact où l'app est servie (ex. `https://tonpseudo.github.io`) pour
n'accepter les requêtes que depuis ce site.

Déploie :

```sh
npm run deploy
```

Wrangler affiche l'URL du worker déployé (`https://plusun-sync.<ton-compte>.workers.dev`).
Renseigne-la dans l'app via la variable d'environnement `VITE_SYNC_WORKER_URL`
au moment du build (voir le `README.md` racine et le workflow de déploiement
GitHub Pages) — sans elle, la section « Code de synchro » du panneau
Synchroniser reste masquée.

## Déployer depuis GitHub Actions (optionnel)

Le workflow `.github/workflows/worker-deploy.yml` déploie automatiquement le
worker à chaque changement poussé sous `worker/` sur `main` (et à la demande
via l'onglet Actions → "Déploiement du worker de synchronisation" → Run
workflow). Pour l'activer, ajoute deux secrets au repo (Settings → Secrets
and variables → Actions → New repository secret) :

- `CLOUDFLARE_API_TOKEN` : un token créé depuis le template "Edit Cloudflare
  Workers" dans le dashboard Cloudflare (Profil → API Tokens), restreint à ton
  compte.
- `CLOUDFLARE_ACCOUNT_ID` : visible dans la barre latérale du dashboard
  Cloudflare, sur n'importe quelle page Workers.

Sans ces secrets, seul `npm run deploy` en local fonctionne.

## Développement local

```sh
npm run dev       # démarre le worker en local (wrangler dev)
npm test          # tests unitaires (routage, code, écriture optimiste)
npm run typecheck
```

## Ce que stocke le worker

Une seule valeur par code, sous la clé `sync:<CODE>` :

```json
{ "version": 3, "counters": [ /* état complet, format sync.ts */ ] }
```

- Écriture (`PUT`) : optimiste façon « compare-and-swap ». Le client envoie
  `{ baseVersion, counters }` (la version qu'il pensait être la version
  courante) ; le worker n'accepte que si `baseVersion` correspond exactement
  à la version stockée, puis l'incrémente. Sinon il répond `409` avec l'état
  serveur actuel, à adopter côté client plutôt que de l'écraser. `version`
  est un entier attribué par le serveur, jamais une horloge : contrairement à
  un horodatage comparé entre appareils, aucun décalage d'horloge client ne
  peut faire accepter à tort une poussée périmée ou rejeter une poussée
  légitime.
- Un code inutilisé pendant 180 jours expire et libère sa place.
- Aucune donnée personnelle n'est demandée : le code lui-même (8 caractères,
  ~500 milliards de combinaisons) fait office de secret partagé.
- Aucune protection au-delà de la connaissance du code : pas de chiffrement,
  pas d'authentification. Quiconque connaît (ou devine) un code peut lire et
  écraser les compteurs associés — à ne pas utiliser pour des données
  sensibles ou privées.

## Pas de limitation de débit

Une limitation par IP (compteur en KV, fenêtre fixe d'une minute) a été
essayée puis retirée : elle écrivait en KV à *chaque* requête, y compris les
lectures. Le plan gratuit de Cloudflare KV plafonne à 1000 écritures/jour pour
tout le namespace, tous clients confondus — un seul appareil qui sonde toutes
les 20s (voir `useRemoteSync.ts`) épuise ce quota en quelques heures, bien
avant qu'aucun abus n'ait eu lieu. Une fois le quota épuisé, même les
écritures légitimes (créer un code, pousser des compteurs) échouent — pire
que l'abus que ça visait à empêcher. Un vrai rate-limiting referait sens avec
un Object Durable (pas provisionné dans ce projet), qui ne consomme pas ce
quota.
