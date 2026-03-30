<script lang="ts">
  import { song, activeCell, playback, vkbd, pushUndo } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import { placeNoteBar, removeNoteFromStep, trigHasNote } from '../stepActions.ts'
  import { NOTE_NAMES, SCALE_TEMPLATES } from '../constants.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const ph = $derived(activeCell(trackId))

  // ── Scale note mapping ──
  const ROWS = 6
  const COLS = 7
  const root = $derived(song.rootNote)
  const scale = $derived(SCALE_TEMPLATES[root])

  // ── Root note picker ──
  let rootPickerOpen = $state(false)
  const rootLabel = $derived(NOTE_NAMES[root])

  function setRoot(n: number) {
    pushUndo('Change root note')
    song.rootNote = n
    rootPickerOpen = false
  }

  // Build MIDI notes for each pad: 7 cols × 6 rows, bottom-left = lowest
  // vkbd.octave=4 → base octave 2 → C2..B7 (6 octaves centered around C4-C5)
  const padNotes = $derived.by(() => {
    const baseOctave = vkbd.octave - 2
    const baseMidi = (baseOctave + 1) * 12 + root
    const notes: number[][] = []
    for (let row = 0; row < ROWS; row++) {
      const rowNotes: number[] = []
      for (let col = 0; col < COLS; col++) {
        rowNotes.push(baseMidi + row * 12 + scale[col])
      }
      notes.push(rowNotes)
    }
    return notes
  })

  // ── Step selection ──
  let selectedStep = $state(0)

  function isNoteActive(note: number): boolean {
    const trigs = ph.trigs
    if (selectedStep >= trigs.length) return false
    const trig = trigs[selectedStep]
    if (!trig.active) return false
    return trigHasNote(trig, note)
  }

  function stepHasNotes(stepIdx: number): boolean {
    const trigs = ph.trigs
    if (stepIdx >= trigs.length) return false
    return trigs[stepIdx].active
  }

  // ── Pad interaction ──
  function toggleNote(note: number) {
    if (selectedStep >= ph.trigs.length) return
    if (isNoteActive(note)) {
      removeNoteFromStep(trackId, selectedStep, note)
    } else {
      placeNoteBar(trackId, selectedStep, note, 1)
    }
  }

  // ── Octave shift ──
  function shiftOctave(dir: 1 | -1) {
    const next = vkbd.octave + dir
    if (next < 2 || next > 7) return
    vkbd.octave = next
  }

  // ── Playhead ──
  const playheadStep = $derived.by(() => {
    if (!isViewingPlayingPattern()) return -1
    return playback.playheads[trackId] ?? -1
  })

  function noteName(midi: number): string {
    const pc = midi % 12
    const oct = Math.floor(midi / 12) - 1
    return `${NOTE_NAMES[pc]}${oct}`
  }

  // Just the note letter (no octave) for non-root display
  function notePC(midi: number): string {
    return NOTE_NAMES[midi % 12]
  }

  function isRoot(midi: number): boolean {
    return midi % 12 === root
  }

  const stepsArray = $derived(Array.from({ length: ph.steps }, (_, i) => i))
</script>

<div class="pad-grid-wrap">
  <div class="pad-area">
    <!-- Pad grid -->
    <div class="pad-grid-inner">
      {#each { length: ROWS } as _, rowIdx}
        {@const row = ROWS - 1 - rowIdx}
        {#each { length: COLS } as _, col}
          {@const midi = padNotes[row]?.[col] ?? 0}
          {@const active = isNoteActive(midi)}
          {@const isRootNote = isRoot(midi)}
          <button
            class="pad flip-host"
            class:root={isRootNote}
            class:row-even={row % 2 === 0}
            onpointerdown={() => toggleNote(midi)}
          >
            <span class="flip-card" class:flipped={active}>
              <span class="flip-face pad-off" class:row-even={row % 2 === 0} class:root={isRootNote}>
                <span class="pad-label">{isRootNote ? noteName(midi) : notePC(midi)}</span>
              </span>
              <span class="flip-face back pad-on">
                <span class="pad-label">{isRootNote ? noteName(midi) : notePC(midi)}</span>
              </span>
            </span>
          </button>
        {/each}
      {/each}
    </div>

    <!-- Octave shift buttons (column 3) -->
    <div class="oct-btns">
      <button class="oct-btn" aria-label="Octave up" onpointerdown={() => shiftOctave(1)}><span class="btn-label">▲</span></button>
      <button class="oct-btn" aria-label="Octave down" onpointerdown={() => shiftOctave(-1)}><span class="btn-label">▼</span></button>
    </div>
  </div>

  <!-- Step ribbon with root note picker -->
  <div class="step-ribbon">
    <button class="root-btn" class:open={rootPickerOpen} onpointerdown={() => { rootPickerOpen = !rootPickerOpen }}>
      <span class="root-num">{rootLabel}</span>
    </button>
    {#each stepsArray as stepIdx}
      {@const hasNotes = stepHasNotes(stepIdx)}
      {@const isSelected = stepIdx === selectedStep}
      {@const isPlayhead = playheadStep === stepIdx}
      <button
        class="step-dot flip-host"
        class:playhead={isPlayhead}
        onpointerdown={() => { selectedStep = stepIdx }}
      >
        <span class="flip-card" class:flipped={isSelected}>
          <span class="flip-face step-off" class:has-notes={hasNotes}><span class="dot-num">{stepIdx + 1}</span></span>
          <span class="flip-face back step-on"><span class="dot-num">{stepIdx + 1}</span></span>
        </span>
      </button>
    {/each}
  </div>

  <!-- Root note picker overlay -->
  {#if rootPickerOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="root-picker-backdrop" onpointerdown={() => { rootPickerOpen = false }}></div>
    <div class="root-picker">
      {#each NOTE_NAMES as name, i}
        <button
          class="root-option"
          class:current={i === root}
          onpointerdown={() => setRoot(i)}
        >{name}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pad-grid-wrap {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 8px;
    gap: 4px;
  }

  /* ── Pad area: grid + octave buttons ── */
  .pad-area {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 36px;
    gap: 4px;
    min-height: 0;
  }

  /* ── Root note button (in step ribbon) ── */
  .root-btn {
    flex: 0 0 auto;
    width: 44px;
    height: 36px;
    border: 1.5px solid var(--color-salmon);
    border-radius: 0;
    background: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    padding: 0;
  }
  .root-btn.open {
    background: var(--salmon-bg);
  }
  .root-num {
    font-family: var(--font-display);
    font-size: 16px;
    line-height: 1;
    color: var(--color-salmon);
    pointer-events: none;
  }

  /* ── Root note picker overlay ── */
  .root-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .root-picker {
    position: absolute;
    bottom: 52px;
    left: 8px;
    z-index: 61;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 8px;
    background: var(--color-bg);
    border: 1.5px solid var(--lz-step-border);
  }
  .root-option {
    border: 1.5px solid var(--lz-step-border);
    border-radius: 0;
    background: var(--color-bg);
    color: var(--color-fg);
    padding: 12px 8px;
    font-family: var(--font-display);
    font-size: 14px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .root-option.current {
    border-color: var(--color-salmon);
    background: var(--salmon-bg);
    color: var(--color-salmon);
  }

  /* ── Pad grid (column 2) ── */
  .pad-grid-inner {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: repeat(6, 1fr);
    gap: 4px;
    min-height: 0;
  }

  .pad {
    position: relative;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    min-height: 0;
    padding: 0;
    perspective: 120px;
  }

  .pad :global(.flip-card) {
    position: absolute;
    inset: 0;
  }

  /* ── Off face (idle) ── */
  .pad-off {
    background: var(--color-bg);
    border: 1.5px solid var(--lz-step-border);
  }
  .pad-off .pad-label {
    font-family: var(--font-display);
    font-size: 14px;
    line-height: 1;
    color: var(--color-fg);
    opacity: 0.3;
    pointer-events: none;
  }

  /* Root note: stronger label, same border */
  .pad-off.root .pad-label {
    opacity: 0.5;
    font-size: 16px;
  }

  /* Alternating row tint */
  .pad-off.row-even {
    background: var(--lz-bg-active);
  }

  /* ── On face (active) ── */
  .pad-on {
    background: var(--color-olive);
    border: 1.5px solid var(--color-olive);
  }
  .pad-on .pad-label {
    font-family: var(--font-display);
    font-size: 14px;
    line-height: 1;
    color: var(--color-bg);
    opacity: 0.5;
    pointer-events: none;
  }

  /* ── Octave shift buttons (column 3) ── */
  .oct-btns {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .oct-btn {
    flex: 1;
    border: 1.5px solid var(--lz-step-border);
    border-radius: 0;
    background: var(--color-bg);
    font-size: var(--fs-md);
    cursor: pointer;
    touch-action: manipulation;
    padding: 0;
  }
  .oct-btn .btn-label {
    color: var(--color-fg);
    opacity: 0.3;
  }

  .oct-btn:active {
    background: var(--lz-bg-press);
  }

  /* ── Step ribbon ── */
  .step-ribbon {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    flex-shrink: 0;
    margin-left: 0;
  }

  .step-dot {
    flex: 0 0 auto;
    position: relative;
    width: 32px;
    height: 36px;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    padding: 0;
    perspective: 120px;
  }

  .step-dot :global(.flip-card) {
    position: absolute;
    inset: 0;
  }

  .dot-num {
    font-family: var(--font-display);
    font-size: 14px;
    line-height: 1;
    pointer-events: none;
  }

  /* ── Off face ── */
  .step-off {
    background: var(--color-bg);
    border: 1.5px solid var(--lz-step-border);
  }
  .step-off .dot-num {
    color: var(--color-fg);
    opacity: 0.3;
  }
  .step-off.has-notes {
    background: var(--olive-bg-subtle);
  }
  .step-off.has-notes .dot-num {
    color: var(--color-olive);
    opacity: 1;
  }

  /* ── On face (selected) ── */
  .step-on {
    background: var(--color-olive);
    border: 1.5px solid var(--color-olive);
  }
  .step-on .dot-num {
    color: var(--color-bg);
    opacity: 0.5;
  }

  .step-dot.playhead .step-off {
    border-color: var(--color-blue);
  }
</style>
