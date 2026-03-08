<script lang="ts">
  import { song, activeCell, ui } from '../state.svelte.ts'
  import { setTrackSend, clearAllParamLocks, toggleMute, toggleSolo } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import Knob from './Knob.svelte'

  const track = $derived(song.tracks[ui.selectedTrack])
  const cell   = $derived(activeCell(ui.selectedTrack))
  const params = $derived(getParamDefs(cell.voiceId))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)

  // Group params into categories for tab switching
  interface ParamCategory { id: string; label: string; params: typeof params }
  const paramCategories = $derived((): ParamCategory[] => {
    const cats: ParamCategory[] = [{ id: 'mix', label: 'MIX', params: [] }]
    let currentGroup: string | null = null
    for (const p of params) {
      const g = p.group ?? ''
      if (g !== currentGroup) {
        currentGroup = g
        cats.push({ id: g || '_main', label: (g || 'SYNTH').toUpperCase().slice(0, 4), params: [] })
      }
      cats[cats.length - 1].params.push(p)
    }
    cats.push({ id: 'fx', label: 'FX', params: [] })
    return cats
  })

  let paramTab = $state('mix')
  $effect(() => {
    void ui.selectedTrack
    const cats = paramCategories()
    if (!cats.find(c => c.id === paramTab)) paramTab = 'mix'
  })

  function close() { ui.mobileOverlay = false }

  // Swipe down to dismiss
  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchStartY
    if (dy > 50) close()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay-backdrop" onpointerdown={(e) => { if (e.target === e.currentTarget) close() }} ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
  <div class="overlay-card">
    <!-- Drag handle -->
    <div class="overlay-handle">
      <span class="handle-pill"></span>
    </div>

    <!-- Lock toolbar -->
    <div class="lock-toolbar">
      <button
        class="btn-lock"
        class:active={ui.lockMode}
        onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
      >LOCK</button>
      {#if ui.lockMode && ui.selectedStep !== null}
        <span class="lock-label">STEP {ui.selectedStep + 1}</span>
        {#if hasAnyLock}
          <button class="btn-clr" onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
        {/if}
      {/if}
      <span class="toolbar-spacer"></span>
      <button
        class="btn-solo"
        class:active={ui.soloTracks.has(ui.selectedTrack)}
        onpointerdown={() => toggleSolo(ui.selectedTrack)}
      >SOLO</button>
      <button
        class="btn-mute"
        class:muted={track.muted}
        onpointerdown={() => toggleMute(ui.selectedTrack)}
      >MUTE</button>
    </div>

    <!-- Param category tabs -->
    <div class="param-tabs">
      {#each paramCategories() as cat}
        <button
          class="param-tab"
          class:active={paramTab === cat.id}
          onpointerdown={() => { paramTab = cat.id }}
        >{cat.label}</button>
      {/each}
    </div>

    <!-- Param knobs for selected category -->
    <div class="params-bar">
      {#if paramTab === 'mix'}
        <Knob value={track.volume} label="VOL" size={40} onchange={v => { song.tracks[ui.selectedTrack].volume = v }} />
        <Knob value={(track.pan + 1) / 2} label="PAN" size={40} onchange={v => { song.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
      {:else if paramTab === 'fx'}
        <Knob value={activeCell(ui.selectedTrack).reverbSend} label="VERB" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
        <Knob value={activeCell(ui.selectedTrack).delaySend} label="DLY" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
        <Knob value={activeCell(ui.selectedTrack).glitchSend} label="GLT" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
        <Knob value={activeCell(ui.selectedTrack).granularSend} label="GRN" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
      {:else}
        {@const cat = paramCategories().find(c => c.id === paramTab)}
        {#if cat}
          {#each cat.params as p}
            <span data-tip={p.tip ?? 'Drag to adjust'} data-tip-ja={p.tipJa ?? 'ドラッグで調整'}>
            <Knob
              value={normalizeParam(p, knobValue(p))}
              label={p.label}
              size={40}
              locked={isParamLocked(p.key)}
              steps={paramSteps(p)}
              displayValue={displayLabel(p, knobValue(p))}
              onchange={v => knobChange(p, v)}
            />
            </span>
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Track dots -->
    <div class="track-dots">
      {#each song.tracks as _t, i}
        <button
          class="dot"
          class:active={i === ui.selectedTrack}
          onpointerdown={() => { ui.selectedTrack = i }}
          aria-label="Track {i + 1}"
        ></button>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
  }
  .overlay-card {
    width: 100%;
    background: var(--color-fg);
    border-radius: 12px 12px 0 0;
    display: flex;
    flex-direction: column;
    max-height: 70vh;
    overflow: hidden;
  }

  /* ── Handle ── */
  .overlay-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0 4px;
    flex-shrink: 0;
  }
  .handle-pill {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: rgba(237,232,220,0.25);
  }

  /* ── Lock toolbar ── */
  .lock-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 6px;
    flex-shrink: 0;
  }
  .toolbar-spacer { flex: 1; }
  .btn-lock {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .lock-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
  }
  .btn-clr {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.5);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }
  .btn-solo {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-solo.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-mute {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-mute.muted {
    background: var(--color-salmon);
    border-color: var(--color-salmon);
    color: var(--color-bg);
  }

  /* ── Param tabs ── */
  .param-tabs {
    display: flex;
    flex-shrink: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .param-tab {
    flex-shrink: 0;
    padding: 5px 10px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.35);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
  }
  .param-tab.active {
    color: rgba(237,232,220,0.90);
    border-bottom-color: var(--color-olive);
  }

  /* ── Params bar ── */
  .params-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 8px 10px;
    gap: 6px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ── Track dots ── */
  .track-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(237,232,220,0.35);
    background: transparent;
    padding: 0;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }
</style>
