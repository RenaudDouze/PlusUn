/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  checkers: ["typescript"],
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
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
