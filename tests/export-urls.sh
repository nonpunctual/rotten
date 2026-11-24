#!/bin/sh
# Copy Chrome's Default-profile History into a new directory under /private/tmp
# and export every urls.url to urls.json there. The original is only read.
# Prints the path of urls.json.

history="$HOME/Library/Application Support/Google/Chrome/Default/History"

if [ ! -f "$history" ]
then
    echo "error: no History at $history" >&2; exit 1
fi

dir=$(/usr/bin/mktemp -d /private/tmp/rotten-urls.XXXXXX) || exit 1
/bin/cp "$history" "$dir/History" || exit 1
/usr/bin/sqlite3 -json "$dir/History" "SELECT url FROM urls;" > "$dir/urls.json" || exit 1

if [ ! -s "$dir/urls.json" ]
then
    echo "[]" > "$dir/urls.json"
fi

echo "$dir/urls.json"
