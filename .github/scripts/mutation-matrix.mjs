// Matrice des jobs de mutation, déduite de stryker.config.mjs : un module
// ajouté aux cibles y est automatiquement muté (impossible de l'oublier ici).
// Les modules qui partagent les mêmes fichiers de test sont regroupés.
import { appendFileSync } from 'node:fs';
import { targets } from '../../stryker.config.mjs';

// Un fichier trop long pour un seul job est découpé en plages de lignes
// (`src/App.tsx:1-100`) : chaque plage est un job à part, jamais regroupée
// avec une autre.
const groups = new Map();
for (const [file, tests] of Object.entries(targets)) {
  const key = file.includes(':') ? file : tests.join(',');
  groups.set(key, [...(groups.get(key) || []), file]);
}
// Le libellé sert de nom d'artefact : ni `/` ni `:` n'y sont permis (`:` des
// plages devient `@`). Le groupe des fichiers du Worker (hors plages) s'appelle
// `worker` s'il est unique ; sinon chaque groupe garde son nom complet, pour
// qu'aucun nom d'artefact ne soit en double.
const isWorker = (files) => files.every((f) => f.startsWith('worker/') && !f.includes(':'));
const workerGroups = [...groups.values()].filter(isWorker).length;
const label = (files) => (workerGroups === 1 && isWorker(files)
  ? 'worker'
  : files.map((f) => f.replace(/^(src|js)\//, '').replace(/\.[jt]sx?$/, '').replaceAll('/', '-').replace(':', '@')).join('+'));
const include = [...groups.values()].map((files) => ({ name: label(files), mutate: files.join(',') }));
const matrix = JSON.stringify({ include });
console.log(matrix);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
