# ADR 101: Branch Strategy, Versioning & Changelog

## Status: Proposed

## Context

The core feature set is mature (ADR 091 P0 complete) and the app is already deployed publicly on `*.pages.dev`. However, release management infrastructure is missing:

- **Version**: `package.json` stuck at `0.0.1` despite 360+ commits since 2025-01
- **Tags**: No git tags — no way to reference or reproduce any prior release state
- **Branch**: Single `main` branch with no defined release workflow
- **Changelog**: No change history — users have no way to know what changed between visits
- **Deploy**: Manual `pnpm deploy` to Cloudflare Pages (no CI)

A lightweight release process is needed as the project transitions from solo development to public use.

## Decision

### Release Milestones

| Milestone | Indicator | Version Range |
|-----------|-----------|---------------|
| **Beta** (current) | Deployed on `*.pages.dev` | `0.x.y` |
| **Stable (v1.0)** | Custom domain + project format stabilized | `1.0.0` → |

The `pages.dev` deployment already serves as a public beta. SemVer `0.x` communicates that the project format may still change (see §7 for v1.0 blockers). The custom domain marks the transition to stable: it signals permanence and format stability to users.

### 1. Branch Model: main-only + tags

No release branches. Keep `main` always deployable. Mark release points with **annotated git tags**.

```
main ──●──●──●──●──●──●──●──●──●
                  ▲           ▲
               v0.1.0      v0.2.0
```

**Rationale**: Solo development doesn't justify the overhead of maintaining parallel branches. Tags provide lightweight, immutable release markers. Hotfixes go directly to `main` with a new patch tag.

### 2. Versioning: SemVer 0.x

Follow [SemVer 2.0.0](https://semver.org/):

| Phase | Range | Rules |
|-------|-------|-------|
| **Beta** (0.x) | `0.1.0` → `0.x.y` | Feature additions bump minor, fixes bump patch. No format stability guarantees (SemVer §4). |
| **Stable** (1.x) | `1.0.0` → | Standard SemVer. Breaking project format changes require major bump. |

**Initial release**: `0.1.0`

- Jump from `0.0.1` to `0.1.0` to reflect the substantial feature set already built
- No `-beta` suffix needed — SemVer `0.x` already signals pre-stable

**Bump workflow**:

```bash
# 1. Update version in package.json
# 2. Add entry to CHANGELOG.md
# 3. Commit, tag, deploy
git add package.json CHANGELOG.md
git commit -m "chore: release v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main --tags
pnpm deploy
```

Automation via `pnpm version` or scripts can be added later, but manual is sufficient for now.

### 3. Changelog: Manual (Keep a Changelog)

Place `CHANGELOG.md` at the project root using [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

## [0.1.0] - 2026-03-xx

### Added
- Scene with generative nodes (Turing Machine, Quantizer, Tonnetz)
- 19 voice engines (11 drum, 4 synth, sampler)
- Polymetric sequencer with p-locks, chance, slide, piano roll
- Multi-device collaboration via WebRTC
- Landing page with interactive demos (EN/JA)
- Cross-browser support (Chrome, Firefox, Safari)
- WAV recording, MIDI export, JSON project I/O

### Fixed
- Error handling UI for all user-recoverable errors
- Browser capability detection with graceful fallback
```

**Semi-automated via `/release` skill**: A `/release` skill generates a changelog draft by collecting commits since the last tag, grouped by type (feat/fix/etc). The user edits the draft to make entries user-facing, then the skill commits, tags, and deploys. No npm dependencies — uses `git log` only.

**Why semi-auto, not fully auto**: Commit messages are technical ("fix: guard StepGrid against undefined track") — changelog entries should be user-facing ("Fixed a crash when switching patterns quickly"). Auto-generation provides the skeleton; human editing provides the quality.

**Commit convention** (formalize existing style):

```
type: short summary (under 72 chars)
```

Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`

### 4. Tag & Release Strategy

| Action | Command |
|--------|---------|
| Tag | `git tag -a v{version} -m "Release v{version}"` |
| Push | `git push origin main --tags` |
| Deploy | `pnpm deploy` |
| GitHub Release | Optional: `gh release create v{version} --notes-file ...` |

**Tag naming**: `v` prefix (e.g. `v0.1.0`, `v0.2.0`)

GitHub Releases are optional during beta. Consider adopting them at v1.0 when the audience is larger.

### 5. Implementation Steps

#### Phase 1: First Tagged Release (now)

1. Update `package.json` version to `0.1.0`
2. Commit, tag `v0.1.0`, push with tags
3. Deploy

No `CHANGELOG.md` for the initial release — 360+ commits don't summarize meaningfully into one entry. Start the changelog from v0.2.0.

#### Phase 2: Ongoing Beta (pages.dev)

- Bump minor for feature batches, patch for fixes
- Create `CHANGELOG.md` at v0.2.0, update with each tagged release
- Cycle: develop → changelog → commit → tag → deploy

#### Phase 3: Stable (custom domain)

- Acquire custom domain, configure Cloudflare Pages custom domain
- All v1.0 format blockers resolved (see §7)
- Release `1.0.0` — first stable version
- Repurpose `*.pages.dev` as dev/preview environment (see §6)
- Adopt GitHub Releases for release notes
- Consider CI tag-triggered deploy (Cloudflare Pages GitHub integration)

### 6. Post-Custom-Domain: pages.dev as Dev Environment

After adding a custom domain, the `*.pages.dev` URL remains active automatically (Cloudflare does not allow disabling it). Repurpose it as a dev/preview environment:

| Option | Cost | Effect |
|--------|------|--------|
| **Cloudflare Access on pages.dev** | Free (≤50 users) | Login wall via Zero Trust; only authorized devs/testers can access |
| **Redirect pages.dev → custom domain** | Free | `_redirects` file or Pages Function; dev access via direct URL bypass |
| **Do nothing** | Free | pages.dev stays public; handle SEO duplicate with `<link rel="canonical">` |

**Recommended approach**: Cloudflare Access. It provides a proper login wall on pages.dev at zero cost, keeping it as a staging/preview URL for internal testing while the custom domain serves production.

All options are within the Cloudflare Free plan.

### 7. v1.0 Blockers: Project Format Stability

SemVer `1.0` implies that the Song JSON export format is stable — breaking changes to the format would require a major version bump. The following proposed ADRs may add optional fields to `Song` and should have `restoreSong` migration coverage before v1.0:

| ADR | Feature | Format Impact | Risk |
|-----|---------|---------------|------|
| **087** | Looper / Tape Node | Audio buffers stored in IDB only (live performance / online recording use case) — **not included in Song JSON**. No format impact. | None |
| **093** | Cross-Node Automation | Adds `crossNode?: number` to `AutomationParams`. Optional field — backward compatible via `restoreSong` migration. | Low |
| **083** | MIDI Learn & Pitch Bend | `CcMapping[]` for MIDI CC bindings. Persistence location undecided (Song field vs separate config). | Low |

**Criteria to proceed to v1.0**:
1. Custom domain acquired and configured on Cloudflare Pages
2. ADR 093 and 083, if implemented, have their new fields covered by `restoreSong` migration
3. `restoreSong` handles all known format transitions gracefully (old projects load without data loss)

## Considerations

- **Why no release branches**: With a single developer and `main` always deployable, release branches add management cost with no benefit. Revisit if parallel hotfix work becomes necessary.
- **Why no `-beta` suffix**: SemVer `0.x` already communicates instability (§4: "anything MAY change at any time"). Adding `-beta` is redundant and makes version strings longer for no gain.
- **Why `pages.dev` = beta**: The URL itself communicates "this is a preview". Users who find it understand it's not the final home. A custom domain signals "this is real" — that's the right moment for v1.0.
- **Why not start at v1.0**: The Song JSON structure has a few pending optional field additions (ADR 093, 083). Starting at `0.x` gives freedom to evolve the format without violating SemVer's backward compatibility promise. Custom domain acquisition is the primary gate for v1.0.
- **Cloudflare Pages integration**: Currently manual `pnpm deploy`. GitHub integration would auto-deploy on push, but manual deploys prevent accidental releases. Keep manual for now.

### 8. `/release` Skill

A Claude Code skill that handles the full release cycle:

```
/release [patch|minor|major]   (default: minor)
```

**Steps**:

1. Determine next version from latest git tag + bump type
2. Collect commits since last tag via `git log`, group by type
3. Generate draft changelog section in `CHANGELOG.md` (create file at v0.2.0 if absent)
4. Open draft for user editing (user rewrites entries to be user-facing)
5. Update `package.json` version
6. Commit: `chore: release v{version}`
7. Create annotated tag: `v{version}`
8. Prompt user to confirm deploy (`pnpm deploy`)

**First release (v0.1.0)**: Skip changelog (no prior tag to diff against). Version bump + tag + deploy only.

## Future Extensions

- **GitHub Actions**: Tag push → build → Cloudflare Pages deploy → GitHub Release automation
- **Format version field**: Add `formatVersion: number` to `Song` interface for explicit migration tracking
