// SVG inner content (paths/shapes only).
// Wrap at use site: <svg viewBox="..." ...>{@html ICON.name}</svg>
// Most icons use viewBox="0 0 14 14" unless noted.

export const ICON = {
  // ── Scene function node icons (viewBox 0 0 14 14) ──

  transpose: `<rect x="3" y="2" width="5" height="1.5" rx="0.5"/><rect x="3" y="2" width="1.5" height="8"/>`
    + `<circle cx="3.5" cy="11" r="2"/><rect x="6.5" y="2" width="1.5" height="6.5"/><circle cx="7.5" cy="9.5" r="2"/>`,

  tempo: `<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>`
    + `<line x1="7" y1="7" x2="7" y2="3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
    + `<line x1="7" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
    + `<circle cx="7" cy="7" r="0.7" fill="currentColor"/>`,

  repeat: `<path d="M11 5.5A4.5 4.5 0 0 0 3.5 4"/><path d="M3 8.5A4.5 4.5 0 0 0 10.5 10"/>`
    + `<polyline points="3.5,1.5 3.5,4.5 6.5,4.5"/><polyline points="10.5,12.5 10.5,9.5 7.5,9.5"/>`,

  probability: `<rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>`
    + `<circle cx="4" cy="10" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="10" cy="4" r="1.3" fill="currentColor"/>`,

  fx: `<path d="M1 5 Q3.5 3 7 5 Q10.5 7 13 5"/><path d="M1 9 Q3.5 7 7 9 Q10.5 11 13 9"/>`,

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
} as const
