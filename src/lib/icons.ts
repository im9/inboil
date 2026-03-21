// SVG inner content (paths/shapes only).
// Wrap at use site: <svg viewBox="..." ...>{@html ICON.name}</svg>
// Most icons use viewBox="0 0 14 14" unless noted.

export const ICON = {
  // ── Scene function node icons (viewBox 0 0 14 14) ──

  /** Musical note with up/down arrow — transpose (ADR 110) */
  transpose: `<circle cx="4.5" cy="10.5" r="2.2" fill="currentColor"/><rect x="6.2" y="3" width="1.4" height="7.5" fill="currentColor"/>`
    + `<path d="M10.5 2 L12.5 4.5 H11 V8.5 H12.5 L10.5 11 L8.5 8.5 H10 V4.5 H8.5 Z" fill="currentColor" opacity="0.7"/>`,

  /** Metronome — tempo (ADR 110). Body is the trapezoid (filled), needle is the line */
  tempo: `<path d="M4.5 13 H9.5 L8.5 4 H5.5 Z" fill="currentColor" opacity="0.25"/>`
    + `<path d="M4.5 13 H9.5 L8.5 4 H5.5 Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`
    + `<line class="metronome-needle" x1="7" y1="12" x2="5" y2="2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`
    + `<circle cx="7" cy="12" r="1" fill="currentColor"/>`,

  /** Circular arrows — repeat */
  repeat: `<path d="M11 5.5A4.5 4.5 0 0 0 3.5 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
    + `<path d="M3 8.5A4.5 4.5 0 0 0 10.5 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
    + `<polyline points="3.5,1.5 3.5,4.5 6.5,4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<polyline points="10.5,12.5 10.5,9.5 7.5,9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,

  probability: `<rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>`
    + `<circle cx="4" cy="10" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="10" cy="4" r="1.3" fill="currentColor"/>`,

  /** 4-point sparkle — FX (ADR 110) */
  fx: `<path d="M7 0.5 L8 5.5 L13 7 L8 8.5 L7 13.5 L6 8.5 L1 7 L6 5.5 Z" fill="currentColor"/>`
    + `<path d="M11.5 1.5 L12 3 L13.5 3.5 L12 4 L11.5 5.5 L11 4 L9.5 3.5 L11 3 Z" fill="currentColor" opacity="0.5"/>`,

  automation: `<polyline points="1,12 4,10 7,4 10,6 13,2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<circle cx="4" cy="10" r="1.2" fill="currentColor"/><circle cx="7" cy="4" r="1.2" fill="currentColor"/><circle cx="10" cy="6" r="1.2" fill="currentColor"/>`,

  label: `<text x="7" y="11" text-anchor="middle" font-family="serif" font-size="12" font-weight="700">T</text>`,

  // ── Scene controls (viewBox 0 0 16 16) ──

  /** viewBox 0 0 16 16 */
  solo: `<path d="M12.5 6A4.5 4.5 0 0 0 4.5 4.5"/>`
    + `<path d="M3.5 10A4.5 4.5 0 0 0 11.5 11.5"/>`
    + `<polyline points="4.5,2 4.5,5 7.5,5"/><polyline points="11.5,14 11.5,11 8.5,11"/>`,

  /** viewBox 0 0 16 16 */
  autoLayout: `<path d="M2 4h12M2 8h8M2 12h10"/>`,

  /** viewBox 0 0 16 16 */
  focusRoot: `<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/>`
    + `<line x1="8" y1="0.5" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15.5"/>`
    + `<line x1="0.5" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15.5" y2="8"/>`,

  // ── PatternToolbar (viewBox 0 0 24 16) ──

  /** viewBox 0 0 24 16 */
  keyboard: `<rect x="1" y="1" width="22" height="14" rx="1.5"/>`
    + `<line x1="5.5" y1="1" x2="5.5" y2="9"/><line x1="9.5" y1="1" x2="9.5" y2="9"/>`
    + `<line x1="14.5" y1="1" x2="14.5" y2="9"/><line x1="18.5" y1="1" x2="18.5" y2="9"/>`
    + `<line x1="12" y1="1" x2="12" y2="15"/>`,
  // ── Dock toggle (viewBox 0 0 16 16) ──

  /** viewBox 0 0 16 16 – sidebar-right panel (expand) */
  sidebarRight: `<rect x="1" y="2" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>`
    + `<line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" stroke-width="1.3"/>`,

  // ── Piano Roll brush modes (viewBox 0 0 14 14) ──

  /** Pen / draw mode — scaled from Pencil.svg 512×512 (fill-rule evenodd, widened cutouts) */
  pen: `<path fill-rule="evenodd" d="`
    + `M13.8 2.4L11.5 0.2 1.3 9.3 0 13.3 4.6 12.8 13.8 3.1z`
    + `M1.5 13.1L0.9 12.1 1.7 9.5 3.5 10.5 4.3 12.3z`
    + `M12.8 2.5L4.6 10.7 3.4 9.5 11.6 1.3z`
    + `" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>`,

  /** Eraser mode — scaled from Eraser.svg 1000×1000 (fill-rule evenodd, widened cutouts) */
  eraser: `<path fill-rule="evenodd" d="`
    + `M7.5 11L7.7 11.2 13 5.8 8.6 1.3 3.2 6.7 3.4 6.9 1.8 8.5 1.8 10 4.4 12.6H10.6V12H6.4z`
    + `M8.8 2.5L12 5.8 7.5 10 4.2 6.7z`
    + `M5.6 12H4.6L2.4 9.7 2.4 9 4 7.5 7 10.4z`
    + `" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>`,

  /** Chord brush — stacked notes (three horizontal bars) */
  chord: `<rect x="2" y="2" width="10" height="2.5" rx="1" fill="currentColor"/>`
    + `<rect x="2" y="5.8" width="10" height="2.5" rx="1" fill="currentColor"/>`
    + `<rect x="2" y="9.5" width="10" height="2.5" rx="1" fill="currentColor"/>`,

  /** Strum brush — staggered chord notes (diagonal stair pattern) */
  strum: `<rect x="1" y="2" width="6" height="2" rx="0.8" fill="currentColor"/>`
    + `<rect x="4" y="5.5" width="6" height="2" rx="0.8" fill="currentColor"/>`
    + `<rect x="7" y="9" width="6" height="2" rx="0.8" fill="currentColor"/>`,

  /** Select / marquee — dashed rectangle (viewBox 0 0 14 14) */
  select: `<rect x="2" y="2" width="10" height="10" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5"/>`,

  /** Sparkle / generative — 4-point star (viewBox 0 0 14 14) */
  sparkle: `<path d="M7 0.5L8.2 5.2 13 6.5 8.2 7.8 7 12.5 5.8 7.8 1 6.5 5.8 5.2Z" fill="currentColor"/>`
    + `<path d="M11.5 1L12 3 13.5 3.5 12 4 11.5 6 11 4 9.5 3.5 11 3Z" fill="currentColor" opacity="0.6"/>`,

  /** viewBox 0 0 16 16 – sidebar-right panel with chevron (collapse) */
  sidebarRightClose: `<rect x="1" y="2" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>`
    + `<line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" stroke-width="1.3"/>`
    + `<polyline points="6,6.5 8,8 6,9.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`,
} as const
