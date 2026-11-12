Pools isolés — non fusionnés dans phrases.json.

Le script scripts/merge-phrases.mjs ne lit que data/chunks/cNN.json.
Les fichiers ici sont des sous-ensembles exportés pour usage séparé
(entraînement ciblé, APK dédié, import manuel dans phrases-data.js).

- short-300.json — 300 phrases les plus courtes (compte EN), triées par longueur
- short-300.meta.json — métadonnées et répartition (tags, mots EN)

Régénérer : node scripts/export-short-pool.mjs
