<script lang="ts">
  import { engine } from '../audio/engine.ts'
  import { song, ui, ensureCells } from '../state.svelte.ts'
  import { addTrack } from '../stepActions.ts'
  import { NOTE_NAMES } from '../constants.ts'

  const {
    trackId,
    mode = 'slice',
    rootNote = 60,
    octave = 4,
    playingPads = new Set<number>(),
    onensureengine,
    onpadtap,
  }: {
    trackId: number
    mode: 'track' | 'slice' | 'note'
    rootNote?: number
    octave?: number
    playingPads?: Set<number>
    onensureengine?: () => Promise<void>
    onpadtap?: (padIndex: number, note: number) => void
  } = $props()

  const padCount = 16

  let activePad: number | null = $state(null)

  // TRACK mode: map pad index to pattern cells (existing tracks)
  const patCells = $derived(song.patterns[ui.currentPattern]?.cells ?? [])

  // NOTE mode: base MIDI note from octave (C of that octave)
  const noteBase = $derived((octave + 1) * 12)

  function noteName(midi: number): string {
    const pc = midi % 12
    const oct = Math.floor(midi / 12) - 1
    return `${NOTE_NAMES[pc]}${oct}`
  }

  async function padDown(index: number, e: PointerEvent) {
    if (mode === 'track') {
      const cell = patCells[index]
      if (cell) {
        ensureCells(song.patterns[ui.currentPattern])
        ui.selectedTrack = cell.trackId
      } else {
        const newId = addTrack()
        if (newId != null) ui.selectedTrack = newId
      }
      return
    }

    await onensureengine?.()
    activePad = index
    const vel = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.8

    if (mode === 'slice') {
      const note = rootNote + index
      engine.triggerNote(trackId, note, vel)
      onpadtap?.(index, note)
    } else {
      // NOTE mode
      const note = noteBase + index
      engine.triggerNote(trackId, note, vel)
      onpadtap?.(index, note)
    }
  }

  function padUp() {
    if (mode === 'track') return
    if (activePad != null) {
      engine.releaseNote(trackId)
      activePad = null
    }
  }

  function padLabel(index: number): string {
    if (mode === 'track') {
      const cell = patCells[index]
      if (!cell) return `TR${index + 1}`
      return cell.name || `TR${index + 1}`
    }
    if (mode === 'slice') {
      return String(index + 1)
    }
    // NOTE mode
    return noteName(noteBase + index)
  }

  function isActive(index: number): boolean {
    if (mode === 'track') {
      const cell = patCells[index]
      return cell != null && cell.trackId === trackId
    }
    return activePad === index
  }

  function isPlaying(index: number): boolean {
    return playingPads.has(index)
  }

  function isEmpty(index: number): boolean {
    if (mode === 'track') return patCells[index] == null
    return false
  }

  // MPC-style bottom-left origin: pad 1 (index 0) at bottom-left
  // CSS grid goes top-to-bottom, so reverse row order
  // Visual pos 0 (top-left) → logical 12, pos 15 (bottom-right) → logical 3
  function visualToLogical(vis: number): number {
    const row = Math.floor(vis / 4)     // 0=top, 3=bottom
    const col = vis % 4
    return (3 - row) * 4 + col          // flip rows
  }
</script>

<div class="pads-wrap">
<div class="pads-grid">
  {#each Array(padCount) as _, vis}
    {@const idx = visualToLogical(vis)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pad"
      class:active={isActive(idx)}
      class:playing={isPlaying(idx)}
      class:empty={isEmpty(idx)}
      class:track-mode={mode === 'track'}
      onpointerdown={e => padDown(idx, e)}
      onpointerup={padUp}
      onpointerleave={padUp}
      onpointercancel={padUp}
    >
      <span class="pad-label">{padLabel(idx)}</span>
    </div>
  {/each}
</div>
</div>

<style>
  .pads-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  .pads-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 2px;
    touch-action: none;
    user-select: none;
    flex: 1;
    min-height: 0;
  }

  .pad {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    border: 1px solid var(--lz-step-border);
    cursor: pointer;
    transition: background 60ms;
    overflow: hidden;
  }

  .pad:hover {
    border-color: var(--lz-text-hint);
  }

  .pad.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }

  .pad.active .pad-label {
    color: var(--color-bg);
    opacity: 0.8;
  }

  .pad.playing {
    animation: ph-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  .pad.empty .pad-label {
    opacity: 0.2;
  }

  .pad-label {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.4;
    pointer-events: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    padding: 0 2px;
  }

  /* Track mode: slightly larger label for instrument names */
  .pad.track-mode .pad-label {
    font-size: 9px;
    opacity: 0.6;
  }
</style>
