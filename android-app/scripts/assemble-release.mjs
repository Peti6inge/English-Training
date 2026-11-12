import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const androidDir = join(dirname(fileURLToPath(import.meta.url)), "..", "android");
const gradlew = join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    "/opt/android-sdk",
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    process.env.USERPROFILE && join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk"),
  ].filter(Boolean);
  return candidates.find((dir) => existsSync(join(dir, "platform-tools")));
}

const sdk = findSdk();
if (!sdk) {
  console.error(`
SDK Android introuvable.

Installez Android Studio :
https://developer.android.com/studio

Puis relancez : npm run build:apk:release
`);
  process.exit(1);
}

writeFileSync(
  join(androidDir, "local.properties"),
  `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/, "\\:")}\n`,
);
console.log(`SDK: ${sdk}`);

const child = spawn(gradlew, ["assembleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));
