#!/bin/bash

# This script performs the following build actions:
#
# 1. Bumps the chrome-extension/manifest.json to the version supplied on the command line when executing
# 2. Repacks the Rotten Chrome extension into a signed .crx
# 3. Rewrites the updates.xml to match
# 4. Rewrites the .mobileconfig's ExtensionInstallForcelist entry to match
#
# The script will reuse a "rotten.pem" certificate file if present so that the extension id stays
# stable across builds. If the .pem is missing, the script will generate one.


if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: $(basename "$0") <version>" >&2
  exit 1
fi
NEW_VERSION="$1"
if [[ ! "$NEW_VERSION" =~ ^[0-9]+(\.[0-9]+){1,3}$ ]]; then
  echo "error: version '$NEW_VERSION' doesn't look like a version string (e.g. 0.2.4)" >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
KEY="$DIR/rotten.pem"
SRC="$DIR/chrome-extension"
MANIFEST="$SRC/manifest.json"
UPDATES_XML="$DIR/updates.xml"
MOBILECONFIG="$DIR/rotten-policy.mobileconfig"

if [ ! -x "$CHROME_BIN" ]; then
  echo "error: Chrome binary not found at $CHROME_BIN (set CHROME_BIN to override)" >&2
  exit 1
fi
KEY_IS_NEW=0
if [ ! -f "$KEY" ]; then
  echo "no $KEY found - generating a new signing key (this gives the extension a new id - a private key can't be recovered/reused across machines)" >&2
  openssl genrsa -out "$KEY" 2048 2>/dev/null
  chmod 600 "$KEY"
  KEY_IS_NEW=1
fi
if [ ! -f "$UPDATES_XML" ]; then
  echo "error: $UPDATES_XML not found" >&2
  exit 1
fi
if [ ! -f "$MOBILECONFIG" ]; then
  echo "error: $MOBILECONFIG not found" >&2
  exit 1
fi

if ! grep -qE '"version": *"[^"]+"' "$MANIFEST"; then
  echo "error: couldn't find a \"version\" field in $MANIFEST" >&2
  exit 1
fi
sed -i '' -E 's/"version": *"[^"]+"/"version": "'"$NEW_VERSION"'"/' "$MANIFEST"
VERSION="$NEW_VERSION"

COMPUTED_ID=$(openssl rsa -in "$KEY" -pubout -outform DER 2>/dev/null \
  | shasum -a 256 | cut -d' ' -f1 | cut -c1-32 | tr '0123456789abcdef' 'abcdefghijklmnop')

if [ "$KEY_IS_NEW" = "1" ]; then
  EXT_ID="$COMPUTED_ID"
else
  EXT_ID=$(grep -oE "appid='[a-p]+'" "$UPDATES_XML" | head -1 | sed -E "s/appid='([a-p]+)'/\1/")
  if [ -z "$EXT_ID" ]; then
    echo "error: couldn't read appid from $UPDATES_XML" >&2
    exit 1
  fi
  if [ "$COMPUTED_ID" != "$EXT_ID" ]; then
    echo "error: rotten.pem's derived id ($COMPUTED_ID) doesn't match updates.xml's appid ($EXT_ID) - wrong key file?" >&2
    exit 1
  fi
fi

OUT_CRX="$DIR/rotten-$VERSION.crx"

"$CHROME_BIN" --pack-extension="$SRC" --pack-extension-key="$KEY" >/dev/null

GENERATED="$DIR/chrome-extension.crx"
if [ ! -f "$GENERATED" ]; then
  echo "error: expected $GENERATED after packing, not found" >&2
  exit 1
fi
mv -f "$GENERATED" "$OUT_CRX"

# Drop older versioned crx files so the dir doesn't accumulate stale builds.
find "$DIR" -maxdepth 1 -name 'rotten-*.crx' ! -name "$(basename "$OUT_CRX")" -exec rm -f {} +

cat > "$UPDATES_XML" <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXT_ID'>
    <updatecheck codebase='file://$OUT_CRX' version='$VERSION' />
  </app>
</gupdate>
EOF

/usr/libexec/PlistBuddy -c "Set :PayloadContent:0:ExtensionInstallForcelist:0 $EXT_ID;file://$UPDATES_XML" "$MOBILECONFIG"

echo "Packed rotten-$VERSION.crx (extension id $EXT_ID)"
echo "updates.xml now points at file://$OUT_CRX"
echo "rotten-policy.mobileconfig's ExtensionInstallForcelist now points at extension id $EXT_ID"
