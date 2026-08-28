# English Training

PWA mains-libres pour s'entraîner à l'anglais à l'oral : une phrase française est lue, vous répondez en anglais, puis vous validez par commande vocale.

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
| `REPEAT MONKEY` | Relit la phrase française |
| `OK MONKEY` | Compare le buffer (hors mots de commande) à `phrase.en` |
| `OK` | Après le feedback, passe à la phrase suivante |
| `PREVIOUS MONKEY` | Phrase précédente |
| `NEXT MONKEY` | Passe sans score |
| `REMIND MONKEY [note]` | Ajoute la phrase à `customRemindList` |

Validation : les mots-clés attendus doivent apparaître **dans l'ordre** (mots parasites ignorés). À défaut, similarité globale ≥ **85 %**.

Après le feedback (correct ou correction), le micro reste à l'écoute : dites `OK` pour continuer, ou une autre commande (`REPEAT`, `REMIND`, …).

## Architecture

```
SPEAKING_FR → LISTENING → EVALUATING → FEEDBACK → AWAITING_CONFIRM → NEXT_PHRASE
```

- `js/storage.js` — `currentIndex`, `phrasesState`, `customRemindList` en localStorage, miroir IndexedDB
- `js/tts.js` — `speechSynthesis` fr-FR / en-US
- `js/stt.js` — STT natif sur mobile ; Vosk/Whisper WASM sur desktop
- `js/fuzzy.js` — mots-clés dans l'ordre + similarité de repli
- `js/commands.js` — détection des déclencheurs
- `js/queue.js` — Remind > incorrect > nouvelles phrases
- `js/loop.js` — machine à états mains-libres
- `sw.js` — précache du shell, cache runtime des modèles WASM
