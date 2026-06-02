// platform-target.mjs - the os/cpu/libc derivation from a target-dir name, shared by the three
// manifest checks (check-manifest.mjs) and the verify-identity assertion (assert-target-identity.mjs).
//
// Verbatim extraction of the derivation inlined in release.yml three times (pre-publish guard,
// post-publish guard, verify identity): if the dir ends with "-musl", libc="musl" and strip the
// suffix; split the remainder on the FIRST "-" into os and cpu; if os==="linux" and no libc,
// libc="glibc"; else libc stays null.

export function parseTarget(dir) {
  let d = dir;
  let libc = null;
  if (d.endsWith("-musl")) {
    libc = "musl";
    d = d.slice(0, -5);
  }
  const i = d.indexOf("-");
  const os = d.slice(0, i);
  const cpu = d.slice(i + 1);
  if (os === "linux" && !libc) libc = "glibc";
  return { os, cpu, libc };
}

// Binary name for a target. The heredocs check win32 two ways (os==="win32" in the pre-publish and
// verify-identity blocks; d.indexOf("win32")===0 in the tarball block); per the task, exeName uses
// the os==="win32" result of parseTarget, matching the pre-publish/verify-identity semantics.
export function exeName(target) {
  return parseTarget(target).os === "win32" ? "agentlocks.exe" : "agentlocks";
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: platform-target.mjs <target-dir>");
    process.exit(1);
  }
  const t = parseTarget(dir);
  console.log(JSON.stringify({ ...t, exe: exeName(dir) }));
}
