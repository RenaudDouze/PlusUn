# Architecture

La description des couches (rôle de chaque dossier, flux de requêtes, ce qui est pur et ce qui est coque) est dans `CLAUDE.md`, section *Architecture*. Ce fichier garde ce qui s'**exécute** : les règles d'architecture vérifiées à chaque `npm run lint`.

## Règles vérifiées (`.dependency-cruiser.cjs`)

Dossiers analysés : `src/`, `worker/`.

| Règle | Raison |
|---|---|
| `no-circular` | Un cycle empêche de raisonner sur un module isolé et fausse la mutation ciblée (MUT-04). |
| `no-orphans` | Un fichier que rien n'importe est du code mort : le supprimer (COV-05). |
| `worker-not-client` | Le worker (types Cloudflare) et le client (DOM) ont deux tsc distincts (LINT-02). |
| `client-not-worker` | Le client ne dépend que de shared/ ; il parle au worker par le réseau. |

Une exception se documente à côté de la règle (`pathNot` + raison), jamais par un assouplissement global.

## Pièges

- `dependency-cruiser` ne sait pas lire TypeScript 7 : sans `@swc/core` en devDependency, il analyse **0 module** et ne signale rien. Après une montée, vérifier que la sortie annonce un nombre de modules non nul.
