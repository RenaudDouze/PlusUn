// Choisit les jobs de mutation à lancer, selon l'événement.
//  - pull_request : seulement les modules touchés par le diff (source ou fichier
//    de test) ; tout si la modification sort de ce cadre (config, workflow, dépendances…).
//  - schedule / workflow_dispatch : tous les modules (contrôle complet, la nuit).
//  - push sur main : aucun (la PR a déjà passé ses modules, la nuit refait le tout).
// Limite assumée : une PR qui modifie un module A peut casser des mutants du module B
// qui l'importe ; le contrôle nocturne le détecte le lendemain.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { targets } from '../../stryker.config.mjs';

const { matrix, event, base } = {
  matrix: JSON.parse(process.env.MATRIX),
  event: process.env.EVENT_NAME,
  base: process.env.BASE_REF,
};

const baseFile = (entry) => entry.split(':')[0];
const selectAll = () => matrix.include;

function select() {
  if (event === 'schedule' || event === 'workflow_dispatch') return selectAll();
  if (event !== 'pull_request') return [];
  const changed = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const sources = new Set(Object.keys(targets).map(baseFile));
  const tests = new Set(Object.values(targets).flat());
  const isDoc = (f) => /\.md$/.test(f) || f.startsWith('docs/');
  const known = (f) => sources.has(f) || tests.has(f) || isDoc(f);
  // Un fichier de src/ hors cibles et hors tests (types, setup…) peut toucher tout le monde.
  if (changed.some((f) => !known(f))) return selectAll();
  return matrix.include.filter((m) => m.mutate.split(',').some((file) =>
    changed.includes(baseFile(file)) || targets[file].some((t) => changed.includes(t))));
}

const picked = { include: select() };
console.log(`Mutation : ${picked.include.length}/${matrix.include.length} jobs (${event})`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(picked)}\ncount=${picked.include.length}\n`);
}
