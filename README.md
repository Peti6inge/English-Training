# English Training

PWA mains-libres pour s'entraîner à l'anglais à l'oral : une phrase française est lue, vous répondez en anglais, puis vous validez par commande vocale.

## Sur le téléphone

Ouvrir **https://peti6inge.github.io/English-Training/** dans Chrome (Android) ou Safari (iPhone), puis **Ajouter à l'écran d'accueil**. Le premier chargement a besoin d'Internet (modèle vocal) ; ensuite l'app fonctionne hors-ligne.

## Démarrage local

Servir le dossier en HTTP(S) — le micro, WASM et le service worker l'exigent :

```bash
python3 -m http.server 4173
```

Ouvrir `http://localhost:4173`.

## Commandes vocales

| Commande | Effet |
|---|---|
| `REPEAT MONKEY` | Relit la phrase française |
| `OK MONKEY` | Compare le buffer (hors mots de commande) à `phrase.en` |
| `PREVIOUS MONKEY` | Phrase précédente |
| `NEXT MONKEY` | Passe sans score |
| `REMIND MONKEY [note]` | Ajoute la phrase à `customRemindList` |

Seuil de similarité : **85 %** (ponctuation ignorée, casse normalisée).

## Architecture

```
SPEAKING_FR → LISTENING → EVALUATING → FEEDBACK → NEXT_PHRASE
```

- `js/storage.js` — `currentIndex`, `phrasesState`, `customRemindList` en localStorage, miroir IndexedDB
- `js/tts.js` — `speechSynthesis` fr-FR / en-US
- `js/stt.js` — Vosk WASM → Whisper WASM → Web Speech API pendant le chargement
- `js/fuzzy.js` — normalisation + similarité combinée
- `js/commands.js` — détection des déclencheurs
- `js/queue.js` — Remind > incorrect > nouvelles phrases
- `js/loop.js` — machine à états mains-libres
- `sw.js` — précache du shell, cache runtime des modèles WASM

Le premier chargement télécharge le modèle STT. Les visites suivantes fonctionnent hors-ligne.
