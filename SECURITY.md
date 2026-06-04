# Security Policy

## Supported Versions

Agentlocks is pre-release. Security fixes are made on `main` and shipped in the next npm release.

Only the latest published npm version is supported. If you are testing from source, update to the
current `main` branch before reporting a security issue.

## Reporting A Vulnerability

Do not open a public issue with exploit details.

Use GitHub's private vulnerability reporting flow for this repository when it is available:

https://github.com/simke9445/agentlocks/security/advisories/new

If that flow is unavailable, open a minimal public issue that says a private security report is
needed, but do not include paths, payloads, proof-of-concept output, or other sensitive details.

The published security policy lives at:

https://github.com/simke9445/agentlocks/security/policy

Include the affected version or commit, operating system, Node version, exact command, expected
behavior, observed behavior, and whether the issue can overwrite files, bypass lock checks, corrupt
state, or expose local data.

## Security Scope

Agentlocks is an advisory coordination tool for participating local agents. Security reports should
focus on issues inside that contract, including:

- lock acquisition or verification failures that allow silent overlap between cooperating agents;
- path canonicalization bugs that let a resource escape its intended lock scope;
- command execution, shell injection, or unsafe process spawning;
- unsafe handling of config files, generated instruction text, or repository-local state;
- npm package integrity, provenance, or release workflow regressions.

Agentlocks does not claim to prevent writes from a process that ignores the advisory protocol. That
is a product limitation, not a vulnerability by itself.

## Maintainer Response

Expect an initial response within 7 days. Confirmed vulnerabilities are handled on `main`, verified
with focused regression tests, and released through the gated release process in `RELEASING.md`.
