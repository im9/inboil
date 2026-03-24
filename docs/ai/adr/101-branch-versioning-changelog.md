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

**Why manual, not auto-generated**: Zero npm dependencies policy. Manual changelogs are also better for users — commit messages are technical, changelog entries should be user-facing. The cost of writing a few lines per release is negligible.

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

1. Create `CHANGELOG.md` with the initial release entry
2. Update `package.json` version to `0.1.0`
3. Commit, tag `v0.1.0`, push with tags
4. Deploy

#### Phase 2: Ongoing Beta (pages.dev)

- Bump minor for feature batches, patch for fixes
- Update `CHANGELOG.md` with each tagged release
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

SemVer `1.0` implies that the Song JSON export format is stable — breaking changes to the format would require a major version bump. The following proposed ADRs may change the `Song` structure and should be resolved (implemented or deferred) before v1.0:

| ADR | Feature | Format Impact | Risk |
|-----|---------|---------------|------|
| **087** | Looper / Tape Node | New `SceneNode` type `'looper'` + `LooperConfig`. Audio buffer persistence (~11MB for 8 bars/4 tracks) could fundamentally change save format. | **High** |
| **093** | Cross-Node Automation | Adds `crossNode?: number` to `AutomationParams`. Optional field — backward compatible via `restoreSong` migration. | Low |
| **083** | MIDI Learn & Pitch Bend | `CcMapping[]` for MIDI CC bindings. Persistence location undecided (Song field vs separate config). | Low |

**ADR 087 (Looper)** is the primary blocker. It introduces large binary audio data into what is currently a pure JSON structure. This decision (embed as base64? separate blob storage? IndexedDB-only with no export?) will shape the save format significantly.

**Criteria to proceed to v1.0**:
1. ADR 087 is either implemented (format settled) or explicitly deferred past v1.0
2. ADR 093 and 083, if implemented, have their new fields covered by `restoreSong` migration
3. `restoreSong` handles all known format transitions gracefully (old projects load without data loss)

## Considerations

- **Why no release branches**: With a single developer and `main` always deployable, release branches add management cost with no benefit. Revisit if parallel hotfix work becomes necessary.
- **Why no `-beta` suffix**: SemVer `0.x` already communicates instability (§4: "anything MAY change at any time"). Adding `-beta` is redundant and makes version strings longer for no gain.
- **Why `pages.dev` = beta**: The URL itself communicates "this is a preview". Users who find it understand it's not the final home. A custom domain signals "this is real" — that's the right moment for v1.0.
- **Why not start at v1.0**: The Song JSON structure is not yet stable. ADR 087 (Looper) could fundamentally change the save format with audio buffer persistence. Starting at `0.x` gives freedom to evolve the format without violating SemVer's backward compatibility promise.
- **Cloudflare Pages integration**: Currently manual `pnpm deploy`. GitHub integration would auto-deploy on push, but manual deploys prevent accidental releases. Keep manual for now.

## Future Extensions

- **GitHub Actions**: Tag push → build → Cloudflare Pages deploy → GitHub Release automation
- **`pnpm release` script**: One-command version bump + changelog + tag + deploy
- **Release notes draft**: Lightweight shell script to generate changelog draft from `git log` (no npm dependency needed)
- **Format version field**: Add `formatVersion: number` to `Song` interface for explicit migration tracking
