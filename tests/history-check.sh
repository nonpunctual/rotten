#!/bin/sh
# Copy Chrome's Default-profile History and Bookmarks into a new directory under /private/tmp,
# export them, and print what Rotten's rules and bookmarks would delete. The originals are only
# read; the copies are removed at the end.
# Usage: tests/history-check.sh [personal-rules.txt]
# The personal rules file (one rule per line) lives outside the repo.

jsc=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
profile="$HOME/Library/Application Support/Google/Chrome/Default"
here=$(/usr/bin/dirname "$0")

if [ ! -f "$profile/History" ]
then
    echo "error: no History at $profile/History" >&2; exit 1
fi

if [ -n "$1" ] && [ ! -f "$1" ]
then
    echo "error: no rules file at $1" >&2; exit 1
fi

dir=$(/usr/bin/mktemp -d /private/tmp/rotten-check.XXXXXX) || exit 1
/bin/cp "$profile/History" "$dir/History" || exit 1

# visits = urls.visit_count, the count history.search reports as visitCount; rows = visits table rows;
# hidden = urls.hidden.
/usr/bin/sqlite3 -json "$dir/History" "SELECT u.url, u.title, u.visit_count AS visits, (SELECT COUNT(*) FROM visits v WHERE v.url = u.id) AS rows, u.hidden FROM urls u;" > "$dir/urls.json" || exit 1

if [ ! -s "$dir/urls.json" ]
then
    echo "[]" > "$dir/urls.json"
fi

if [ -f "$profile/Bookmarks" ]
then
    /usr/bin/jq -r '.. | objects | select(.type == "url") | .url' "$profile/Bookmarks" > "$dir/bookmarks.txt" || exit 1
else
    : > "$dir/bookmarks.txt"
fi

"$jsc" -m "$here/history-check.js" -- "$dir/urls.json" "$dir/bookmarks.txt" ${1:+"$1"}
status=$?
/bin/rm -r "$dir"
exit "$status"
