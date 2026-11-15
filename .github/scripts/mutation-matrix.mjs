// Matrice des jobs de mutation, déduite de stryker.config.mjs : un module
// ajouté aux cibles y est automatiquement muté (impossible de l'oublier ici).
// Les modules qui partagent les mêmes fichiers de test sont regroupés.
import { appendFileSync } from 'node:fs';
import { targets } from '../../stryker.config.mjs';

const groups = new Map();
for (const [file, tests] of Object.entries(targets)) {
  const key = tests.join(',');
  groups.set(key, [...(groups.get(key) || []), file]);
}
// Le libellé sert de nom d'artefact : ni `/` ni `:` n'y sont permis.
const label = (files) => (files.every((f) => f.startsWith('worker/'))
  ? 'worker'
  : files.map((f) => f.replace(/^src\//, '').replace(/\.ts$/, '').replaceAll('/', '-')).join('+'));
const include = [...groups.values()].map((files) => ({ name: label(files), mutate: files.join(',') }));
const matrix = JSON.stringify({ include });
console.log(matrix);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
