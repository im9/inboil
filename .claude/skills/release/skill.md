---
name: release
description: Bump version, generate changelog draft, tag, and deploy a release.
allowed-tools: Bash(git log *), Bash(git tag *), Bash(git diff *), Bash(git status *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(pnpm deploy *), Bash(pnpm build *), Read, Edit, Write, AskUserQuestion
---

# Release

Bump version, generate a changelog draft, create a tagged release, and deploy.

## Usage

```
/release [patch|minor|major]   (default: minor)
```

## Process

### 1. Determine version

- Read the latest git tag: `git tag --sort=-v:refnum | head -1`
- If no tags exist, this is the first release — use `0.1.0`
- Apply bump type (patch/minor/major) to compute next version
- Confirm with user: "Release v{version}?"

### 2. Pre-flight checks

- `pnpm check` and `pnpm test` must pass
- Working tree must be clean (`git status` — no uncommitted changes)
- If checks fail, stop and report

### 3. Generate changelog draft

- Skip this step for the first release (no prior tag to diff against)
- Collect commits since last tag: `git log v{prev}..HEAD --format='%s'`
- Group by type prefix (feat → Added, fix → Fixed, refactor/style → Changed, docs → Documentation)
- If `CHANGELOG.md` doesn't exist, create it with the [Keep a Changelog](https://keepachangelog.com/) header
- Insert a new section at the top with the draft entries
- **Ask the user to review and edit** the changelog draft before proceeding
  - User rewrites technical commit messages into user-facing descriptions
  - Wait for explicit confirmation before continuing

### 4. Version bump

- Update `version` in `package.json`

### 5. Commit and tag

```bash
git add package.json CHANGELOG.md  # CHANGELOG.md only if it was created/updated
git commit -m "chore: release v{version}"
git tag -a v{version} -m "Release v{version}"
```

### 6. Deploy

- Ask user: "Push tags and deploy? (git push origin main --tags && pnpm deploy)"
- Only proceed with explicit confirmation
- Run `git push origin main --tags`
- Run `pnpm deploy`

## Safety

- Never deploy without user confirmation
- Never skip pre-flight checks
- Never auto-generate final changelog text — always show draft and wait for user edit
- First release (v0.1.0): version bump + tag + deploy only, no changelog
