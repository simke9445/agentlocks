export function assertOptionalDeps(args: {
  optionalDependencies: Record<string, string> | undefined;
  targets: string;
  version: string;
}): void;
