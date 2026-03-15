# ADR 098: Mobile Landscape Orientation

## Status: Proposed

## Context

ADR 095 (Mobile UI Redesign) shipped portrait-first layout with MobileTrackView as the primary view. Landscape orientation is not yet supported — the layout simply stretches vertically, wasting horizontal space and making the calculator grid awkward to use.

## Decision

Add landscape-specific layout for mobile using `orientation: landscape` media queries.

### Layout

```
┌─────────────┬──────────────────────────┐
│  Matrix /   │                          │
│  Track Nav  │   MobileTrackView (PO)   │
│             │                          │
├─────────────┤                          │
│  Transport  │                          │
└─────────────┴──────────────────────────┘
```

- Side-by-side: navigation/controls on the left, calculator grid on the right
- AppHeader collapses to minimal transport controls
- MobileMatrixView stacks vertically in left column
- Track navigation (voice bar, solo/mute) moves to left column

### Implementation

- `@media (orientation: landscape) and (max-height: 500px)` breakpoint
- CSS-only layout switch where possible; conditional rendering if needed
- Touch targets remain ≥ 44px
- Test on common phone landscape sizes (667×375, 812×375, 844×390)

## Considerations

- **Tablets**: Landscape tablets (≥768px width) use the desktop layout, not this mobile landscape layout
- **Keyboard avoidance**: BPM input may trigger virtual keyboard — ensure layout doesn't break
- **Scope**: Layout only — no new features beyond what ADR 095 provides
