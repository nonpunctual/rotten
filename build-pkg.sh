#!/bin/bash
#
# Builds a macOS .pkg that installs the current rotten-<version>.crx,
# updates.xml, and rotten-policy.mobileconfig into a stable, repo-independent
# location: /Library/Application Support/Rotten. That way the force-install
# policy keeps working even if this git checkout moves or is deleted.
#
# Run ./repack.sh <version> first so the .crx/updates.xml/mobileconfig in
# this directory are current - this script only repackages what's already
# here, it doesn't build the extension itself.
#
# Signed with the "Developer ID Installer" identity below if it's present in
# the keychain (via productsign, part of the Xcode Command Line Tools);
# otherwise falls back to an unsigned .pkg, which Gatekeeper will block on a
# plain double-click open - right-click -> Open, or approve it under System
# Settings -> Privacy & Security, to install it anyway.
SIGN_IDENTITY="${SIGN_IDENTITY:-Developer ID Installer: Brock Walters (34GLTN3UJU)}"

if [ ! -x /usr/bin/pkgbuild ]; then
  echo "error: pkgbuild not found (expected on macOS by default)" >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$DIR/chrome-extension/manifest.json"
MOBILECONFIG="$DIR/rotten-policy.mobileconfig"

if ! grep -qE '"version": *"[^"]+"' "$MANIFEST"; then
  echo "error: couldn't find a \"version\" field in $MANIFEST" >&2
  exit 1
fi
VERSION=$(grep -m1 -E '"version": *"[^"]+"' "$MANIFEST" | sed -E 's/.*"version": *"([^"]+)".*/\1/')

CRX="$DIR/rotten-$VERSION.crx"
UPDATES_XML="$DIR/updates.xml"
if [ ! -f "$CRX" ]; then
  echo "error: $CRX not found - run ./repack.sh $VERSION first" >&2
  exit 1
fi
if [ ! -f "$UPDATES_XML" ]; then
  echo "error: $UPDATES_XML not found" >&2
  exit 1
fi
if [ ! -f "$MOBILECONFIG" ]; then
  echo "error: $MOBILECONFIG not found" >&2
  exit 1
fi

INSTALL_DIR="/Library/Application Support/Rotten"
STABLE_URL_DIR="file:///Library/Application%20Support/Rotten"

# The forcelist entry is "<extension id>;<updates.xml url>" - the id half is
# the one thing the generated updates.xml and the installed mobileconfig both
# have to agree on, so read it once here and reuse it for both.
EXT_ID=$(/usr/libexec/PlistBuddy -c "Print :PayloadContent:0:ExtensionInstallForcelist:0" "$MOBILECONFIG" | cut -d';' -f1)
if [ -z "$EXT_ID" ]; then
  echo "error: couldn't read the extension id from $MOBILECONFIG" >&2
  exit 1
fi

export COPYFILE_DISABLE=1

PAYLOAD="$(mktemp -d)/payload"
STAGE="$PAYLOAD$INSTALL_DIR"
mkdir -p "$STAGE"

cp -X "$CRX" "$STAGE/rotten-$VERSION.crx"

cat > "$STAGE/updates.xml" <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXT_ID'>
    <updatecheck codebase='$STABLE_URL_DIR/rotten-$VERSION.crx' version='$VERSION' />
  </app>
</gupdate>
EOF

cp -X "$MOBILECONFIG" "$STAGE/rotten-policy.mobileconfig"
/usr/libexec/PlistBuddy -c "Set :PayloadContent:0:ExtensionInstallForcelist:0 $EXT_ID;$STABLE_URL_DIR/updates.xml" "$STAGE/rotten-policy.mobileconfig"

SCRIPTS="$(mktemp -d)"
cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/bash
echo "Rotten installed to /Library/Application Support/Rotten"
echo "If the force-install policy isn't already active, open"
echo "'/Library/Application Support/Rotten/rotten-policy.mobileconfig' and install it"
echo "via System Settings -> Profiles, then restart Chrome."
exit 0
EOF
chmod +x "$SCRIPTS/postinstall"

OUT="$DIR/Rotten-$VERSION.pkg"
pkgbuild \
  --root "$PAYLOAD" \
  --identifier com.rotten.installer \
  --version "$VERSION" \
  --install-location / \
  --scripts "$SCRIPTS" \
  "$OUT"

rm -rf "$(dirname "$PAYLOAD")" "$SCRIPTS"

if security find-identity -v -p basic 2>/dev/null | grep -qF "$SIGN_IDENTITY"; then
  SIGNED="$OUT.signing.tmp"
  if productsign --sign "$SIGN_IDENTITY" "$OUT" "$SIGNED"; then
    mv -f "$SIGNED" "$OUT"
    echo "Built and signed $OUT ($SIGN_IDENTITY)"
    pkgutil --check-signature "$OUT"
  else
    rm -f "$SIGNED"
    echo "error: productsign failed - $OUT is the unsigned build" >&2
    exit 1
  fi
else
  echo "Built $OUT"
  echo "Unsigned - signing identity '$SIGN_IDENTITY' not found in keychain. Gatekeeper will block a plain double-click; right-click -> Open to install."
fi
