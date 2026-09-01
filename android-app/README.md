# English Training — application Android

Wrapper Capacitor de la PWA, avec un service média natif pour **Android Auto** et les touches Next / Previous du volant.

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

En ligne de commande, une fois le SDK installé :

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm run build:apk
```

L’APK debug sera ici :

```text
android-app\android\app\build\outputs\apk\debug\app-debug.apk
```

Copier ce fichier sur le téléphone et l’ouvrir, ou :

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## Android Auto (Clio 5, usage personnel hors Play Store)

1. Installer l’APK sur le téléphone.
2. Ouvrir **Paramètres → Applications → Android Auto → Paramètres supplémentaires**.
3. Aller tout en bas sur **Version**, taper 10 fois pour activer le **mode développeur**.
4. Menu ⋮ → **Paramètres développeur** → activer **Sources inconnues**.
5. Reconnecter le téléphone à la voiture.
6. Dans Android Auto, ouvrir **English Training** comme source média.
7. Démarrer une session dans l’app (bouton Démarrer) : une notification « Session média voiture active » doit rester visible.
8. Tester Next / Previous au volant.

Documentation Google :  
https://developer.android.com/training/cars/testing

## Après une modification de la PWA

```powershell
cd d:\tout_et_rien\English-Training\android-app
npm run cap:sync
npm run build:apk
```

Cela recopie `js/`, `css/`, `index.html` dans le WebView natif.
