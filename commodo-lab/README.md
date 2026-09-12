# Commodolab — diagnostic commodo Clio 5

APK séparée d’English Training. Un seul but : **voir si une touche Next/Previous arrive jusqu’au téléphone, par quel canal, et dans quel état réel (BT / AA / sessions)** au moment de l’appui.

Le dongle Amazon (adaptateur AA filaire → sans fil) réactive souvent le Bluetooth tout seul. **Ne pas** commencer un essai par « je coupe le Bluetooth ». On étiquette l’essai avec ce qui est vrai à T0 et à T_event.

## Build

```powershell
cd d:\tout_et_rien\English-Training\commodo-lab
npm run build:apk
```

APK :

```text
commodo-lab\android\app\build\outputs\apk\debug\app-debug.apk
```

Dans Android Auto (sources inconnues déjà activées) : ouvrir **Commodolab** comme source média, comme English Training.

Autoriser Bluetooth (noms d’appareils) et, pour le relais Spotify, **Accès aux notifications**.

## Modes player (les capteurs restent tous allumés)

- **A** — lecture keep-alive (équivalent English Training)
- **B** — session en pause
- **C** — pas de player média AA
- **D** — keep-alive + beep si *notre* code voit un skip

## Protocole (10 appuis, mode A)

1. Commodolab = source AA (barre à côté de Maps). Bouton **Écran AA NEXT**, puis flèche droite à l’écran. Attendu : `HIT_AA_PLAYER`. Si Miss : l’app n’est pas la source média.
2. **Commodol NEXT**, puis Next au volant. Lire le verdict **et** `a2dp` / `btDevices`.
3. Répéter chaque couple 5 fois. L’ordre n’a pas d’importance.
4. Optionnel : Spotify en source AA, Commodolab en fond, notifications autorisées, **Commodol NEXT**. `HIT_OTHER_SESSION` + `com.spotify.music` = le commodo parle à Spotify, pas à AA.

Si le Bluetooth se rallume entre le bouton et l’appui, l’essai reste valable : le snapshot le dira (`btOn=oui`).

## Protocole micro (la variable qui manquait au labo)

English Training ouvre le micro en continu via le WebView ; le labo ne l’ouvrait jamais. Le sélecteur **Micro** isole cette seule variable :

- **OFF** — labo d’origine.
- **MIC** — `AudioRecord(VOICE_RECOGNITION)`, mode audio `NORMAL`, pas de SCO.
- **COMM** — ce que fait Chromium pour `getUserMedia` avec un casque HFP connecté : `MODE_IN_COMMUNICATION` + `startBluetoothSco()`.

Mode A, puis 3 x **Commodol NEXT** dans chaque état micro. Le snapshot expose `mic`, `audioMode`, `sco`.

| Résultat | Lecture |
|---|---|
| OFF = MIC = `HIT_KEYCODE`, COMM = `MISS` | confirmé : la Clio bascule en mode appel, les commodos ne parlent plus AVRCP média. Correctif : capture micro native dans English Training. |
| COMM = `HIT_KEYCODE` | le micro n’est pas la cause ; retour à la piste pont Capacitor / cycle de vie. |

## Verdicts

| Verdict | Signification |
|---|---|
| `HIT_AA_PLAYER` | commande Media3 / Android Auto (comme les flèches écran) |
| `HIT_KEYCODE` | `MEDIA_BUTTON` / AVRCP |
| `HIT_ACTIVITY` | touche envoyée à l’activité |
| `HIT_OTHER_SESSION` | une autre app (souvent Spotify) a changé de piste |
| `MISS` | rien n’est arrivé au téléphone pendant 8 s |

## Export

**Exporter JSONL** envoie `commodolab.jsonl` (une ligne par essai : intention, verdict, empreinte T0 / T_event, événements).

## Tests PC (classifieur, pas la voiture)

```powershell
cd d:\tout_et_rien\English-Training\commodo-lab\android
.\gradlew.bat test
```
