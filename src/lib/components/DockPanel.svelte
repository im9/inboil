<script lang="ts">
  import { song, activeCell, ui, clearAllParamLocks, setTrackSend, toggleDockPosition } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import Knob from './Knob.svelte'

  const track  = $derived(song.tracks[ui.selectedTrack])
  const TRACK_ABBR = ['KK', 'SN', 'CP', 'CH', 'OH', 'CY', 'BS', 'LD']
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
</script>

<div class="dock-panel" class:bottom={ui.dockPosition === 'bottom'}>
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
                data-tip={_t.name} data-tip-ja={_t.name}
              >{TRACK_ABBR[i] ?? _t.name.slice(0, 2)}</button>
            {/each}
            <button
              class="btn-dock-pos"
              onpointerdown={toggleDockPosition}
              data-tip={ui.dockPosition === 'right' ? 'Move dock to bottom' : 'Move dock to right'}
              data-tip-ja={ui.dockPosition === 'right' ? 'ドックを下に移動' : 'ドックを右に移動'}
            >{ui.dockPosition === 'right' ? '⇩' : '⇨'}</button>
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
</div>

<style>
  .dock-panel {
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(237,232,220,0.08);
    overflow: hidden;
  }

  /* ── Bottom dock overrides ── */
  .dock-panel.bottom {
    width: 100%;
    height: auto;
    max-height: 200px;
    border-left: none;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-direction: row;
  }
  .dock-panel.bottom .dock-body {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .dock-panel.bottom .param-content {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 8px 12px;
    flex-wrap: nowrap;
  }
  .dock-panel.bottom .track-bar {
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
    width: auto;
    flex-shrink: 0;
  }
  .dock-panel.bottom .track-btn {
    padding: 2px 6px;
  }
  .dock-panel.bottom .lock-row {
    flex-direction: column;
    margin-bottom: 0;
    flex-shrink: 0;
  }
  .dock-panel.bottom .knob-grid {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  .dock-panel.bottom .section-divider {
    width: 1px;
    height: auto;
    align-self: stretch;
    margin: 0 4px;
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px;
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
  .btn-dock-pos {
    flex-shrink: 0;
    width: 22px;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .btn-dock-pos:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.7);
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
