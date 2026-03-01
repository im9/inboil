<script lang="ts">
  import { pattern, playback, ui, toggleTrig, toggleMute, isDrum, setVoiceParam, setParamLock, clearAllParamLocks, effects, setTrackSteps, STEP_OPTIONS } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, denormalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import PianoRoll from './PianoRoll.svelte'
  import Knob from './Knob.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track = $derived(pattern.tracks[ui.selectedTrack])
  const drum = $derived(isDrum(track))
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))

  // Mobile tab: melodic tracks can switch between STEPS and NOTES
  let mobileTab: 'steps' | 'notes' = $state('steps')

  // Dynamic column count based on step count
  const calcCols = $derived(track.steps <= 8 ? 4 : track.steps <= 16 ? 4 : track.steps <= 32 ? 8 : 8)

  // P-Lock: selected step's trig and lock state
  const selTrig = $derived(ui.selectedStep !== null ? track.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)

  function stepAction(stepIdx: number) {
    if (ui.lockMode) {
      ui.selectedStep = ui.selectedStep === stepIdx ? null : stepIdx
    } else {
      toggleTrig(ui.selectedTrack, stepIdx)
    }
  }

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

  function cycleSteps() {
    const current = track.steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    const next = STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length]
    setTrackSteps(ui.selectedTrack, next)
  }

  function prevTrack() {
    ui.selectedTrack = (ui.selectedTrack - 1 + pattern.tracks.length) % pattern.tracks.length
    ui.selectedStep = null
  }
  function nextTrack() {
    ui.selectedTrack = (ui.selectedTrack + 1) % pattern.tracks.length
    ui.selectedStep = null
  }
</script>

<div class="mobile-view">

  <!-- Track navigation -->
  <div class="track-nav">
    <button class="nav-btn" onpointerdown={prevTrack}>◀</button>

    <div class="track-info">
      <span class="track-name"><SplitFlap value={track.name} width={5} /></span>
      <div class="track-meta">
        <span class="track-type">{track.synthType}</span>
        <button class="step-count" onpointerdown={cycleSteps}>{track.steps}</button>
        <button
          class="btn-lock"
          class:active={ui.lockMode}
          onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
        >LOCK</button>
        <Knob
          value={track.volume}
          label="VOL"
          size={28}
          light
          compact
          onchange={v => { pattern.tracks[ui.selectedTrack].volume = v }}
        />
        <Knob
          value={(track.pan + 1) / 2}
          label="PAN"
          size={28}
          light
          compact
          onchange={v => { pattern.tracks[ui.selectedTrack].pan = v * 2 - 1 }}
        />
        <button
          class="btn-mute"
          onpointerdown={() => toggleMute(ui.selectedTrack)}
        >
          <span class="mute-flip" class:flipped={track.muted}>
            <span class="face off">M</span>
            <span class="face on">M</span>
          </span>
        </button>
      </div>
    </div>

    <button class="nav-btn" onpointerdown={nextTrack}>▶</button>
  </div>

  <!-- Melodic tab switcher -->
  {#if !drum}
    <div class="view-tabs">
      <button class="tab" class:active={mobileTab === 'steps'} onpointerdown={() => { mobileTab = 'steps' }}>STEPS</button>
      <button class="tab" class:active={mobileTab === 'notes'} onpointerdown={() => { mobileTab = 'notes' }}>NOTES</button>
    </div>
  {/if}

  <!-- Main area -->
  {#if drum || mobileTab === 'steps'}
    <div class="calculator" style="--cols: {calcCols}">
      {#each track.trigs as trig, stepIdx}
        {@const isPlayhead = playback.playing && playback.playheads[ui.selectedTrack] === stepIdx}
        {@const isSelected = ui.lockMode && ui.selectedStep === stepIdx}
        {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
        <button
          class="calc-btn"
          class:playhead={isPlayhead}
          class:lock-selected={isSelected}
          onpointerdown={() => stepAction(stepIdx)}
        >
          <span class="btn-flip" class:flipped={trig.active}>
            <span class="face off"><span class="step-num">{stepIdx + 1}</span></span>
            <span class="face on"><span class="step-num">{stepIdx + 1}</span></span>
          </span>
          {#if hasLocks}<span class="lock-dot"></span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="piano-wrap">
      <PianoRoll trackId={ui.selectedTrack} />
    </div>
  {/if}

  <!-- Params (always visible at bottom) -->
  <div class="params-bar">
    {#if ui.lockMode && ui.selectedStep !== null}
      <span class="lock-label">STEP {ui.selectedStep + 1}</span>
      {#if hasAnyLock}
        <button class="btn-clr" onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
      {/if}
    {/if}
    {#each params as p, i}
      {#if i > 0 && p.group && p.group !== params[i - 1].group}
        <div class="sends-sep" aria-hidden="true"></div>
      {/if}
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

    <!-- Global FX -->
    <div class="sends-sep" aria-hidden="true"></div>
    <Knob
      value={effects.ducker.depth}
      label="DUCK"
      size={40}
      onchange={v => { effects.ducker.depth = v }}
    />
    <Knob
      value={(effects.comp.makeup - 1.0) / 2.5}
      label="COMP"
      size={40}
      onchange={v => { effects.comp.makeup = 1.0 + v * 2.5 }}
    />
  </div>

  <!-- Track indicator dots -->
  <div class="track-dots">
    {#each pattern.tracks as _t, i}
      <button
        class="dot"
        class:active={i === ui.selectedTrack}
        onpointerdown={() => { ui.selectedTrack = i }}
        aria-label="Track {i + 1}"
      ></button>
    {/each}
  </div>

</div>

<style>
  .mobile-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  /* ── Track nav ── */
  .track-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(30,32,40,0.1);
  }
  .nav-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .nav-btn:active { background: var(--color-fg); color: var(--color-bg); }

  .track-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
  }
  .track-name {
    font-family: var(--font-display);
    font-size: 32px;
    line-height: 1;
    color: var(--color-fg);
    letter-spacing: 0.02em;
  }
  .track-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track-type {
    font-size: 9px;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .step-count {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-olive);
    background: transparent;
    border: 1px solid var(--color-olive);
    padding: 1px 5px;
    line-height: 14px;
  }
  .step-count:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-lock {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(30,32,40,0.4);
    background: transparent;
    border: 1px solid rgba(30,32,40,0.25);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-mute {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .mute-flip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .mute-flip.flipped { transform: rotateY(180deg); }
  .btn-mute:active .mute-flip { transform: scale(0.85); }
  .btn-mute:active .mute-flip.flipped { transform: rotateY(180deg) scale(0.85); }
  .mute-flip > .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    backface-visibility: hidden;
  }
  .mute-flip > .face.off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
  }
  .mute-flip > .face.on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    transform: rotateY(180deg);
  }

  /* ── View tabs (melodic only) ── */
  .view-tabs {
    display: flex;
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    padding: 6px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(30,32,40,0.35);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
  }
  .tab.active {
    color: var(--color-fg);
    border-bottom-color: var(--color-olive);
  }

  /* ── Calculator (dynamic columns) ── */
  .calculator {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols, 4), 1fr);
    gap: 4px;
    padding: 8px;
    align-content: start;
    overflow-y: auto;
    overscroll-behavior: none;
  }
  .calc-btn {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    border: none;
    background: transparent;
    perspective: 120px;
    padding: 0;
  }

  .btn-flip {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .btn-flip.flipped {
    transform: rotateY(180deg);
  }
  .calc-btn:active .btn-flip { transform: scale(0.9); }
  .calc-btn:active .btn-flip.flipped { transform: rotateY(180deg) scale(0.9); }

  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .face.off {
    background: var(--color-bg);
    border: 1.5px solid rgba(30,32,40,0.5);
  }
  .face.on {
    background: var(--color-olive);
    border: 1.5px solid var(--color-olive);
    transform: rotateY(180deg);
  }

  .step-num {
    font-family: var(--font-display);
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
  }
  .face.off .step-num {
    color: var(--color-fg);
    opacity: 0.3;
  }
  .face.on .step-num {
    color: var(--color-bg);
    opacity: 0.5;
  }

  /* ── P-Lock indicators ── */
  .calc-btn.lock-selected .face.off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .calc-btn.lock-selected .face.on {
    box-shadow: inset 0 0 0 2px var(--color-bg);
  }
  .lock-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-olive);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Playhead glow ── */
  .calc-btn.playhead {
    animation: ph-glow 180ms ease-out;
  }

  @keyframes ph-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
  }

  /* ── Piano roll ── */
  .piano-wrap {
    flex: 1;
    overflow: hidden;
  }
  .piano-wrap :global(.piano-roll) {
    height: 100%;
  }

  /* ── Params bar ── */
  .params-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    background: var(--color-fg);
    flex-shrink: 0;
    padding: 6px 10px;
    gap: 6px 10px;
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
  .sends-sep {
    width: 1px;
    height: 32px;
    background: rgba(237,232,220,0.12);
    flex-shrink: 0;
  }

  /* ── Track dots ── */
  .track-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: var(--color-fg);
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
