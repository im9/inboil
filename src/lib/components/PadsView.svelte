<script lang="ts">
  import { song, ui, cellForTrack, samplesByCell, sampleCellKey, pushUndo, playback, vkbd } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import SamplerWaveform from './SamplerWaveform.svelte'
  import SamplerPads from './SamplerPads.svelte'
  import SamplerParams from './SamplerParams.svelte'
  import SamplerStepRow from './SamplerStepRow.svelte'
  import { setTrigNote } from '../stepActions.ts'

  const trackId = $derived(ui.selectedTrack)
  const cell = $derived(cellForTrack(song.patterns[ui.currentPattern], trackId))
  const isSampler = $derived(cell?.voiceId === 'Sampler')

  // Auto-switch pad mode when voice type changes
  // Only switch away from unavailable modes — TRACK is always valid
  $effect(() => {
    if (isSampler && ui.padMode === 'note') {
      ui.padMode = 'slice'
    } else if (!isSampler && ui.padMode === 'slice') {
      ui.padMode = 'note'
    }
  })

  // Available modes: TRACK always, SLICE sampler only, NOTE always
  const availableModes = $derived(
    isSampler
      ? (['track', 'slice', 'note'] as const)
      : (['track', 'note'] as const)
  )

  // Current sample data for waveform (sampler only)
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

  // Active slice index during playback (for highlight on pads + waveform)
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

  // Pad tap → write note into selected step (step input mode)
  function onPadTap(_padIndex: number, note: number) {
    if (ui.selectedStep == null) return
    pushUndo('Set step note')
    setTrigNote(trackId, ui.selectedStep, note)
  }

  // Octave controls for NOTE mode
  function shiftOctave(dir: 1 | -1) {
    const next = vkbd.octave + dir
    if (next < 2 || next > 7) return
    vkbd.octave = next
  }
</script>

<div class="pads-view">
  <!-- Waveform — always rendered (empty canvas when non-sampler) -->
  <SamplerWaveform
    sample={isSampler ? currentSample : undefined}
    start={startVal}
    end={endVal}
    chopSlices={isSampler ? chopVal : 0}
    activeSlice={isSampler ? activeSlice : -1}
    onchangestart={isSampler ? onChangeStart : undefined}
    onchangeend={isSampler ? onChangeEnd : undefined}
  />

  <!-- Pads + Steps/Params -->
  <div class="bottom-row">
    <div class="col-pads">
      <!-- Mode switch -->
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
      <SamplerPads
        trackId={trackId}
        mode={ui.padMode}
        rootNote={cell?.voiceParams?.rootNote ?? 60}
        activeSlice={activeSlice}
        octave={vkbd.octave}
        onpadtap={onPadTap}
      />
    </div>
    <div class="col-right">
      <SamplerStepRow trackId={trackId} />
      {#if isSampler}
        <SamplerParams />
      {/if}
    </div>
  </div>
</div>

<style>
  .pads-view {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .bottom-row {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 200px;
  }

  .col-pads {
    flex-shrink: 0;
    height: 100%;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .col-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
  }

  /* ── Mode switch (olive tier) ── */
  .mode-switch {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
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

  @media (max-width: 639px) {
    .pads-view {
      overflow-y: auto;
    }
    .bottom-row {
      flex-direction: column;
      height: auto;
    }
  }
</style>
