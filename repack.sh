#!/bin/sh
# Builds Rotten's signed .crx and stages what the .pkg installs.
# 1. Sets the version in extension/manifest.json.
# 2. Packs extension/ into rotten-<version>.crx with rotten.pem. If rotten.pem is missing, makes
#    one: a new key means a new extension ID, so back it up.
# 3. Writes updates.xml and rotten-policy.mobileconfig from the heredocs below, with the
#    extension ID derived from the key.
# 4. Copies all three into payload/Library/Application Support/Rotten/.
# Usage: ./repack.sh <version>

version="$1"
dir=$(cd "$(/usr/bin/dirname "$0")" && /bin/pwd)
chrome="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
key="$dir/rotten.pem"
src="$dir/extension"
manifest="$src/manifest.json"
crx="rotten-$version.crx"
install_url="file:///Library/Application%20Support/Rotten"
stage="$dir/payload/Library/Application Support/Rotten"

if ! printf '%s\n' "$version" | /usr/bin/grep -qE '^[0-9]+(\.[0-9]+){1,3}$'
then
    echo "usage: $(/usr/bin/basename "$0") <version> (e.g. 3.0.0)" >&2; exit 1
fi

if [ ! -x "$chrome" ]
then
    echo "error: no Chrome at $chrome (set CHROME_BIN)" >&2; exit 1
fi

if ! /usr/bin/grep -qE '"version": *"[^"]+"' "$manifest"
then
    echo "error: no \"version\" in $manifest" >&2; exit 1
fi

if [ ! -f "$key" ]
then
    echo "no rotten.pem: making a new signing key. A new key means a new extension ID; back it up." >&2
    if ! (umask 077; /usr/bin/openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$key" 2>/dev/null)
    then
        echo "error: making $key failed" >&2; exit 1
    fi
fi

# Extension ID: the first 32 hex digits of the SHA-256 of the DER public key, 0-f mapped to a-p.
id_of_der(){
    /usr/bin/shasum -a 256 | /usr/bin/cut -c1-32 | /usr/bin/tr '0123456789abcdef' 'abcdefghijklmnop'
}
ext_id=$(/usr/bin/openssl pkey -in "$key" -pubout -outform DER 2>/dev/null | id_of_der)

# The manifest's "key" (base64 DER public key) sets the unpacked ID; it must come from rotten.pem.
manifest_key=$(/usr/bin/jq -r '.key // empty' "$manifest")
if [ -n "$manifest_key" ]
then
    manifest_id=$(printf '%s' "$manifest_key" | /usr/bin/base64 -D | id_of_der)
    if [ "$manifest_id" != "$ext_id" ]
    then
        echo "error: rotten.pem's ID ($ext_id) differs from the manifest key's ($manifest_id): wrong key file?" >&2; exit 1
    fi
fi

/usr/bin/sed -i '' -E 's/"version": *"[^"]+"/"version": "'"$version"'"/' "$manifest"

/bin/rm -f "$dir/extension.crx"
"$chrome" --pack-extension="$src" --pack-extension-key="$key" > /dev/null 2>&1
if [ ! -f "$dir/extension.crx" ]
then
    echo "error: Chrome wrote no $dir/extension.crx" >&2; exit 1
fi
/bin/mv -f "$dir/extension.crx" "$dir/$crx"
/usr/bin/find "$dir" -maxdepth 1 -name 'rotten-*.crx' ! -name "$crx" -exec /bin/rm -f {} +

/bin/cat > "$dir/updates.xml" <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
    <app appid='$ext_id'>
        <updatecheck codebase='$install_url/$crx' version='$version' />
    </app>
</gupdate>
EOF

/bin/cat > "$dir/rotten-policy.mobileconfig" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>ExtensionInstallForcelist</key>
            <array>
                <string>$ext_id;$install_url/updates.xml</string>
            </array>
            <key>PayloadDisplayName</key>
            <string>Google Chrome</string>
            <key>PayloadIdentifier</key>
            <string>com.nonpunctual.rotten.chrome</string>
            <key>PayloadType</key>
            <string>com.google.Chrome</string>
            <key>PayloadUUID</key>
            <string>1C39AF44-D11C-4DEC-A66C-B58E981D78EA</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Rotten</string>
    <key>PayloadIdentifier</key>
    <string>com.nonpunctual.rotten</string>
    <key>PayloadScope</key>
    <string>System</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>AEA7E620-40E5-4954-BF99-E23A4877881C</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
EOF

/bin/mkdir -p "$stage" || exit 1
/bin/rm -f "$stage"/rotten-*.crx
/bin/cp "$dir/$crx" "$dir/updates.xml" "$dir/rotten-policy.mobileconfig" "$stage/" || exit 1
# Chrome writes the .crx as 600; installed as root, Chrome (running as the user) must read it.
/bin/chmod 644 "$stage/$crx" "$stage/updates.xml" "$stage/rotten-policy.mobileconfig"

echo "packed $crx, extension ID $ext_id"
echo "wrote updates.xml and rotten-policy.mobileconfig; staged all three in $stage"
