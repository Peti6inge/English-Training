# Génération de 400 phrases (export messages perso)

## Fichiers à joindre au chat

1. **Corpus source** : `romain_messages_raw.txt` (export complet, UTF-8 corrigé si besoin).
2. **Référence de style** (optionnel mais utile) : extraits de `data/chunks/c15.json` ou `phrases.sample.json` du projet English Training.

## Destination dans le repo

Enregistrer la sortie **uniquement** dans :

`data/pending/romain-messages-400.json`

Ce fichier n’est **pas** pris en compte par `scripts/merge-phrases.mjs` ni par `android-app/scripts/sync-www.mjs` tant qu’il reste dans `data/pending/`.

---

## Prompt (copier-coller ci-dessous)

```
Tu es un lexicographe bilingue FR→EN pour une app d’entraînement à l’oral anglais (phrases courtes, registre naturel, pas scolaire).

## Entrée
J’ai joint mon export de messages personnels (SMS, mails courts, chat). Ce sont MES formulations habituelles : tu dois en extraire le **registre**, les **tournures récurrentes** et les **situations de vie**, pas recopier mot à mot des messages privés.

## Objectif
Produire **exactement 400** entrées d’entraînement, **inspirées** de ce corpus (reformulation autorisée et encouragée pour généraliser), prêtes pour une future fusion dans le pool du projet.

## Exclure impérativement
- Code, SQL, devoirs, logs techniques, URLs seules, listes de courses brutes.
- Messages d’un seul mot (« ok », « merci » seul) sauf si tu les enrichis en phrase complète.
- Noms propres de personnes, numéros de téléphone, adresses, identifiants, contenu médical identifiable.
- Plaintes/jurons trop crus ; garde un ton oral mais utilisable à l’entraînement.

## Format de sortie
**Un seul bloc** : un tableau JSON valide, sans markdown autour, sans commentaire.

Chaque objet :
{
  "fr": "…",
  "en": "…",
  "tags": ["un_seul_tag"],
  "level": "casual" | "vocab"
}

- **tags** : exactement **un** tag parmi cette liste (ne pas inventer d’autres) :
  body, city, daily, education, emotions, family, food, health, hobbies, home, media, opinions, plans, services, shopping, social, tech, travel, weather, work
- **level** :
  - `casual` : oral, contractions EN naturelles, idiomes (« kinda », « I’m gonna », « no big deal »).
  - `vocab` : phrase un peu plus construite / lexique utile, toujours naturelle à l’oral.
- Viser environ **55 % casual / 45 % vocab**.
- Répartir les tags de façon équilibrée (pas plus de ~30 phrases par tag).

## Contraintes linguistiques (validation automatique côté projet)
- **Anglais** : entre **5 et 15 mots** par phrase `en` (compter les mots).
- La phrase `en` ne doit **pas** se terminer par un de ces mots/expressions (souvent confondus à l’oral) :
  next, stop, previous, remind, enough, he knows, repeat/repeats, rebate/rebates, with it, repit, rippit, ribbit, rip it, rib it (y compris variantes « the french » / « the english »).
- **FR** : apostrophes correctes (`j'ai`, `c'est`), pas de mojibake.
- **EN** : traduction idiomatique (pas mot à mot), même sens que le FR.
- Pas de doublons : deux `en` normalisés identiques = interdit.

## Processus (dans ta tête, pas à écrire dans la sortie)
1. Parcourir tout le corpus joint.
2. Identifier thèmes et formulations typiques (reports, reports de retard, famille, boulot, tech, plans, opinions).
3. Généraliser en phrases réutilisables par n’importe qui (pas « mon collègue Jérômy » → « mon collègue »).
4. Dédupliquer et équilibrer tags / levels.
5. Émettre le JSON final de 400 éléments.

## Exemples de ton cible (ne pas recopier tels quels)
{"fr":"Cette réunion aurait pu être un e-mail.","en":"That meeting could have been an email.","tags":["work"],"level":"casual"}
{"fr":"Je vais poser un jour de maladie pour me reposer.","en":"I'll take a sick day and rest up.","tags":["health"],"level":"casual"}
{"fr":"L'appairage Bluetooth exige que l'appareil soit à proximité.","en":"Bluetooth pairing requires the device to be nearby.","tags":["tech"],"level":"vocab"}

## Livrable
Réponds **uniquement** avec le tableau JSON de 400 objets, prêt à être enregistré dans `data/pending/romain-messages-400.json`.
```

---

## Après génération (humain)

1. Valider le JSON (`node -e "JSON.parse(require('fs').readFileSync('data/pending/romain-messages-400.json'))"`).
2. Optionnel : script de pré-validation reprenant les règles de `scripts/merge-phrases.mjs`.
3. Intégration future : renommer/découper en `data/chunks/c18.json` (ou fusionner au merge) puis `node scripts/merge-phrases.mjs` et sync Android si besoin.
