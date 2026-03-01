<script lang="ts">
  import { pattern, ui, isDrum, setVoiceParam, setParamLock, clearAllParamLocks, toggleSidebar } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, denormalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import Knob from './Knob.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track  = $derived(pattern.tracks[ui.selectedTrack])
  const drum   = $derived(isDrum(track))
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))

  // P-Lock state
  const selTrig = $derived(ui.selectedStep !== null ? track.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)

  function knobValue(p: { key: string; default: number }): number {
    if (ui.lockMode && selTrig) {
      const lockVal = selTrig.paramLocks?.[p.key]
      return lockVal !== undefined ? lockVal : (track.voiceParams[p.key] ?? p.default)
    }
    return track.voiceParams[p.key] ?? p.default
  }

  function knobChange(p: { key: string }, v: number) {
    const actual = denormalizeParam(p as any, v)
    if (ui.lockMode && ui.selectedStep !== null) {
      setParamLock(ui.selectedTrack, ui.selectedStep, p.key, actual)
    } else {
      setVoiceParam(ui.selectedTrack, p.key, actual)
    }
  }

  function isParamLocked(key: string): boolean {
    return !!(ui.lockMode && selTrig?.paramLocks?.[key] !== undefined)
  }
</script>

<div class="param-panel">
  <button
    class="btn-help"
    onpointerdown={() => toggleSidebar('help')}
    aria-label="Help"
    data-tip="Show help" data-tip-ja="ヘルプを表示"
  >
    <span class="help-flip" class:flipped={ui.sidebar === 'help'}>
      <span class="face off">?</span>
      <span class="face on">?</span>
    </span>
  </button>

  <div class="inner">
    <div class="track-info">
      <span class="track-display"><SplitFlap value={track.name} width={6} /></span>
      <div class="track-btns">
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
    </div>

    <!-- Synth params (interactive knobs) -->
    <div class="knobs">
      {#each params as p, i}
        {#if i > 0 && p.group && p.group !== params[i - 1].group}
          <div class="param-sep" aria-hidden="true"></div>
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

  </div>
</div>

<style>
  .param-panel {
    position: relative;
    background: var(--color-fg);
    color: var(--color-bg);
    padding: 10px 16px;
    flex-shrink: 0;
    overflow: hidden;
    min-height: 84px;
    border-top: 1px solid rgba(237,232,220,0.08);
  }

  /* ── Help button (Othello flip) ── */
  .btn-help {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    border: none;
    background: transparent;
    padding: 0;
    width: 28px;
    height: 28px;
    perspective: 80px;
  }
  .help-flip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .help-flip.flipped {
    transform: rotateY(180deg);
  }
  .btn-help:active .help-flip { transform: scale(0.85); }
  .btn-help:active .help-flip.flipped { transform: rotateY(180deg) scale(0.85); }
  .help-flip > .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    backface-visibility: hidden;
  }
  .help-flip > .face.off {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
  }
  .help-flip > .face.on {
    border: 1px solid var(--color-blue);
    background: var(--color-blue);
    color: white;
    transform: rotateY(180deg);
  }

  /* ── Inner layout ── */
  .inner {
    display: flex;
    gap: 16px;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .track-info {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .track-display {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: var(--color-bg);
  }
  .track-btns {
    display: flex;
    align-items: center;
    gap: 4px;
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
  .btn-clr.hidden {
    visibility: hidden;
  }
  .btn-clr:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  /* ── Synth params (interactive knobs) ── */
  .knobs {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    flex: 1;
  }

  .param-sep {
    width: 1px;
    height: 28px;
    background: rgba(237,232,220,0.12);
    flex-shrink: 0;
    align-self: center;
  }

</style>
