// Numéro de version affiché dans l'interface (VER-09).
// Dernier tag `vX.Y.Z` atteignable depuis le commit construit (c'est la version que
// semantic-release a publiée, VER-01) ; « dev » hors dépôt, sans git ou sans tag.
// Identique dans tous les dépôts : l'importer depuis la config de build (Vite : `define`),
// jamais le recopier ni le lire dans package.json.
import { execFileSync } from "node:child_process";

export function appVersion() {
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return tag || "dev";
  } catch {
    return "dev";
  }
}
