# ADR 061: Authentication

## Status: Proposed

## Context

Cloud persistence (ADR 020) requires user identity to scope data in Cloudflare Workers KV. Without authentication, anyone could read/write any user's projects. The auth system also enables a demo/full mode split — unauthenticated users get a local-only demo experience.

## Proposed Design

### A. Auth Provider

**OAuth 2.0 / OpenID Connect** via Google and Apple:

| Provider | Why |
|----------|-----|
| Google | Largest user base, well-documented, free |
| Apple | Required for iOS (future), privacy-focused users |

No email/password auth — reduces security surface and maintenance burden.

### B. Auth Flow

```
Browser                    Cloudflare Worker           Google/Apple
  │                              │                         │
  ├─ GET /auth/login?provider= ──►                         │
  │                              ├─ redirect ──────────────►
  │                              │                         │
  │◄──────────────────────────── redirect with code ◄──────┤
  │                              │                         │
  ├─ GET /auth/callback?code= ──►                         │
  │                              ├─ exchange code ─────────►
  │                              │◄─ id_token + profile ───┤
  │                              │                         │
  │                              ├─ Create/lookup user     │
  │                              ├─ Issue session JWT      │
  │◄──── Set-Cookie (httpOnly) ──┤                         │
  │      + return user profile   │                         │
```

### C. Session Management

- **JWT stored in httpOnly cookie** — not accessible to JS, immune to XSS
- **Token lifetime:** 30 days, refreshed on each API call
- **Worker validates JWT** on every `/api/*` request
- **JWT payload:** `{ uid, email, name, provider, iat, exp }`
- **Signing:** HMAC-SHA256 with secret stored in Worker environment variable

### D. User Storage

Minimal user record in KV (no separate database needed):

```
Key:   "auth:user:{uid}"
Value: { uid, email, name, avatar, provider, createdAt, lastLoginAt }
```

- `uid`: deterministic hash of `provider:providerId` (e.g., `google:123456`)
- No sensitive data stored — profile info only

### E. Demo Mode vs Authenticated Mode

| Feature | Demo (no login) | Authenticated |
|---------|-----------------|---------------|
| Pattern editing | Full | Full |
| Local save (IndexedDB) | Full | Full |
| Project slots | 1 | Unlimited |
| Cloud sync | No | Yes |
| Export/Import (file) | Yes | Yes |
| Factory presets | Yes | Yes |

Demo mode is fully functional for casual use — login unlocks cloud sync and multiple projects.

### F. UI Integration

- **Login button** in Settings panel or AppHeader (unobtrusive)
- **User avatar** shown when logged in (replaces login button)
- **No login wall** — app loads directly into demo mode
- **Login prompt** shown only when user tries a cloud feature (e.g., "Sync to Cloud")

### G. Cloudflare Worker Auth Endpoints

```
GET  /auth/login?provider=google|apple   ← Initiate OAuth flow
GET  /auth/callback                      ← OAuth callback, sets cookie
POST /auth/logout                        ← Clear session cookie
GET  /auth/me                            ← Current user profile (or 401)
```

### H. Security Considerations

- **CSRF:** SameSite=Strict cookie + Origin header check
- **XSS:** JWT in httpOnly cookie, never exposed to JS
- **Open redirect:** Whitelist callback URLs
- **Rate limiting:** Cloudflare Worker built-in rate limiting on auth endpoints
- **Secret rotation:** JWT signing key rotatable via Worker env vars

## Implementation Order

1. Cloudflare Worker project setup (`workers/` directory)
2. Google OAuth integration (login + callback + JWT issuance)
3. Apple OAuth integration
4. `/auth/me` endpoint + frontend auth state (`$state` rune)
5. Demo/authenticated mode split in UI
6. Connect to cloud sync endpoints (ADR 020 step 9)

## Consequences

- **Positive:** Secure, standards-based auth with no password management
- **Positive:** No external auth service cost (Google/Apple OAuth is free)
- **Positive:** httpOnly cookie avoids token theft via XSS
- **Positive:** Demo mode keeps the app accessible without signup friction
- **Negative:** Two OAuth providers to maintain (API changes, key rotation)
- **Negative:** Apple OAuth has stricter requirements (paid developer account)
- **Dependency:** ADR 020 (Data Persistence) — cloud sync requires auth
