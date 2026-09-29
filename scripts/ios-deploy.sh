#!/bin/bash
# Spielt Savora auf das per Kabel verbundene iPhone auf (Personal Team: alle 7 Tage wiederholen).
# Aufruf im Ordner savora-repo:  bash scripts/ios-deploy.sh
set -e
cd "$(dirname "$0")/.."
UDID=$(xcrun devicectl list devices --json-output /tmp/savora-devices.json >/dev/null 2>&1; python3 - <<'PY'
import json
d = json.load(open('/tmp/savora-devices.json'))
for dev in d['result']['devices']:
    if dev['hardwareProperties'].get('reality') == 'physical' and dev['connectionProperties'].get('tunnelState') in ('connected', 'available'):
        print(dev['hardwareProperties']['udid']); break
PY
)
[ -n "$UDID" ] || { echo "Kein iPhone gefunden. Kabel anschliessen, iPhone entsperren."; exit 1; }
echo "iPhone gefunden: $UDID"
# Build-Ordner ausserhalb von Schreibtisch/iCloud, sonst schlaegt das Signieren wegen iCloud-Dateiattributen fehl.
DD="$HOME/Library/Caches/savora-ios-build"
echo "1/3 Web-Dateien synchronisieren"; npm run ios:sync >/dev/null
echo "2/3 App bauen und signieren (dauert ein paar Minuten)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "id=$UDID" -derivedDataPath "$DD" -allowProvisioningUpdates build | grep -E "BUILD|error:" || true
echo "3/3 App auf dem iPhone installieren"
xcrun devicectl device install app --device "$UDID" "$DD/Build/Products/Debug-iphoneos/App.app"
echo "Fertig. Savora auf dem iPhone oeffnen."
