#!/usr/bin/env bash
# App performance (MVP 2, 5.6): cold start-up time of the Android app on the emulator, from tapping the icon to the
# first frame (Android's TotalTime). The app is stopped before each of RUNS starts; the median must stay under the
# limit. Needs a running emulator (adb) with the test build installed.
#
#   Env: RUNS (5), STARTUP_LIMIT_MS (4000: a CI emulator is several times slower than a phone), OUT (reports)
set -euo pipefail

PKG=com.goawaygo.app
RUNS="${RUNS:-5}"
LIMIT="${STARTUP_LIMIT_MS:-4000}"
OUT="${OUT:-reports}"
mkdir -p "$OUT"

activity="$(adb shell cmd package resolve-activity --brief "$PKG" | tr -d '\r' | tail -n 1)"
[ -n "$activity" ] || { echo "$PKG is not installed" >&2; exit 1; }

times=()
for run in $(seq 1 "$RUNS"); do
  adb shell am force-stop "$PKG"
  sleep 2
  ms="$(adb shell am start -W -n "$activity" | tr -d '\r' | awk -F': ' '/^TotalTime/ {print $2}')"
  [ -n "$ms" ] || { echo "run $run: no start-up time reported" >&2; exit 1; }
  echo "start-up run $run: ${ms} ms"
  times+=("$ms")
  sleep 3
done
adb shell am force-stop "$PKG"

median="$(printf '%s\n' "${times[@]}" | sort -n | awk '{a[NR]=$1} END {print (NR % 2) ? a[(NR+1)/2] : int((a[NR/2]+a[NR/2+1])/2)}')"
printf '{"metric":"app_cold_startup_ms","runs":[%s],"median":%s,"limit":%s}\n' \
  "$(IFS=,; echo "${times[*]}")" "$median" "$LIMIT" >"$OUT/app-startup.json"
echo "Median cold start-up: ${median} ms (limit ${LIMIT} ms)"
[ "$median" -le "$LIMIT" ] || { echo "::error::App cold start-up ${median} ms is over the ${LIMIT} ms limit"; exit 1; }
