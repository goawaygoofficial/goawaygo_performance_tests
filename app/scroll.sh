#!/usr/bin/env bash
# App performance (MVP 2, 5.6): smooth scrolling on Home. Android counts every frame the app draws while scroll.yaml
# runs (dumpsys gfxinfo); the share of janky frames (too slow to draw) and the 90th percentile frame time must stay
# under the limits. Needs a running emulator with the test build installed, and Maestro.
#
#   Env: JANK_LIMIT_PERCENT (30), FRAME_P90_LIMIT_MS (48): a CI emulator draws in software, far slower than a phone;
#        the limits catch regressions, the phone numbers come from the testers. OUT (reports)
set -euo pipefail

PKG=com.goawaygo.app
JANK_LIMIT="${JANK_LIMIT_PERCENT:-30}"
P90_LIMIT="${FRAME_P90_LIMIT_MS:-48}"
OUT="${OUT:-reports}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"

maestro test "$HERE/open-home.yaml" >/dev/null
# Counted from here: only the scrolling, not the start-up.
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
maestro test "$HERE/scroll.yaml" --format junit --output "$OUT/app-scroll-junit.xml" >/dev/null
stats="$(adb shell dumpsys gfxinfo "$PKG" | tr -d '\r')"
printf '%s\n' "$stats" >"$OUT/app-gfxinfo.txt"

frames="$(printf '%s\n' "$stats" | awk -F': ' '/^Total frames rendered/ {print $2; exit}')"
jank="$(printf '%s\n' "$stats" | sed -n 's/^Janky frames: [0-9]* (\([0-9.]*\)%).*/\1/p' | head -n 1)"
p90="$(printf '%s\n' "$stats" | sed -n 's/^90th percentile: \([0-9]*\)ms.*/\1/p' | head -n 1)"
[ -n "$frames" ] && [ -n "$jank" ] && [ -n "$p90" ] || { echo "No frame statistics from gfxinfo" >&2; exit 1; }

printf '{"metric":"app_home_scroll","frames":%s,"janky_percent":%s,"frame_p90_ms":%s,"jank_limit":%s,"p90_limit":%s}\n' \
  "$frames" "$jank" "$p90" "$JANK_LIMIT" "$P90_LIMIT" >"$OUT/app-scroll.json"
echo "Scrolling Home: $frames frames, ${jank}% janky (limit ${JANK_LIMIT}%), p90 ${p90} ms (limit ${P90_LIMIT} ms)"
awk -v j="$jank" -v l="$JANK_LIMIT" 'BEGIN { exit !(j <= l) }' \
  || { echo "::error::${jank}% janky frames is over the ${JANK_LIMIT}% limit"; exit 1; }
[ "$p90" -le "$P90_LIMIT" ] || { echo "::error::p90 frame time ${p90} ms is over the ${P90_LIMIT} ms limit"; exit 1; }
