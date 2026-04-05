<script lang="ts">
  import { song, ui, cellForTrack, samplesByCell, sampleCellKey, pushUndo } from '../state.svelte.ts'
  import SamplerWaveform from './SamplerWaveform.svelte'
  import SamplerPads from './SamplerPads.svelte'
  import SamplerParams from './SamplerParams.svelte'
  import SamplerStepRow from './SamplerStepRow.svelte'

  const { onclose }: { onclose: () => void } = $props()

  function goToSequencer() {
    ui.phraseView = 'pattern'
    ui.patternSheet = true
    ui.samplerTrackId = null
  }

  const trackId = $derived(ui.samplerTrackId)
  const track = $derived(trackId != null ? song.tracks.find(t => t.id === trackId) : null)
  const cell = $derived(
    trackId != null ? cellForTrack(song.patterns[ui.currentPattern], trackId) : undefined
  )

  // All sampler tracks for tab selector
  const samplerTracks = $derived(
    song.tracks.filter(t => {
      const c = cellForTrack(song.patterns[ui.currentPattern], t.id)
      return c?.voiceId === 'Sampler'
    })
  )

  // Current sample data for waveform
  const currentSample = $derived(
    trackId != null ? samplesByCell[sampleCellKey(trackId, ui.currentPattern)] : undefined
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

  function selectTrack(id: number) {
    ui.samplerTrackId = id
    ui.selectedTrack = id  // sync for knobValue/knobChange helpers
  }
</script>

<div class="sampler-sheet">
  <!-- Track tabs (when multiple sampler tracks) -->
  {#if samplerTracks.length > 1}
    <div class="track-tabs" role="tablist">
      {#each samplerTracks as t}
        {@const c = cellForTrack(song.patterns[ui.currentPattern], t.id)}
        <button
          class="track-tab"
          role="tab"
          aria-selected={t.id === trackId}
          class:active={t.id === trackId}
          onpointerdown={() => selectTrack(t.id)}
        >TR{t.id + 1}: {c?.name ?? ''}</button>
      {/each}
    </div>
  {/if}

  <!-- Header -->
  <div class="sheet-header">
    <button class="nav-btn" aria-label="Back to sequencer" onpointerdown={goToSequencer}
      data-tip="Back to sequencer" data-tip-ja="シーケンサーに戻る"
    >
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 1L3 6l5 5"/>
      </svg>
      SEQ
    </button>
    <span class="sheet-label">SMPL</span>
    {#if track && cell}
      <span class="track-name">Track {(trackId ?? 0) + 1}: {cell.name}</span>
    {/if}
    <div class="spacer"></div>
    <button class="close-btn" aria-label="Close sampler sheet" onpointerdown={onclose}
      data-tip="Close sampler sheet" data-tip-ja="サンプラーシートを閉じる"
    >
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M3 3l6 6M9 3l-6 6"/>
      </svg>
    </button>
  </div>

  <!-- Waveform display (ADR 130 Step 2) -->
  <SamplerWaveform
    sample={currentSample}
    start={startVal}
    end={endVal}
    chopSlices={chopVal}
    onchangestart={onChangeStart}
    onchangeend={onChangeEnd}
  />

  <div class="bottom-row">
    <!-- Pads (ADR 130 Step 3) -->
    {#if trackId != null}
      <SamplerPads
        trackId={trackId}
        chopSlices={chopVal}
        rootNote={cell?.voiceParams?.rootNote ?? 60}
      />
    {/if}

    <!-- Params (ADR 130 Step 4) -->
    <SamplerParams />
  </div>

  <!-- Step sequencer row (ADR 130 Step 6) -->
  {#if trackId != null}
    <SamplerStepRow trackId={trackId} />
  {/if}
</div>

<style>
  .sampler-sheet {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    height: 100%;
    overflow: hidden;
  }

  .track-tabs {
    display: flex;
    gap: 2px;
    padding-bottom: 4px;
  }

  .track-tab {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    cursor: pointer;
    opacity: 0.5;
  }

  .track-tab.active {
    background: var(--lz-bg-active);
    opacity: 1;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sheet-label {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.5;
  }

  .track-name {
    font-family: var(--font-data);
    font-size: var(--fs-md);
  }

  .spacer { flex: 1; }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px 2px 4px;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    opacity: 0.5;
  }

  .nav-btn:hover {
    opacity: 1;
    background: var(--lz-bg-hover);
  }

  .close-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
  }

  .close-btn:hover {
    opacity: 1;
    background: var(--lz-bg-hover);
  }

  .bottom-row {
    display: flex;
    gap: 12px;
    height: 160px;
    flex-shrink: 0;
  }

  /* Mobile: stack vertically, allow scroll */
  @media (max-width: 639px) {
    .sampler-sheet {
      overflow-y: auto;
    }
    .bottom-row {
      flex-direction: column;
      height: auto;
    }
  }
</style>
