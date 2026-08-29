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
| `REPEAT ENGLISH` | Écoute la réponse attendue en anglais |
| `NEXT` | Valider la tentative |
| `STOP` | Arrêter la session |

### Commandes en correction

| Commande | Effet |
|---|---|
| `REPEAT FRENCH` | Relit le français |
| `REPEAT ENGLISH` | Lit l'anglais |
| `NEXT` | Phrase suivante |
| `PREVIOUS` | Phrase précédente |
| `REMIND` | Ajoute aux révisions, puis **Next** auto |
| `DON'T REMIND` | Retire des révisions, puis **Next** auto |
| `STOP` | Arrêter la session |

Les phrases `REMIND` sont réinjectées au hasard environ toutes les 4 phrases.
