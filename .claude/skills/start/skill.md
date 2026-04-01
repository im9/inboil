# Start

Fetch latest main, create a feature branch, and switch to it.

## Usage

```
/start [branch-name]
```

## Process

1. **Check working tree**: `git status` — warn if uncommitted changes exist
2. **Fetch latest**: `git fetch origin`
3. **Switch to main**: `git checkout main && git pull origin main`
4. **Determine branch name**:
   - If the user provided a branch name, use it as-is (e.g. `feat/foo`, `fix/bar`)
   - If not provided, ask the user what they're working on, then suggest a name with conventional prefix (`feat/`, `fix/`, `refactor/`, `docs/`, `chore/`, `perf/`)
5. **Create branch**: `git checkout -b {branch}`
6. **Confirm**: Report the branch name and that it's ready

## Safety

- Never discard uncommitted changes — warn and stop if working tree is dirty
- Always branch from the latest origin/main
- Main branch for this repo: `main`
