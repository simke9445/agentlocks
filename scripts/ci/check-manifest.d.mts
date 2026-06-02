export function checkLocalManifest(args: {
  dir: string;
  manifest: { name?: unknown; os?: unknown; cpu?: unknown; libc?: unknown };
  binExists: (exe: string) => boolean;
}): void;

export function checkTarballFiles(args: {
  dir: string;
  packJson: Array<{ files?: Array<{ path: string }> }>;
}): void;

export function checkPublishedManifest(args: {
  dir: string;
  manifest: {
    name?: unknown;
    version?: unknown;
    os?: unknown;
    cpu?: unknown;
    libc?: unknown;
  };
  version: string;
}): void;
