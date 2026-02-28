<script lang="ts">
  import { pattern, ui, isDrum, toggleBottomPanel, setVoiceParam, setParamLock, clearAllParamLocks, toggleSidebar } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, denormalizeParam } from '../paramDefs.ts'
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
      <span class="track-display"><SplitFlap value={track.name} width={5} /></span>
      <div class="track-btns">
        {#if !drum}
          <button
            class="btn-notes"
            class:active={track.bottomPanel === 'piano'}
            onpointerdown={() => toggleBottomPanel(ui.selectedTrack)}
            data-tip="Toggle piano roll" data-tip-ja="ピアノロールを表示/非表示"
          >♪ NOTES</button>
        {/if}
        <button
          class="btn-lock"
          class:active={ui.lockMode}
          onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
          data-tip="Parameter lock mode" data-tip-ja="パラメーターロックモード"
        >LOCK</button>
      </div>
    </div>

    {#if ui.lockMode && ui.selectedStep !== null}
      <span class="lock-label">STEP {ui.selectedStep + 1}</span>
      {#if hasAnyLock}
        <button class="btn-clr" onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
      {/if}
    {/if}

    <!-- Synth params (interactive knobs) -->
    <div class="knobs" data-tip="Synth parameters — drag to adjust" data-tip-ja="シンセパラメータ — ドラッグで調整">
      {#each params as p}
        <Knob
          value={normalizeParam(p, knobValue(p))}
          label={p.label}
          size={32}
          locked={isParamLocked(p.key)}
          onchange={v => knobChange(p, v)}
        />
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
    gap: 4px;
  }

  .btn-notes {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .btn-notes:active,
  .btn-notes.active {
    background: var(--color-blue);
    border-color: var(--color-blue);
    color: white;
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
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
    flex-shrink: 0;
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
    flex-shrink: 0;
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

</style>
