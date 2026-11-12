# English Training

PWA mains-libres pour s'entraîner à l'anglais à l'oral : une phrase française est lue, vous répondez en anglais par saisie incrémentale (plusieurs prises), puis vous validez.

## Sur le téléphone

Ouvrir **https://peti6inge.github.io/English-Training/** dans Chrome (Android) ou Safari (iPhone), puis **Ajouter à l'écran d'accueil**.

Sur Android, l'app utilise le **Speech-to-Text natif**. Sur ordinateur, Vosk/Whisper WASM restent disponibles.

## Démarrage local

```bash
python3 -m http.server 4173
```

Ouvrir `http://localhost:4173`.

## Flux

```
SPEAKING_FR → LISTENING (saisie incrémentale) → validation → FEEDBACK (audio) → CORRECTION
```

### Saisie incrémentale

- Le transcript **s'accumule** entre les prises de parole.
- Aucun « Incorrect » pendant la saisie : si la réponse n'est pas encore complète, le micro se rouvre silencieusement.
- Dès que la phrase est reconnue comme correcte, validation automatique.
- **`NEXT`** force la validation à tout moment.

### Après validation

Pause, puis :
- **réponse correcte** : « Perfect »
- **réponse incorrecte** : anglais seulement (pas de français, pas de « Perfect »)

Puis phase **CORRECTION** (micro ouvert).

### Commandes en saisie

| Commande | Effet |
|---|---|
| `REPEAT FRENCH` | Réécoute la phrase française |
| `NEXT` | Valider la tentative |
| `STOP` | Arrêter la session |

### Commandes en correction

| Commande | Effet |
|---|---|
| `REPEAT FRENCH` | Relit le français |
| `REPEAT ENGLISH` | Lit l'anglais |
| `NEXT` | Monte d'un palier (Don't remind), puis phrase suivante |
| `PREVIOUS` | Phrase précédente |
| `REMIND` | Descend d'un palier, puis phrase suivante |
| `ENOUGH` | Même effet que Don't remind : un palier de plus, puis phrase suivante |
| `STOP` | Arrêter la session |

Les commandes, les boutons et la liste Don't remind restent les mêmes. La liste n'exclut plus la phrase. Chaque Don't remind / `ENOUGH` monte le score d'un cran et repousse l'échéance ; chaque `REMIND` le descend d'un cran. Le score 6 retire la phrase des rappels.

La validation orale compte aussi : une réponse reconnue monte d'un cran, une réponse ratée en descend un. Ces gestes s'additionnent. Par exemple, une bonne réponse suivie de Don't remind monte de deux crans.

Le délai appliqué est celui du score avant la montée :

| Réussite au score | Échéance | Score ensuite |
|---|---|---|
| 0 | 8 h | 1 |
| 1 | 24 h | 2 |
| 2 | 3 jours | 3 |
| 3 | 7 jours | 4 |
| 4 | 16 jours | 5 |
| 5 | plus de rappel | 6 |

Un échec ou `REMIND` redescend d'un cran (plancher 0) et reprend le délai de ce cran. Un retour au score 5 attend 35 jours.

À chaque avance, l'application rassemble les phrases dues maintenant. La probabilité de tomber sur un rappel plutôt que sur une phrase neuve est `n / (n + 7)`, où `n` est le nombre de phrases dues. Sans phrase neuve, un rappel dû est servi à chaque fois.

## Jeu de données (~2 400 phrases)

- **`phrases.json`** — pool servi par l'app (2 400 paires FR → EN)
- **`data/chunks/`** — sources par lot (`c01.json` …), ~40 % vocabulaire neutre + ~60 % expressions orales
- **`scripts/merge-phrases.mjs`** — regénère `phrases.json` (ids, dédoublonnage, validation longueur)

L'ordre de passage est **mélangé** à chaque (re)construction de file, avec espacement des tags pour éviter les blocs thématiques. Les phrases déjà vues ne reviennent que lorsque leur échéance est atteinte.

Après mise à jour du pool, utiliser **Réinitialiser** dans l'app pour reconstruire la file.

## Application Android (Android Auto)

Voir [`android-app/README.md`](android-app/README.md) pour générer l’APK et activer les sources inconnues Android Auto.

