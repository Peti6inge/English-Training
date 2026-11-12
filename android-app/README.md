# English Training — application Android

Wrapper Capacitor de la PWA, avec un service média natif pour les touches **Next / Previous** du volant.

> **Branche `duster-bluetooth`** (cette variante) : build **Duster / Bluetooth seul** — pas d’Android Auto.
> `applicationId` = `com.peti6inge.englishtraining.duster`, nom affiché « English Training Duster ».
> Ne pas fusionner dans `main`.

La PWA web n’est pas remplacée : ce dossier produit seulement l’APK.

## Prérequis (à installer une fois)

1. **Android Studio**  
   https://developer.android.com/studio  
   Installer avec les composants proposés par défaut (Android SDK, Platform-Tools, Build-Tools).

2. Pendant le premier lancement d’Android Studio : **More Actions → SDK Manager**  
   Cocher :
   - Android SDK Platform **35**
   - Android SDK Build-Tools
   - Android SDK Platform-Tools

3. **Node.js** (déjà présent si `npm` fonctionne)  
   https://nodejs.org/

Java 21 est déjà installé sur cette machine. Android Studio fournira aussi un JDK si besoin.

## Premier build

Dans PowerShell :

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm install
npm run cap:sync
npm run open
```

`npm run open` lance Android Studio sur le projet `android/`.

Puis dans Android Studio : **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

En ligne de commande, une fois le SDK installé (OpenJDK 21, Android SDK Platform 35) :

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm ci
npm run build:apk
```

L’APK debug sera ici :

```text
android-app\android\app\build\outputs\apk\debug\app-debug.apk
```

Aucune clé de signature n’est requise pour le build debug.

## APK release signé (hors Play Store)

Le keystore **ne doit jamais** être versionné (dépôt public). En local, créer un fichier ignoré par git :

`android-app/android/keystore.properties`

```properties
storeFile=/chemin/absolu/vers/votre-release.keystore
storePassword=***
keyAlias=englishtraining
keyPassword=***
```

Alternative : variables d’environnement `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

Puis :

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm ci
npm run build:apk:release
```

APK signé : `android-app/android/app/build/outputs/apk/release/app-release.apk`

Vérification :

```powershell
$SDK = $env:ANDROID_HOME  # ou chemin SDK Android Studio
& "$SDK\build-tools\35.0.0\apksigner" verify --print-certs app\build\outputs\apk\release\app-release.apk
```

Copier ce fichier sur le téléphone et l’ouvrir, ou :

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## Variante Duster — Bluetooth seul (sans Android Auto)

### Installation

1. Appairer le téléphone à l’autoradio Duster en **Bluetooth** (profils média + téléphone).
2. Installer l’APK debug **English Training Duster** (coexiste avec l’app « English Training » standard).
3. Au premier lancement, accorder :
   - **Microphone**
   - **Notifications** (session média au premier plan)
   - **Appareils à proximité / Bluetooth** (Android 12+) si demandé
4. Ouvrir l’app, appuyer sur **Démarrer** : la notification « Session Bluetooth voiture active » doit rester affichée.

### Comportement attendu

| Phase | Audio / micro | Volant |
| --- | --- | --- |
| TTS (phrase FR) | Sortie vers l’auto | Next / Previous doivent fonctionner (SCO coupé) |
| Écoute (répétition EN) | **Micro voiture** via Bluetooth SCO si disponible, sinon micro téléphone | Pendant SCO actif, certains véhicules ne routent plus les commodos — relâcher après validation |
| Entre phrases | SCO relâché automatiquement (`pause` STT) | Commodos AVRCP à nouveau disponibles |

### Checklist en voiture

1. Démarrer une session — lire une phrase FR sur l’autoradio.
2. Parler en anglais : le journal dans l’app doit indiquer `micro voiture BT (SCO)` ou le repli téléphone.
3. Sans toucher l’écran, appuyer **Next** puis **Previous** au volant entre deux phrases (hors écoute).
4. Vérifier que l’app passe à la phrase suivante / précédente (log : `Next volant` / `Previous volant`).
5. Si le volant ne répond pas : vérifier qu’aucune autre app musique n’est « en lecture » (Spotify, etc.).

### Build sur cette branche

```powershell
cd android-app
npm ci
npm run build:apk
```

## Après une modification de la PWA

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm run cap:sync
npm run build:apk
```

Cela recopie `js/`, `css/`, `index.html` dans le WebView natif.
