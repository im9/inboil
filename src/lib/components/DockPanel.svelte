<script lang="ts">
  import { song, activeCell, ui, clearAllParamLocks, setTrackSend, applyPreset, toggleDockMinimized } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { hasPresets, getPresets, getPresetCategories, CATEGORY_LABELS, type PresetCategory } from '../presets.ts'
  import Knob from './Knob.svelte'

  const track  = $derived(song.tracks[ui.selectedTrack])
  const TRACK_ABBR = ['KK', 'SN', 'CP', 'CH', 'OH', 'CY', 'BS', 'LD']
  const cell   = $derived(activeCell(ui.selectedTrack))
  const params = $derived(getParamDefs(cell.voiceId))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)

  // ── Preset browser ──
  const showPresets = $derived(hasPresets(cell.voiceId))
  let presetCategory = $state<PresetCategory | null>(null)
  const presetList = $derived(getPresets(presetCategory))
  let presetOpen = $state(false)
  // Track selected preset name per track (keyed by track index)
  let presetByTrack = $state<Record<number, string>>({})
  const currentPreset = $derived(presetByTrack[ui.selectedTrack] ?? '')
  function selectPreset(preset: { name: string; params: Record<string, number> }) {
    presetByTrack[ui.selectedTrack] = preset.name
    applyPreset(ui.selectedTrack, preset.params)
    presetOpen = false
  }
</script>

<div class="dock-panel" class:minimized={ui.dockMinimized}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dock-handle"
    onpointerdown={toggleDockMinimized}
    data-tip={ui.dockMinimized ? 'Expand dock' : 'Minimize dock'}
    data-tip-ja={ui.dockMinimized ? 'ドックを展開' : 'ドックを最小化'}
  ><span class="handle-bar"></span></div>
  {#if !ui.dockMinimized}
  <div class="dock-body">
        <div class="param-content">
          <!-- Track selector bar -->
          <div class="track-bar">
            {#each song.tracks as _t, i}
              <button
                class="track-btn"
                class:active={i === ui.selectedTrack}
                class:muted={_t.muted}
                onpointerdown={() => { ui.selectedTrack = i }}
                data-tip={activeCell(i).name} data-tip-ja={activeCell(i).name}
              >{TRACK_ABBR[i] ?? activeCell(i).name.slice(0, 2)}</button>
            {/each}
          </div>

          <div class="lock-row">
            <button
              class="btn-lock"
              class:active={ui.lockMode}
              onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
              data-tip="Parameter lock mode" data-tip-ja="パラメーターロックモード"
            >LOCK</button>
            {#if ui.lockMode && ui.selectedStep !== null}
              <span class="lock-label">STEP{ui.selectedStep + 1}</span>
              <button class="btn-clr" class:hidden={!hasAnyLock} onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
            {/if}
          </div>

          <!-- Preset browser (Synth/Poly only) -->
          {#if showPresets}
            <div class="preset-section">
              <button class="preset-toggle" onpointerdown={() => presetOpen = !presetOpen}
                data-tip="Browse presets" data-tip-ja="プリセットを選択"
              >{currentPreset ? currentPreset : 'PRESETS'} {presetOpen ? '▾' : '▸'}</button>
              {#if presetOpen}
                <div class="preset-cats">
                  <button class="cat-btn" class:active={presetCategory === null}
                    onpointerdown={() => presetCategory = null}>ALL</button>
                  {#each getPresetCategories() as cat}
                    <button class="cat-btn" class:active={presetCategory === cat}
                      onpointerdown={() => presetCategory = cat}>{CATEGORY_LABELS[cat]}</button>
                  {/each}
                </div>
                <div class="preset-list">
                  {#each presetList as preset}
                    <button class="preset-item" class:selected={currentPreset === preset.name}
                      onpointerdown={() => selectPreset(preset)}
                    >
                      <span class="preset-cat-tag">{CATEGORY_LABELS[preset.category]}</span>
                      <span class="preset-name">{preset.name}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Synth param knobs (multi-row grid) -->
          <div class="knob-grid">
            {#each params as p, i}
              {#if i > 0 && p.group && p.group !== params[i - 1].group}
                <div class="param-sep-row" aria-hidden="true"></div>
              {/if}
              <span data-tip={p.tip ?? 'Drag to adjust'} data-tip-ja={p.tipJa ?? 'ドラッグで調整'}>
                <Knob
                  value={normalizeParam(p, knobValue(p))}
                  label={p.label}
                  size={32}
                  locked={isParamLocked(p.key)}
                  steps={paramSteps(p)}
                  displayValue={displayLabel(p, knobValue(p))}
                  onchange={v => knobChange(p, v)}
                />
              </span>
            {/each}
          </div>

          <!-- Send knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="knob-grid">
            <span data-tip="Reverb send amount" data-tip-ja="リバーブセンド量">
              <Knob value={activeCell(ui.selectedTrack).reverbSend} label="VERB" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
            </span>
            <span data-tip="Delay send amount" data-tip-ja="ディレイセンド量">
              <Knob value={activeCell(ui.selectedTrack).delaySend} label="DLY" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
            </span>
            <span data-tip="Glitch send amount" data-tip-ja="グリッチセンド量">
              <Knob value={activeCell(ui.selectedTrack).glitchSend} label="GLT" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
            </span>
            <span data-tip="Granular send amount" data-tip-ja="グラニュラーセンド量">
              <Knob value={activeCell(ui.selectedTrack).granularSend} label="GRN" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
            </span>
          </div>

          <!-- Mixer knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="knob-grid">
            <span data-tip="Track volume" data-tip-ja="トラック音量">
              <Knob value={track.volume} label="VOL" size={32} onchange={v => { song.tracks[ui.selectedTrack].volume = v }} />
            </span>
            <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
              <Knob value={(track.pan + 1) / 2} label="PAN" size={32} onchange={v => { song.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
            </span>
          </div>
        </div>
    </div>
  {/if}
</div>

<style>
  .dock-panel {
    position: relative;
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(237,232,220,0.08);
    overflow: hidden;
    transition: width 120ms ease-out;
  }

  /* ── Minimized dock ── */
  .dock-panel.minimized {
    width: 16px;
  }

  /* ── Left-edge handle (border-line grip) ── */
  .dock-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
  }
  .dock-handle:hover .handle-bar {
    background: rgba(237,232,220,0.35);
  }
  .handle-bar {
    width: 3px;
    height: 28px;
    border-radius: 1.5px;
    background: rgba(237,232,220,0.12);
    transition: background 80ms;
  }
  .dock-panel.minimized .handle-bar {
    background: rgba(237,232,220,0.25);
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px 10px 16px;
  }
  /* ── Track selector bar ── */
  .track-bar {
    display: flex;
    gap: 2px;
    margin-bottom: 8px;
  }
  .track-btn {
    flex: 1;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.4);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 4px 0;
    text-align: center;
  }
  .track-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .track-btn.muted:not(.active) {
    opacity: 0.35;
  }

  .lock-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  .btn-lock {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    white-space: nowrap;
    text-transform: uppercase;
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
  .btn-clr.hidden { visibility: hidden; }
  .btn-clr:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  /* ── Preset browser ── */
  .preset-section {
    margin-bottom: 8px;
  }
  .preset-toggle {
    border: 1px solid rgba(237,232,220,0.2);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    width: 100%;
    text-align: left;
    cursor: pointer;
  }
  .preset-toggle:hover {
    color: rgba(237,232,220,0.8);
    border-color: rgba(237,232,220,0.35);
  }
  .preset-cats {
    display: flex;
    gap: 2px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .cat-btn {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.4);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 5px;
    cursor: pointer;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-list {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-top: 4px;
    border: 1px solid rgba(237,232,220,0.1);
  }
  .preset-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: none;
    border-bottom: 1px solid rgba(237,232,220,0.06);
    background: transparent;
    color: rgba(237,232,220,0.65);
    font-size: 10px;
    padding: 4px 6px;
    text-align: left;
    cursor: pointer;
  }
  .preset-item:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.9);
  }
  .preset-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-item.selected {
    background: rgba(108,119,68,0.2);
    color: rgba(237,232,220,0.95);
  }
  .preset-item.selected .preset-cat-tag {
    color: var(--color-olive);
  }
  .preset-cat-tag {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.35);
    width: 28px;
    flex-shrink: 0;
  }
  .preset-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 4px 0;
  }
  .param-sep-row {
    width: 100%;
    height: 1px;
    background: rgba(237,232,220,0.08);
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: rgba(237,232,220,0.12);
    margin: 8px 0;
  }

</style>
