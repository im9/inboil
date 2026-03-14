# ADR 071: Donate Feature

## Status: Implemented

## Context

The authentication-based paid/demo split (ADR 061) was abandoned, and the app will be released completely free. However, this eliminated any revenue stream to sustain development.

As a minimal measure, provide a voluntary donation path. No feature gating whatsoever.

## Decision

### Platform

**Ko-fi** as the primary donation platform (external link).

- Zero in-app payment flow — links to external site
- Zero bundle size impact (link only)
- Ko-fi charges 0% platform fee on tips (only Stripe/PayPal processing fees apply)
- Direct Stripe/PayPal integration rejected due to operational overhead

### Suggested Amounts

**$5 / $10 / $25** — configured on the Ko-fi donation panel.

- $5: casual "buy me a coffee" tier
- $10: moderate support
- $25: committed supporter
- Avoids sub-$3 amounts where payment processor fees eat most of the donation
- Reference: Ardour ($1–$50/mo subscription), Vital ($25 Plus / $80 Pro), Processing ($25/$50/$100 donation)

### UI Placement

Bottom of the Sidebar SYSTEM panel, near the footer.

```
┌─────────────────────────┐
│ SYSTEM                  │
│                         │
│ [NEW PROJECT] [SAVE AS] │
│ project list ...        │
│ settings ...            │
│                         │
│─────────────────────────│
│ ♡ SUPPORT THIS PROJECT  │  ← text link or small button
│ inboil v0.1.0 — © 2026  │
│ Factory reset           │
└─────────────────────────┘
```

- Subtle but visible (smaller than primary buttons, larger than footer text)
- `♡ SUPPORT THIS PROJECT` / `♡ このプロジェクトを応援` (bilingual)
- Opens external link in new tab (`target="_blank" rel="noopener"`)
- Does not interfere with performance or composition workflow

### Implementation

```svelte
<a
  class="donate-link"
  href="https://ko-fi.com/YOUR_USERNAME"
  target="_blank"
  rel="noopener"
>
  ♡ {L === 'ja' ? 'このプロジェクトを応援' : 'SUPPORT THIS PROJECT'}
</a>
```

CSS:
- Font size: 10px (same as footer)
- Color: `var(--olive)` accent
- Hover: underline + brightness increase
- No excessive decoration (animations, badges, etc.)

### Out of Scope

- In-app payment / Stripe integration
- Donor-exclusive features or badges
- Popup / modal donation prompts
- Startup or mid-session donation reminders

## Considerations

- **Platform choice**: Ko-fi has 0% platform fee and easy setup. GitHub Sponsors appeals to developer communities but requires bank account verification. Both can coexist, but a single link reduces noise
- **Subtlety**: An overly prominent donation link harms the app's impression. Inside the SYSTEM panel keeps it out of the main workflow
- **Future Patreon etc.**: If monthly supporters grow, the link can be swapped to a dedicated Thanks page

## Future Extensions

### Desktop: Donation Dialog (Sublime Text Model)

When distributing a desktop version via Tauri/Electron, show a periodic donation dialog.

- **Triggers**: every N launches, on project save, after export, etc.
- **Behavior**: dismiss to close immediately. No feature restrictions. Ignore forever and use for free
- **Frequency control**: store last-shown date in localStorage; suppress for 7–14 days
- **Tone**: gratitude + donation link. "If you enjoy this app, consider supporting its development"
- Proven model: Sublime Text / WinRAR — full features free, occasional gentle ask

### Other

- Donor acknowledgment (handled on Ko-fi side, not in-app)
- Migration to Open Collective for organizational donations
- Add donation link to in-app About page (when ABOUT section is reintroduced in Help)
