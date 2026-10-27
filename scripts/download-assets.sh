#!/usr/bin/env bash
# Downloads all Sanity CDN assets from static/dev/cache.json into static/dev/assets/
# Usage: bash scripts/download-assets.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
OUT="$ROOT/static/dev/assets"

mkdir -p "$OUT"

# Extract all cdn.sanity.io URLs from the JSON
URLS=$(node "$SCRIPT_DIR/list-assets.mjs")

TOTAL=$(echo "$URLS" | wc -l | tr -d ' ')
echo "Downloading $TOTAL assets to $OUT ..."

COUNT=0
SKIP=0
while IFS= read -r URL; do
  FILENAME=$(basename "$URL")
  DEST="$OUT/$FILENAME"
  if [ -f "$DEST" ]; then
    SKIP=$((SKIP+1))
  else
    echo "  ↓ $FILENAME"
    curl -fsSL --retry 3 -o "$DEST" "$URL" &
    # Throttle: max 8 parallel downloads
    while [ "$(jobs -r | wc -l)" -ge 8 ]; do sleep 0.2; done
    COUNT=$((COUNT+1))
  fi
done <<< "$URLS"

wait
echo "Done. Downloaded: $COUNT  Skipped (already existed): $SKIP"
