# English Training

PWA mains-libres pour s'entraîner à l'anglais à l'oral : une phrase française est lue, vous répondez en anglais. La vérification se lance quand le micro se ferme.

## Sur le téléphone

Ouvrir **https://peti6inge.github.io/English-Training/** dans Chrome (Android) ou Safari (iPhone), puis **Ajouter à l'écran d'accueil**.

Sur Android, l'app utilise le **Speech-to-Text natif** (Web Speech / reconnaisseur système). Le premier chargement a besoin d'Internet ; ensuite le shell fonctionne hors-ligne. Sur ordinateur, Vosk/Whisper WASM restent disponibles.

## Démarrage local

Servir le dossier en HTTP(S) — le micro, WASM et le service worker l'exigent :

```bash
python3 -m http.server 4173
```

Ouvrir `http://localhost:4173`.

## Commandes vocales

| Commande | Effet |
|---|---|
| `REPEAT FRENCH` | Relit la phrase française |
| `REPEAT ENGLISH` | Lit la phrase anglaise |
| `NEXT` | Force la validation : score + correction, puis phrase suivante |
| `PREVIOUS` | Phrase précédente |
| `REMIND` | Ajoute la phrase à `customRemindList` |
| `DON'T REMIND` | Retire la phrase de la liste de révisions |

À la fermeture du micro, la réponse est comparée à `phrase.en`. Si elle est correcte, passage automatique à la suite. Si elle est incorrecte, le micro est rendu jusqu'à une réponse valide ou `NEXT`.

Validation : les mots-clés attendus doivent apparaître **dans l'ordre** (mots parasites ignorés). À défaut, similarité globale ≥ **85 %**.

Les phrases marquées `REMIND` sont réinjectées **au hasard** de temps en temps pendant la session (toutes les 4 phrases environ).

## Architecture

```
SPEAKING_FR → LISTENING → EVALUATING → FEEDBACK → (retry LISTENING | NEXT_PHRASE)
```

- `js/storage.js` — `currentIndex`, `phrasesState`, `customRemindList` en localStorage, miroir IndexedDB
- `js/tts.js` — `speechSynthesis` fr-FR / en-US
- `js/stt.js` — STT natif sur mobile ; Vosk/Whisper WASM sur desktop
- `js/fuzzy.js` — mots-clés dans l'ordre + similarité de repli
- `js/commands.js` — détection des déclencheurs (en fin d'énoncé)
- `js/queue.js` — incorrect > nouvelles phrases, interludes Remind aléatoires
- `js/loop.js` — machine à états mains-libres
- `sw.js` — précache du shell, cache runtime des modèles WASM
