#!/bin/sh
# Attend la fin du run « Release » du commit construit, puis récupère les tags (VER-09).
# `release.yml` et la CI partent du même push : sans cette attente, un build rapide peut
# partir avant la création du tag et afficher la version précédente.
# Usage : wait-release.sh <sha>   (GH_TOKEN et GH_REPO dans l'environnement ; droit `actions: read`)
# Identique dans tous les dépôts. N'échoue jamais : une release absente ou en échec ne doit
# pas bloquer un déploiement, la page affiche alors le dernier tag existant.
set -u
sha="$1"
id=""
for _ in 1 2 3 4 5 6; do
  id=$(gh run list --workflow release.yml --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
  [ -n "$id" ] && break
  sleep 10
done
if [ -z "$id" ]; then
  echo "Aucun run Release pour $sha : on continue sans attendre."
else
  gh run watch "$id" --exit-status >/dev/null 2>&1 || echo "::warning::Release en échec ou annulée : la version affichée sera le dernier tag existant."
fi
git fetch --tags --force origin || echo "::warning::Récupération des tags impossible."
exit 0
