// Chaque module est associé aux seuls fichiers de test capables de tuer ses
// mutants : la CI lance un job par module (variable MUTATE, voir
// .github/scripts/mutation-matrix.mjs) et le runner « command » ne relance que
// ces tests-là pour chaque mutant (au lieu des 14 fichiers : ~25 min -> ~2 min).
export const targets = {
  'src/odds.ts': ['src/odds.test.ts'],
  'src/date.ts': ['src/date.test.ts'],
  'src/sync.ts': ['src/sync.test.ts'],
  'src/remoteSync.ts': ['src/remoteSync.test.ts'],
  'src/share.ts': ['src/share.test.ts'],
  'src/id.ts': ['src/id.test.ts'],
  'src/url.ts': ['src/url.test.ts'],
  'src/colors.ts': ['src/colors.test.ts'],
  'src/sound.ts': ['src/sound.test.ts'],
  'src/reorder.ts': ['src/reorder.test.ts'],
  'src/notifications.ts': ['src/notifications.test.ts'],
  'src/shareCard.ts': ['src/shareCard.test.ts'],
  'src/counterName.ts': ['src/counterName.test.ts'],
  'src/archiveStats.ts': ['src/archiveStats.test.ts'],
  'src/components/CounterActionsPanel.tsx': ['src/components/CounterActionsPanel.test.tsx'],
  'src/components/ErrorBoundary.tsx': ['src/components/ErrorBoundary.test.tsx'],
  'src/components/Modal.tsx': ['src/components/Modal.test.tsx'],
  'src/components/Odometer.tsx': ['src/components/Odometer.test.tsx'],
  'src/components/odometerMotion.ts': ['src/components/Odometer.test.tsx'],
  'src/components/PanelNav.tsx': ['src/components/PanelNav.test.tsx'],
  'src/hooks/useCelebration.ts': ['src/hooks/useCelebration.test.ts'],
  'src/hooks/useFillFontSize.ts': ['src/hooks/useFillFontSize.test.tsx'],
  'src/hooks/useFocusTrap.ts': ['src/hooks/useFocusTrap.test.tsx'],
  'src/hooks/useHoldToRepeat.ts': ['src/hooks/useHoldToRepeat.test.ts'],
  'src/hooks/useLocalStorage.ts': ['src/hooks/useLocalStorage.test.ts'],
  'src/hooks/usePositiveIntField.ts': ['src/hooks/usePositiveIntField.test.ts'],
  'src/hooks/useSystemDarkMode.ts': ['src/hooks/useSystemDarkMode.test.ts'],
  'src/hooks/useTapGesture.ts': ['src/hooks/useTapGesture.test.ts'],
};

const selected = process.env.MUTATE ? process.env.MUTATE.split(',') : Object.keys(targets);
for (const file of selected) {
  if (!targets[file]) throw new Error(`MUTATE : module inconnu ${file}`);
}
const tests = [...new Set(selected.flatMap((file) => targets[file]))];

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  // Le testRunner "vitest" officiel (@stryker-mutator/vitest-runner) ne
  // rattache plus correctement les tests exécutés à chaque mutant sous
  // Vitest 5 (testsCompleted: 0 dans son propre rapport JSON pour tout
  // mutant non "statique") : chaque mutant survit par défaut, faute de test
  // réellement exécuté contre lui — un score qui s'effondre de 100% à ~3%
  // sans qu'aucune autre vérification (lint/typecheck/tests/e2e/build) ne le
  // signale. Le testRunner "command" (relance `vitest run` en sous-processus
  // par mutant, sans passer par l'API interne de Vitest) contourne entièrement
  // cette intégration cassée. Voir CLAUDE.md.
  testRunner: "command",
  commandRunner: { command: `npx vitest run ${tests.join(' ')}` },
  // Le testRunner "command" ne peut pas faire d'analyse de couverture fine
  // (il ne fait que lancer une commande et lire son code de sortie) : chaque
  // mutant relance donc toute la liste de commandRunner.command ci-dessus.
  coverageAnalysis: "off",
  // Les tests de ce projet tournent sous jsdom (app React) : le délai calculé
  // par défaut à partir du dry run (basé sur une seule exécution, sans
  // contention) sous-estime largement le temps réel une fois plusieurs
  // mutants testés en parallèle (plusieurs instances jsdom se créent
  // concurremment) — sans ce délai explicite généreux, la plupart des
  // mutants finissent "timed out" plutôt que tués, faussant complètement le
  // score. `concurrency` abaissé pour la même raison : moins de contention
  // CPU entre les instances jsdom simultanées, au prix d'un temps total plus
  // long.
  timeoutMS: 60_000,
  concurrency: 4,
  // Stryker réécrit par défaut tsconfig.json (extends/references) pour son
  // bac à sable, via `ts.parseConfigFileTextToJson` — une fonction retirée
  // dans TypeScript 7, ce qui fait planter Stryker avant même de lancer un
  // test. Le testRunner "command" ne dépend d'aucune vérification de type
  // par Stryker (juste vitest), donc aucun tsconfig n'est réellement
  // nécessaire ici : pointer vers un fichier volontairement inexistant fait
  // sauter cette réécriture (Stryker l'ignore silencieusement quand le
  // fichier ne fait pas partie du projet).
  tsconfigFile: "tsconfig.stryker-unused.json",
  reporters: ["html", "clear-text", "progress"],
  mutate: selected,
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};
