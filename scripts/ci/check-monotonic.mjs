// check-monotonic.mjs - the monotonic-version guard (equal-version allowed only as an idempotent
// recovery). Extracted from the monotonic-guard step of release.yml's pack job (run via `node`).
//
// Below max: fail. Equal max: pass ONLY when the published main bytes match this run (an idempotent
// recovery, which the flip then no-ops); otherwise foreign/stale -> fail. Strictly greater / first
// release: pass. Compared as numeric tuples (not string/semver).
//
// The comparison is exported as a pure function for testing. checkMonotonic throws an Error whose
// message is the exact ::error:: string on a fail, and returns a (possibly empty) log line on a
// pass, mirroring the original's console.error+exit(1) / console.log+exit(0) control flow.

export function checkMonotonic({ version, versionsJson, our, pubMain }) {
  const v = version.split(".").map(Number);
  let versions = JSON.parse(versionsJson || "[]");
  if (!Array.isArray(versions)) versions = [versions].filter(Boolean);
  const t = versions
    .map((s) => String(s).split(".").map(Number))
    .filter((x) => x.length === 3 && x.every(Number.isFinite));
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const max = t.sort(cmp).pop();
  if (!max) return "";
  const c = cmp(v, max);
  if (c < 0) {
    throw new Error(`::error::version ${version} is below the published max ${max.join(".")}`);
  }
  if (c === 0) {
    if (pubMain && pubMain === our) return "equal-max recovery re-run (main integrity matches)";
    throw new Error(
      `::error::version ${version} already the published max with different bytes (not a recovery)`,
    );
  }
  return "";
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  try {
    const log = checkMonotonic({
      version: process.env.VERSION,
      versionsJson: process.env.VERSIONS_JSON,
      our: process.env.OUR,
      pubMain: process.env.PUB_MAIN,
    });
    if (log) console.log(log);
  } catch (err) {
    // Guard failures carry the ::error:: marker and exit 1 (clean output, as the inline heredoc did).
    // An unexpected tooling error (bad JSON, missing env) has no marker: re-throw so Node prints the
    // full stack and exits non-zero, exactly as the un-wrapped node -e did.
    if (typeof err?.message === "string" && err.message.startsWith("::error::")) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
