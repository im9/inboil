<script lang="ts">
  import { song, ui, cellForTrack, samplesByCell, sampleCellKey, pushUndo, playback, vkbd, prefs } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import SamplerWaveform from './SamplerWaveform.svelte'
  import SamplerPads from './SamplerPads.svelte'
  import StepGrid from './StepGrid.svelte'
  import PatternToolbar from './PatternToolbar.svelte'
  import { setTrigNote } from '../stepActions.ts'

  const {
    onRandom,
    onClose,
    onLoop,
  }: {
    onRandom: () => void
    onClose: () => void
    onLoop: () => void
  } = $props()

  const trackId = $derived(ui.selectedTrack)
  const cell = $derived(cellForTrack(song.patterns[ui.currentPattern], trackId))
  const isSampler = $derived(cell?.voiceId === 'Sampler')

  // Auto-switch pad mode when voice type changes
  $effect(() => {
    if (isSampler && ui.padMode === 'note') {
      ui.padMode = 'slice'
    } else if (!isSampler && ui.padMode === 'slice') {
      ui.padMode = 'note'
    }
  })

  const availableModes = $derived(
    isSampler
      ? (['track', 'slice', 'note'] as const)
      : (['track', 'note'] as const)
  )

  const currentSample = $derived(
    isSampler ? samplesByCell[sampleCellKey(trackId, ui.currentPattern)] : undefined
  )

  const startVal = $derived(cell?.voiceParams?.start ?? 0)
  const endVal = $derived(cell?.voiceParams?.end ?? 1)
  const chopVal = $derived(cell?.voiceParams?.chopSlices ?? 0)

  function onChangeStart(v: number) {
    if (!cell) return
    pushUndo('Change sample start')
    cell.voiceParams.start = v
  }

  function onChangeEnd(v: number) {
    if (!cell) return
    pushUndo('Change sample end')
    cell.voiceParams.end = v
  }

  const activeSlice = $derived.by(() => {
    if (!isSampler || chopVal <= 0 || !isViewingPlayingPattern()) return -1
    const head = playback.playheads[trackId]
    if (head == null) return -1
    const trig = cell?.trigs[head]
    if (!trig?.active) return -1
    const chopMode = cell?.voiceParams?.chopMode ?? 0
    if (chopMode === 0) {
      const rootNote = cell?.voiceParams?.rootNote ?? 60
      return (trig.note ?? 60) - rootNote
    }
    return head % chopVal
  })

  function onPadTap(_padIndex: number, note: number) {
    if (ui.selectedStep == null) return
    pushUndo('Set step note')
    setTrigNote(trackId, ui.selectedStep, note)
  }

  function shiftOctave(dir: 1 | -1) {
    const next = vkbd.octave + dir
    if (next < 2 || next > 7) return
    vkbd.octave = next
  }

  function toggleCanvas() {
    prefs.canvasCollapsed = !prefs.canvasCollapsed
  }

  // ── Measure pads column height → derive square pad width ──
  // Pads must be square, sized from available height, capped so grid has room for 16 steps
  let mainRowEl: HTMLDivElement | undefined = $state(undefined)
  let padSize = $state(200)
  // Vertical chrome: mode-switch(24) + canvas-toggle(18) + 3 gaps(12) + padding(8) = 62
  const PAD_CHROME = 62
  // StepGrid min width for step picker (20 cells): head(237) + 20×26(520) + mix(128) + padding(24) = 909
  const GRID_MIN_W = 909

  $effect(() => {
    if (!mainRowEl) return
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect
      const fromHeight = Math.floor(h - PAD_CHROME)
      // col-pads horizontal: padding(16) + border(1)
      const maxFromWidth = Math.floor(w - GRID_MIN_W - 17)
      padSize = Math.max(120, Math.min(fromHeight, maxFromWidth))
    })
    ro.observe(mainRowEl)
    return () => ro.disconnect()
  })
</script>

<div class="grid-view">
  <PatternToolbar {onRandom} {onClose} {onLoop} />

  <!-- Track Canvas (collapsible) -->
  {#if !prefs.canvasCollapsed}
    <div class="track-canvas">
      <SamplerWaveform
        sample={isSampler ? currentSample : undefined}
        start={startVal}
        end={endVal}
        chopSlices={isSampler ? chopVal : 0}
        activeSlice={isSampler ? activeSlice : -1}
        onchangestart={isSampler ? onChangeStart : undefined}
        onchangeend={isSampler ? onChangeEnd : undefined}
      />
    </div>
  {/if}

  <!-- Main area: Pads (left) + StepGrid (right) -->
  <div class="main-row" bind:this={mainRowEl}>
    <div class="col-pads" style="width: {padSize}px">
      <div class="mode-switch">
        {#each availableModes as m}
          <button
            class="mode-btn"
            class:active={ui.padMode === m}
            onpointerdown={() => { ui.padMode = m }}
          >{m.toUpperCase()}</button>
        {/each}
        {#if ui.padMode === 'note'}
          <span class="oct-label">OCT</span>
          <button class="oct-btn" onpointerdown={() => shiftOctave(1)}>▲</button>
          <button class="oct-btn" onpointerdown={() => shiftOctave(-1)}>▼</button>
          <span class="oct-val">{vkbd.octave}</span>
        {/if}
      </div>
      <div class="pads-area">
        <SamplerPads
          trackId={trackId}
          mode={ui.padMode}
          rootNote={cell?.voiceParams?.rootNote ?? 60}
          activeSlice={activeSlice}
          octave={vkbd.octave}
          onpadtap={onPadTap}
        />
      </div>
      <button class="canvas-toggle" onpointerdown={toggleCanvas}
        data-tip={prefs.canvasCollapsed ? 'Show track canvas' : 'Hide track canvas'}
        data-tip-ja={prefs.canvasCollapsed ? 'トラックキャンバスを表示' : 'トラックキャンバスを非表示'}
      >{prefs.canvasCollapsed ? '▼ CANVAS' : '▲ CANVAS'}</button>
    </div>
    <div class="col-grid">
      <StepGrid />
    </div>
  </div>
</div>

<style>
  .grid-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Track Canvas — fixed 120px ── */
  .track-canvas {
    flex: 0 0 200px;
    padding: 0 12px;
    overflow: hidden;
  }

  /* ── Main row ── */
  .main-row {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Pads column — width set via JS (square pad sizing) ── */
  .col-pads {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 8px;
    border-right: 1px solid var(--lz-border-subtle);
    overflow: hidden;
  }

  .pads-area {
    flex-shrink: 0;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }

  /* ── StepGrid column — takes remaining space ── */
  .col-grid {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Mode switch (olive tier) ── */
  .mode-switch {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    height: 24px;
  }

  .mode-btn {
    border: 1.5px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .mode-btn.active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── Canvas toggle ── */
  .canvas-toggle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lz-border-mid);
    border-radius: 0;
    background: transparent;
    color: var(--lz-text-hint);
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    height: 18px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .canvas-toggle:hover {
    color: var(--color-fg);
    border-color: var(--color-olive);
  }

  /* ── Octave controls ── */
  .oct-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lz-text-hint);
    margin-left: 8px;
  }

  .oct-btn {
    border: 1.5px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    color: var(--color-olive);
    font-size: 10px;
    width: 20px;
    height: 20px;
    padding: 0;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .oct-btn:active {
    background: var(--olive-bg-subtle);
  }

  .oct-val {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-olive);
    min-width: 12px;
    text-align: center;
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .main-row {
      flex-direction: column;
    }
    .col-pads {
      flex-shrink: 0;
      border-right: none;
      border-bottom: 1px solid var(--lz-border-subtle);
      flex-direction: row;
      gap: 8px;
      width: 100% !important;
    }
    .pads-area {
      height: 160px !important;
      width: 160px !important;
    }
  }
</style>
