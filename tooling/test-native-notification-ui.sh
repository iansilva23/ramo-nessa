#!/usr/bin/env bash
set -euo pipefail
app_role=${1:?Informe passenger ou driver}
case "$app_role" in passenger|driver) ;; *) exit 2 ;; esac
repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root/apps/$app_role/android"
# The test runner normally uninstalls the test apps and deletes their private
# screenshots at teardown. Keep them only in this disposable emulator to export.
./gradlew :app:connectedDebugAndroidTest -Ptarget-platform=android-x64 \
  -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true
cd "$repo_root"
mkdir -p visual-artifacts
archive="$RUNNER_TEMP/ramo-notification-$app_role.tar"
adb exec-out run-as "br.com.ramonessa.$app_role" tar -C files -cf - notification-previews > "$archive"
tar -tf "$archive" > /dev/null
tar -xf "$archive" -C visual-artifacts
printf 'Offline Android 15 emulator fixtures. No real ride, payment or provider request. Source: %s\n' \
  "$GITHUB_SHA" > visual-artifacts/README.txt
