/** Built-in stamp definitions (ADR 119) */

export type StampAnimation = 'melt' | 'moon' | 'sun' | 'heartbeat' | 'flame' | 'ghost' | 'none'
export type StampParticles = 'stars' | 'birds'

export interface StampDef {
  /** SVG content (inside viewBox 0 0 24 24) */
  svg: string
  name: string
  nameJa: string
  /** Stamp color */
  color: string
  /** CSS animation class applied during playback */
  animation: StampAnimation
  /** Optional particle effect during playback */
  particles?: StampParticles
}

/**
 * Stamp library — pictogram-style characters and expressive objects.
 * Each stamp has a fixed personality (color + animation + ambient).
 */
export const STAMP_LIBRARY: Record<string, StampDef> = {
  smiley: {
    svg: '<circle cx="12" cy="12" r="9.5"/><circle cx="8.5" cy="9.5" r="1.8" fill="var(--color-fg)" stroke="none"/><circle cx="15.5" cy="9.5" r="1.8" fill="var(--color-fg)" stroke="none"/><path d="M7 14.5Q9.5 18.5 12 18.5Q14.5 18.5 17 14.5" stroke="var(--color-fg)" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    name: 'Smiley',
    nameJa: 'スマイリー',
    color: '#d4a72c',
    animation: 'melt',
  },
  moon: {
    svg: '<path d="M20 12.79A8.5 8.5 0 1 1 11.71 3.5 6.5 6.5 0 0 0 20 12.79Z"/>',
    name: 'Moon',
    nameJa: '月',
    color: '#4472B4',
    animation: 'moon',
    particles: 'stars',
  },
  sun: {
    svg: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5m0 14v2.5M5.1 5.1l1.8 1.8m10.2 10.2 1.8 1.8M2.5 12H5m14 0h2.5M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    name: 'Sun',
    nameJa: '太陽',
    color: '#d48c2a',
    animation: 'sun',
    particles: 'birds',
  },
  heart: {
    svg: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/>',
    name: 'Heart',
    nameJa: 'ハート',
    color: '#c45a5a',
    animation: 'heartbeat',
  },
  flame: {
    svg: '<path d="M12 22c-4 0-6-2.5-6-5.5 0-2.5 1.8-4.8 3.2-6.7.4 1.8 1.8 2.7 1.8 2.7s-.4-3.5 1.8-6.2c.9 1.8 1.3 3 1.3 3s.9-1.8 2.2-2.7c-.4 2.2 0 3.5.9 4.8.9 1.3 1.3 2.7 1.3 4.5C18.5 19.5 16 22 12 22Z"/>',
    name: 'Flame',
    nameJa: '炎',
    color: '#d46a2a',
    animation: 'flame',
  },
  ghost: {
    svg: '<path d="M12 3C8.5 3 6 6 6 9v10l1.8-1.8 1.8 1.8 1.8-1.8L12 19l.6-1.8 1.8 1.8 1.8-1.8L18 19V9c0-3-2.5-6-6-6Zm-2 7.5a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z"/>',
    name: 'Ghost',
    nameJa: 'おばけ',
    color: '#7a7a9a',
    animation: 'ghost',
  },
}

/** Ordered list of stamp IDs for the picker UI */
export const STAMP_IDS = Object.keys(STAMP_LIBRARY)
