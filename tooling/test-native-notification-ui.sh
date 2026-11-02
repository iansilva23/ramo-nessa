#!/usr/bin/env bash
set -euo pipefail
app_role=${1:?Informe passenger ou driver}
case "$app_role" in passenger|driver) ;; *) exit 2 ;; esac
repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root/apps/$app_role/android"
./gradlew :app:connectedDebugAndroidTest -Ptarget-platform=android-x64
cd "$repo_root"
mkdir -p visual-artifacts
adb exec-out run-as "br.com.ramonessa.$app_role" tar -C files -cf - notification-previews |
  tar -xf - -C visual-artifacts
printf 'Offline Android 15 emulator fixtures. No real ride, payment or provider request. Source: %s\n' \
  "$GITHUB_SHA" > visual-artifacts/README.txt
