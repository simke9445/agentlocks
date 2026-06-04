# Socket Package Score Baseline

Captured at: 2026-06-04T16:20Z

## Command Evidence

```bash
socket --help
socket package score npm agentlocks@0.8.0 --markdown
socket package score npm agentlocks --markdown
```

The installed Socket CLI is authenticated locally and reports CLI version `1.1.108`. The package
score command that worked is:

```bash
socket package score npm agentlocks@0.8.0 --markdown
```

The unversioned package lookup currently resolves to `agentlocks@0.8.0`, matching npm latest at the
time of capture.

## Current Published Score

Package: `npm/agentlocks@0.8.0`

Direct/transitive dependency count in Socket report: 1.

### Shallow Score

This is the score for the Agentlocks package itself, excluding dependencies.

| Category | Score |
| --- | ---: |
| Overall | 75 |
| Maintenance | 91 |
| Quality | 99 |
| Supply Chain | 75 |
| Vulnerability | 100 |
| License | 100 |

Detected capability for the package itself:

- `url`

Low-severity alerts for the package itself:

- `gptAnomaly`
- `urlStrings`

### Deep Score

Socket reports the aggregate function as `min`, so one low package score can set the deep category
score.

| Category | Score |
| --- | ---: |
| Overall | 75 |
| Maintenance | 89 |
| Quality | 99 |
| Supply Chain | 75 |
| Vulnerability | 100 |
| License | 100 |

Lowest-score package attribution:

| Category | Package |
| --- | --- |
| Overall | `npm/agentlocks@0.8.0` |
| Maintenance | `npm/commander@14.0.3` |
| Quality | `npm/agentlocks@0.8.0` |
| Supply Chain | `npm/agentlocks@0.8.0` |
| Vulnerability | `npm/commander@14.0.3` |
| License | `npm/commander@14.0.3` |

Detected capabilities across package plus dependency:

- `env`
- `url`

Low-severity alerts across package plus dependency:

| Alert | Example package |
| --- | --- |
| `envVars` | `npm/agentlocks@0.8.0` |
| `gptAnomaly` | `npm/agentlocks@0.8.0` |
| `urlStrings` | `npm/commander@14.0.3` |

## Interpretation

Confirmed:

- Published `agentlocks@0.8.0` currently scores 75 overall and 75 supply chain in Socket.
- Socket's deep maintenance floor is currently `commander@14.0.3` at 89.
- Vulnerability and license are already 100.
- Quality is already 99.

Likely:

- The next npm publish should improve the deep dependency surface because local `main` has already
  moved `commander` out of runtime dependencies and the published install tree should become
  dependency-free.
- Supply-chain score is currently limited by package-level signals, not by a vulnerability or license
  issue.

Hypothesis:

- Repository trust work in Phase 5, especially GitHub security policy, CodeQL, Dependabot, and
  OpenSSF Scorecard, is more likely to improve public trust than chasing the last Socket points in
  isolation.

## Recheck Plan

After the next npm release:

```bash
socket package score npm agentlocks@<new-version> --markdown
socket package score npm agentlocks --markdown
npm view agentlocks@<new-version> dependencies devDependencies dist.provenance --json
```

Expected validation:

- No runtime dependencies are present in the published manifest.
- Deep score no longer attributes category floors to `commander`.
- Supply-chain alerts are reviewed before public launch copy references Socket.
