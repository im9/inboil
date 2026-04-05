<script lang="ts">
  import { song, ui, cellForTrack, ensureCells, samplesByCell, sampleCellKey, pushUndo, playback } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import SamplerWaveform from './SamplerWaveform.svelte'
  import SamplerPads from './SamplerPads.svelte'
  import SamplerParams from './SamplerParams.svelte'
  import SamplerStepRow from './SamplerStepRow.svelte'
  import { setTrigNote } from '../stepActions.ts'

  const trackId = $derived(ui.selectedTrack)
  const cell = $derived(cellForTrack(song.patterns[ui.currentPattern], trackId))
  const isSampler = $derived(cell?.voiceId === 'Sampler')

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

  <!-- Pads + Steps/Params (same layout as SamplerSheet) -->
  <div class="bottom-row">
    <div class="col-pads">
      {#if isSampler}
        <SamplerPads
          trackId={trackId}
          rootNote={cell?.voiceParams?.rootNote ?? 60}
          activeSlice={activeSlice}
          onpadtap={onPadTap}
        />
      {:else}
        <div class="track-pads">
          {#each Array(16) as _, i}
            {@const t = song.tracks[i]}
            {@const c = t ? cellForTrack(song.patterns[ui.currentPattern], t.id) : undefined}
            <button
              class="track-pad"
              class:active={t != null && t.id === trackId}
              class:empty={t == null}
              disabled={t == null}
              onpointerdown={t ? () => {
                ensureCells(song.patterns[ui.currentPattern])
                ui.selectedTrack = t.id
              } : undefined}
            >{c?.name ?? (t ? `TR${t.id + 1}` : '')}</button>
          {/each}
        </div>
      {/if}
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
  /* ── Layout: identical to SamplerSheet minus overlay shell ── */
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
  }

  .col-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
  }

  /* Track selector pads (TRACK mode, non-sampler) */
  .track-pads {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  .track-pad {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px;
  }

  .track-pad.active {
    background: var(--color-olive);
    color: var(--color-bg);
    border-color: var(--color-olive);
  }

  .track-pad.empty {
    border-color: var(--lz-border);
    background: var(--lz-bg-hover);
    cursor: default;
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
