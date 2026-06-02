#!/bin/sh
# verify-install-and-prove.sh -- one verify-matrix leg's proof, factored out of release.yml so it can
# run either natively (the glibc/darwin/Windows legs) or inside `docker run <alpine>` (the musl legs).
# The musl legs cannot use a job `container:` because GitHub does not support JavaScript actions in
# Alpine containers on arm64 runners ("JavaScript Actions in Alpine containers are only supported on
# x64 Linux runners", proven on real CI), so download-artifact runs on the glibc host and this proof
# runs in the pinned Alpine image via docker. Reads env VERSION, TARGET, MODE (and RUNNER_OS for the
# Windows path; unset under docker, which then takes the POSIX branch). Expects the downloaded
# artifacts in the current directory: ./main.tgz, ./conformance-scenario.mjs, and
# ./scripts/ci/assert-target-identity.mjs (+ its platform-target.mjs import).
set -eu

# On Windows the npm prefix must be a native path (Git Bash $(pwd) is MSYS-style) so the npm shim and
# its cmd.exe invocation resolve; keep the MSYS path too for fs ops (rm/mkdir).
PREFIX_DIR="$(pwd)/.agentlocks-prefix"
if [ "${RUNNER_OS:-}" = "Windows" ]; then PREFIX="$(cygpath -w "$PREFIX_DIR")"; NP_SEP=";"; else PREFIX="$PREFIX_DIR"; NP_SEP=":"; fi
export npm_config_prefix="$PREFIX"
# Force optional deps on even if a runner .npmrc carries omit=optional (which would skip the platform
# package and let the Bun fallback produce a false pass).
export npm_config_omit=""
# Install AND the identity assertion are ONE retry unit, against a fresh prefix each attempt. Platform
# packages are optionalDependencies, so `npm install` SUCCEEDS even while the platform dep is still
# propagating and absent (npm tolerates a missing optional dep) -- retrying only the install would break
# on a binary-less success and the assert would then hard-fail instead of retrying. --prefer-online busts
# npm's negative-packument cache so a propagation miss is retried, not served stale. npm nests the
# platform optional dep under the main package (<global-root>/agentlocks/node_modules/, not hoisted to
# the global root), so NODE_PATH points there with the global root as a fallback.
ok=
i=1
while [ "$i" -le 6 ]; do
  rm -rf "$PREFIX_DIR"; mkdir -p "$PREFIX_DIR"
  if npm install -g ./main.tgz --include=optional --prefer-online; then
    GLOBAL_ROOT="$(npm root -g)"
    if NODE_PATH="$GLOBAL_ROOT/agentlocks/node_modules$NP_SEP$GLOBAL_ROOT" TARGET="$TARGET" VERSION="$VERSION" node scripts/ci/assert-target-identity.mjs; then ok=1; break; fi
  fi
  echo "install+identity retry $i (agentlocks-$TARGET@$VERSION may still be propagating)"; i=$((i + 1)); sleep 10
done
[ -n "$ok" ] || { echo "::error::install+identity of agentlocks-$TARGET@$VERSION failed on this runner after retries"; exit 1; }

# Invoke the npm-installed launcher shim by absolute path (never the platform binary directly, never
# from PATH). With Bun fallback off, a real lock cycle exercises the runtime-asset extraction that
# --version/--help bypass.
if [ "${RUNNER_OS:-}" = "Windows" ]; then BIN="$PREFIX\\agentlocks.cmd"; else BIN="$PREFIX/bin/agentlocks"; fi
AGENTLOCKS_DISABLE_BUN_FALLBACK=1 node conformance-scenario.mjs "$BIN" "$MODE"
