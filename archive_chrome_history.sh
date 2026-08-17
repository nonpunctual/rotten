#!/bin/bash
#
# Archive Chrome's local History into a day-partitioned archive DB.
#
# Read-only with respect to Chrome's History: nothing is ever deleted or
# rewritten there. For every profile, all current visits are grouped by
# calendar day and upserted into chrome_history_archive.db, so that history
# surviving past Chrome's own retention window (~90 days) isn't lost.
#
# A day's row is fully overwritten on every run for as long as that day
# still has live visits in Chrome's History - covers re-running the script
# multiple times before a day ages out. Once a day has no more live visits
# (Chrome purged it past the 90-day window), that day is absent from the
# SELECT below and is therefore never touched again - frozen permanently,
# with no separate "is this frozen" logic needed.
#
# Usage:
#   ./archive_chrome_history.sh --dry-run   # preview what would be archived
#   ./archive_chrome_history.sh             # actually archive

CHROME_BASE_DIR="$HOME/Library/Application Support/Google/Chrome"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_DB="$SCRIPT_DIR/chrome_history_archive.db"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

table_exists() {
  sqlite3 "$1" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$(sql_escape "$2")';" | grep -q 1
}

archive_profile() {
  local history_path="$1"
  local profile_dir profile_name work_path
  profile_dir="$(dirname "$history_path")"
  profile_name="$(basename "$profile_dir")"

  echo
  echo "=== $profile_name ($history_path) ==="

  # Work off a copy so a concurrently-running Chrome is never touched.
  work_path="$(mktemp)"
  cp "$history_path" "$work_path"

  local esc_profile now
  esc_profile="$(sql_escape "$profile_name")"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ "$DRY_RUN" = "1" ]; then
    local rows days
    rows="$(sqlite3 "$work_path" "SELECT COUNT(*) FROM (SELECT 1 FROM visits v JOIN urls u ON u.id = v.url GROUP BY strftime('%Y-%m-%d', v.visit_time / 1000000 - 11644473600, 'unixepoch'), u.url);")"
    days="$(sqlite3 "$work_path" "SELECT COUNT(DISTINCT strftime('%Y-%m-%d', visit_time / 1000000 - 11644473600, 'unixepoch')) FROM visits;")"
    echo "Would archive $rows url-day row(s) across $days live day(s). (dry run: archive DB unchanged)"
    rm -f "$work_path"
    return
  fi

  # Migrate an old url-keyed archive table out of the way if present, same
  # as the original culling script did, so this can share its archive DB.
  if table_exists "$ARCHIVE_DB" archived_urls && \
     ! sqlite3 "$ARCHIVE_DB" "PRAGMA table_info(archived_urls);" | grep -q '|day|'; then
    sqlite3 "$ARCHIVE_DB" "ALTER TABLE archived_urls RENAME TO archived_urls_v1_legacy;"
    echo "Migrated old url-keyed archive table to archived_urls_v1_legacy (kept, not used by day-based archiving)."
  fi

  sqlite3 "$ARCHIVE_DB" "
    CREATE TABLE IF NOT EXISTS archived_urls (
      profile TEXT NOT NULL,
      day TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      visit_count INTEGER NOT NULL,
      first_visit_time INTEGER NOT NULL,
      last_visit_time INTEGER NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (profile, day, url)
    );"

  local esc_archive_db archived_before archived_after archived_count
  esc_archive_db="$(sql_escape "$ARCHIVE_DB")"
  archived_before="$(sqlite3 "$ARCHIVE_DB" "SELECT COUNT(*) FROM archived_urls;")"

  # visit_time is microseconds since 1601-01-01; the 11644473600 offset
  # converts to Unix epoch seconds.
  sqlite3 "$work_path" "
    ATTACH DATABASE '$esc_archive_db' AS archive;
    INSERT INTO archive.archived_urls
      (profile, day, url, title, visit_count, first_visit_time, last_visit_time, last_synced_at)
    SELECT
      '$esc_profile',
      strftime('%Y-%m-%d', v.visit_time / 1000000 - 11644473600, 'unixepoch'),
      u.url, u.title, COUNT(*), MIN(v.visit_time), MAX(v.visit_time), '$now'
    FROM visits v JOIN urls u ON u.id = v.url
    WHERE true
    GROUP BY 2, u.url
    ON CONFLICT(profile, day, url) DO UPDATE SET
      title = excluded.title,
      visit_count = excluded.visit_count,
      first_visit_time = excluded.first_visit_time,
      last_visit_time = excluded.last_visit_time,
      last_synced_at = excluded.last_synced_at;
    DETACH DATABASE archive;"

  archived_after="$(sqlite3 "$ARCHIVE_DB" "SELECT COUNT(*) FROM archived_urls;")"
  archived_count="$(sqlite3 "$work_path" "SELECT COUNT(DISTINCT strftime('%Y-%m-%d', visit_time / 1000000 - 11644473600, 'unixepoch')) FROM visits;")"
  echo "Archive DB rows: $archived_before -> $archived_after ($archived_count live day(s) refreshed this run)"

  rm -f "$work_path"
}

main() {
  local found=0
  for entry in "$CHROME_BASE_DIR"/*; do
    [ -d "$entry" ] || continue
    local name
    name="$(basename "$entry")"
    case "$name" in
      Default|"Profile "*)
        if [ -f "$entry/History" ]; then
          found=1
          archive_profile "$entry/History"
        fi
        ;;
    esac
  done

  if [ "$found" = "0" ]; then
    echo "No Chrome profiles found under $CHROME_BASE_DIR"
    exit 1
  fi
}

main "$@"
