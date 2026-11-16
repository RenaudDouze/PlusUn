/** @type {import('dependency-cruiser').IConfiguration} */
// Règles d'architecture exécutables (ARCH-01…03). Adapter les dossiers au projet ;
// retirer les règles dont le dossier n'existe pas. Lancé par `npm run lint` (ARCH-02).
// Prérequis : `npm i -D dependency-cruiser @swc/core` (sans @swc/core, TypeScript 7 n'est pas lu : 0 module analysé).
// Un helper de test importé seulement par un alias Vitest se déclare dans `pathNot` de no-orphans, avec sa raison.
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Un cycle empêche de raisonner sur un module isolé et fausse la mutation ciblée (MUT-04).",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Un fichier que rien n'importe est du code mort : le supprimer (COV-05).",
      severity: "error",
      from: { orphan: true, pathNot: ["\\.d\\.ts$", "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$", "\\.config\\.(js|cjs|mjs|ts)$", "^src/main\\.tsx?$", "^worker/index\\.ts$"] },
      to: {},
    },
    {
      name: "worker-not-client",
      comment: "Le worker (types Cloudflare) et le client (DOM) ont deux tsc distincts (LINT-02).",
      severity: "error",
      from: { path: "^worker/" },
      to: { path: "^src/" },
    },
    {
      name: "client-not-worker",
      comment: "Le client ne dépend que de shared/ ; il parle au worker par le réseau.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^worker/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
