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
  commandRunner: {
    // Liste figée à la main (plutôt qu'un glob) pour qu'elle reste
    // synchronisée avec `mutate` ci-dessous : ajouter un fichier à `mutate`
    // sans l'ajouter ici ferait survivre tous ses mutants faute de test
    // lancé contre eux.
    command:
      "npx vitest run src/odds.test.ts src/date.test.ts src/sync.test.ts src/remoteSync.test.ts src/share.test.ts src/id.test.ts src/url.test.ts src/colors.test.ts src/sound.test.ts src/reorder.test.ts src/notifications.test.ts src/shareCard.test.ts src/counterName.test.ts src/archiveStats.test.ts",
  },
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
  concurrency: 2,
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
  mutate: [
    "src/odds.ts",
    "src/date.ts",
    "src/sync.ts",
    "src/remoteSync.ts",
    "src/share.ts",
    "src/id.ts",
    "src/url.ts",
    "src/colors.ts",
    "src/sound.ts",
    "src/reorder.ts",
    "src/notifications.ts",
    "src/shareCard.ts",
    "src/counterName.ts",
    "src/archiveStats.ts",
  ],
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};
