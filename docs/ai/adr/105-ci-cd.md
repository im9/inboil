# ADR 105: CI/CD Pipeline

## Status: Proposed

## Context

The project has no automated CI/CD. All checks (`pnpm check`, `pnpm test`, `pnpm build`) run only when manually invoked. As the codebase grows (36K LOC, 260+ tests) and approaches beta, the risk of undetected regressions increases. A single developer cannot reliably remember to run all checks before every push.

## Decision

Add GitHub Actions CI that runs on push and PR to `main`.

### Pipeline Stages

```
push / PR to main
  ├─ 1. Install (pnpm install --frozen-lockfile)
  ├─ 2. Type check (pnpm check)          ~15s
  ├─ 3. Unit tests (pnpm test)           ~5s
  ├─ 4. Build (pnpm build)               ~10s
  └─ 5. Site build (cd site && pnpm build) ~10s
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runner** | `ubuntu-latest` | Free tier, fast cold start |
| **Node version** | 22 (LTS) | Matches local dev |
| **pnpm** | `pnpm/action-setup` | Already the project's package manager |
| **E2E in CI** | No (Phase 1) | Playwright needs browser install (~1min overhead), defer to Phase 2 |
| **Blocking** | Yes — PR merge requires all checks green | Prevents regressions from reaching main |
| **Cloudflare deploy** | No — keep manual (`pnpm deploy`) | Deployment is an intentional act, not automatic |
| **Site deploy** | No — keep manual (`pnpm deploy:site`) | Same rationale |

### Phase 2 (Future)

- E2E tests (Playwright) — add when test suite stabilizes and CI budget allows ~2min runs
- Lighthouse performance audit on site build
- Bundle size tracking (fail if dist exceeds threshold)
- Tauri desktop build on tag push (`v*`) — see ADR 073 Phase 2 for release workflow

## Consequences

- Every push is validated within ~40s
- Regressions caught before they compound
- Branch protection can enforce green CI before merge
- No deployment automation — deploy remains a conscious manual step
