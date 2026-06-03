#!/bin/sh
# dist-integrity.sh <pkg@version> -> integrity, or empty when absent (E404); fail-closed on a persistent network/registry error.
#
# Byte-identical extraction of the view_integrity() helper inlined twice in release.yml (the
# monotonic-version guard and the flip). Prints the integrity to stdout
# (no trailing newline), prints nothing and exits 0 when the package is absent (E404), and exits 1
# with the same ::error:: message after the same 4-try / 5s-sleep loop on a persistent error.
set -eu

vi_out=""; vi_k=1
while [ "$vi_k" -le 4 ]; do
  if vi_out="$(npm view "$1" dist.integrity --prefer-online 2>/tmp/vierr)"; then printf '%s' "$vi_out"; exit 0; fi
  grep -q "E404" /tmp/vierr && exit 0
  vi_k=$((vi_k + 1)); sleep 5
done
echo "::error::npm view $1 dist.integrity failed (network/registry)" >&2; cat /tmp/vierr >&2; exit 1
