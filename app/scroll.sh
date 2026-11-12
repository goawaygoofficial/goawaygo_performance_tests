#!/usr/bin/env bash
# App performance (MVP 2, 5.6): smooth scrolling on Home. Flutter draws on its own surface, which Android's gfxinfo can't
# see, so the frames are taken where they reach the screen: SurfaceFlinger's present times for the app's Flutter surface
# while scroll.yaml runs. A frame is janky when it comes later than 1.5 refresh periods after the one before; pauses
# between swipes (over 250 ms with nothing to draw) aren't frames and aren't counted.
#
#   Env: JANK_LIMIT_PERCENT (60), FRAME_P90_LIMIT_MS (66), OUT (reports). A CI emulator draws in software, far slower
#        than a phone: the limits catch regressions (calibrated on the first CI runs); phone numbers come from testers.
set -euo pipefail

PKG=com.goawaygo.app
JANK_LIMIT="${JANK_LIMIT_PERCENT:-60}"
P90_LIMIT="${FRAME_P90_LIMIT_MS:-66}"
OUT="${OUT:-reports}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"

maestro test "$HERE/open-home.yaml" >/dev/null

# The app's Flutter surface (a SurfaceView; on recent Android its "(BLAST)" layer carries the frames).
layers="$(adb shell dumpsys SurfaceFlinger --list | tr -d '\r' | grep -F "SurfaceView[$PKG/" || true)"
layer="$(printf '%s\n' "$layers" | grep -F '(BLAST)' | head -n 1)"
[ -n "$layer" ] || layer="$(printf '%s\n' "$layers" | head -n 1)"
[ -n "$layer" ] || { echo "No Flutter surface of $PKG found in SurfaceFlinger" >&2; exit 1; }
printf '%s\n' "$layers" >"$OUT/app-scroll-layers.txt"

# Counted from here: only the scrolling.
adb shell dumpsys SurfaceFlinger --latency-clear >/dev/null
maestro test "$HERE/scroll.yaml" --format junit --output "$OUT/app-scroll-junit.xml" >/dev/null
adb shell "dumpsys SurfaceFlinger --latency '$layer'" | tr -d '\r' >"$OUT/app-scroll-latency.txt"

# Line 1: the refresh period (ns). Then one line per frame: desired, actual present, ready (ns); 0 or INT64_MAX = none.
# Plain awk and sort only (the runners' awk is mawk).
latency="$OUT/app-scroll-latency.txt"
period_ns="$(head -n 1 "$latency")"
tail -n +2 "$latency" | awk 'NF == 3 && $2 > 0 && $2 < 9e18 { print $2 }' | sort -n   | awk 'NR > 1 { d = ($1 - prev) / 1e6; if (d > 0 && d <= 250) print d } { prev = $1 }' >"$OUT/app-scroll-gaps.txt"
gaps="$(wc -l <"$OUT/app-scroll-gaps.txt" | tr -d ' ')"
frames=$((gaps > 0 ? gaps + 1 : 0))
period_ms="$(awk -v p="$period_ns" 'BEGIN { printf "%.1f", p / 1e6 }')"
if [ "$gaps" -gt 0 ]; then
  jank="$(awk -v p="$period_ms" '$1 > 1.5 * p { j++ } END { printf "%.1f", 100 * j / NR }' "$OUT/app-scroll-gaps.txt")"
  k=$((gaps * 9 / 10)); [ "$k" -ge 1 ] || k=1
  p90="$(sort -n "$OUT/app-scroll-gaps.txt" | sed -n "${k}p" | awk '{ printf "%.1f", $1 }')"
else
  jank=0
  p90=0
fi

printf '{"metric":"app_home_scroll","frames":%s,"janky_percent":%s,"frame_p90_ms":%s,"refresh_ms":%s,"jank_limit":%s,"p90_limit":%s}\n' \
  "$frames" "$jank" "$p90" "$period_ms" "$JANK_LIMIT" "$P90_LIMIT" >"$OUT/app-scroll.json"
echo "Scrolling Home: $frames frames, ${jank}% janky (limit ${JANK_LIMIT}%), p90 ${p90} ms between frames (limit ${P90_LIMIT} ms)"
[ "$frames" -ge 20 ] || { echo "::error::Only $frames frames measured: the scroll wasn't seen"; exit 1; }
awk -v j="$jank" -v l="$JANK_LIMIT" 'BEGIN { exit !(j <= l) }' \
  || { echo "::error::${jank}% janky frames is over the ${JANK_LIMIT}% limit"; exit 1; }
awk -v p="$p90" -v l="$P90_LIMIT" 'BEGIN { exit !(p <= l) }' \
  || { echo "::error::p90 ${p90} ms between frames is over the ${P90_LIMIT} ms limit"; exit 1; }
