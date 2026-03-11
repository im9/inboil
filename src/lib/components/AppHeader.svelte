<script lang="ts">
  import { song, playback, ui, project, masterLevels, toggleSidebar, pushUndo } from '../state.svelte.ts'
  import { BPM_MIN, BPM_MAX } from '../constants.ts'
  import { startCapture, stopCapture } from '../wavExport.ts'
  import { downloadBlob } from '../midiExport.ts'
  import { engine } from '../audio/engine.ts'
  import SplitFlap from './SplitFlap.svelte'
  import Oscilloscope from './Oscilloscope.svelte'

  import PerfButtons from './PerfButtons.svelte'

  interface Props {
    onPlay: () => void
    onStop: () => void
    compact?: boolean
  }
  let { onPlay, onStop, compact = false }: Props = $props()

  function handleHelp() {
    toggleSidebar('help')
  }

  function handleSystem() {
    toggleSidebar('system')
  }

  // ── WAV recording (ADR 085) ──
  // States: idle → armed (REC pressed, waiting for play) → recording (capturing audio)
  let recState: 'idle' | 'armed' | 'recording' = $state('idle')

  function handleRec() {
    if (recState === 'idle') {
      // Arm recording — wait for play
      recState = 'armed'
    } else if (recState === 'armed') {
      // Cancel arming
      recState = 'idle'
    } else {
      // Stop recording + save
      finishRecording()
    }
  }

  function wrappedPlay() {
    onPlay()
    if (recState === 'armed') {
      const ctx = engine.getContext()
      const source = engine.getCaptureSource()
      if (!ctx || !source) { recState = 'idle'; return }
      recState = 'recording'
      startCapture(ctx, source).then(blob => {
        recState = 'idle'
        const pat = song.patterns[ui.currentPattern]
        const name = pat.name || `pattern_${String(ui.currentPattern).padStart(2, '0')}`
        downloadBlob(blob, `${name}.wav`)
      })
    }
  }

  function wrappedStop() {
    onStop()
    // Recording continues after stop — user captures reverb tail, then presses REC to finish
  }

  function finishRecording() {
    stopCapture()
    // blob resolves via the startCapture promise in wrappedPlay
  }

  // ── Inline BPM edit ──
  let editingBpm = $state(false)
  let editBpmValue = $state('')
  let bpmInputEl: HTMLInputElement | undefined = $state()

  function startBpmEdit() {
    editBpmValue = String(song.bpm)
    editingBpm = true
    requestAnimationFrame(() => bpmInputEl?.select())
  }
  function commitBpmEdit() {
    editingBpm = false
    const v = Math.round(Number(editBpmValue))
    if (!isNaN(v) && v >= 40 && v <= 240) song.bpm = v
  }
  function cancelBpmEdit() { editingBpm = false }
  function onBpmKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitBpmEdit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelBpmEdit() }
  }

  // ── Long-press auto-repeat for BPM ±buttons ──
  let bpmRepeatTimer: ReturnType<typeof setTimeout> | null = null
  let bpmRepeatInterval: ReturnType<typeof setInterval> | null = null

  function bpmStep(dir: -1 | 1) {
    song.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, song.bpm + dir))
  }

  function startBpmRepeat(dir: -1 | 1) {
    pushUndo('BPM')
    bpmStep(dir)
    bpmRepeatTimer = setTimeout(() => {
      bpmRepeatInterval = setInterval(() => bpmStep(dir), 80)
    }, 400)
  }

  function stopBpmRepeat() {
    if (bpmRepeatTimer) { clearTimeout(bpmRepeatTimer); bpmRepeatTimer = null }
    if (bpmRepeatInterval) { clearInterval(bpmRepeatInterval); bpmRepeatInterval = null }
  }

</script>

<div class="header-wrap" class:compact>
  <!-- Top bar: logo + oscilloscope background -->
  <header class="app-header">
    <Oscilloscope />
    <svg class="app-logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" fill="#a3a145"/>
      <rect x="14" y="4" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="4" y="14" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="14" y="14" width="8" height="8" fill="#a3a145"/>
      <rect x="24" y="4" width="4" height="18" rx="1" fill="#ede8dc" opacity="0.4"/>
    </svg>
    <span class="app-name">INBOIL</span>
    {#if masterLevels.cpu > 0}
      {@const cpu = masterLevels.cpu}
      {@const dots = Math.min(6, Math.round(cpu / 100 * 6))}
      <span class="cpu-meter" class:warn={cpu > 60} class:crit={cpu > 85}
        data-tip={cpu > 100 ? 'CPU overload — reduce Insert FX or tracks' : cpu > 85 ? 'CPU high — consider reducing Insert FX' : `Audio CPU ${Math.round(cpu)}%`}
        data-tip-ja={cpu > 100 ? 'CPU過負荷 — Insert FXやトラック数を減らしてください' : cpu > 85 ? 'CPU高負荷 — Insert FXの削減を検討' : `オーディオCPU ${Math.round(cpu)}%`}>
        <span class="cpu-label">CPU</span>
        <span class="cpu-dots">{#each {length: 6} as _, i}<span class="cpu-dot" class:lit={i < dots} class:hi={i >= 4}></span>{/each}</span>
        <!-- <span class="cpu-val">{Math.round(cpu)}%</span> -->
      </span>
    {/if}
  </header>

  <!-- Sub header: BPM, transport, perf controls, pattern -->
  <div class="sub-header">
    <div class="bpm-block">
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(-1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Decrease tempo (hold to scroll)" data-tip-ja="テンポを下げる (長押しでスクロール)">−</button>
      {#if editingBpm}
        <input
          bind:this={bpmInputEl}
          class="bpm-input"
          type="text"
          inputmode="numeric"
          maxlength="3"
          bind:value={editBpmValue}
          onblur={commitBpmEdit}
          onkeydown={onBpmKeydown}
        />
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="bpm-value" onclick={startBpmEdit} data-tip="Click to edit tempo" data-tip-ja="クリックでテンポを変更"><SplitFlap value={song.bpm} /></span>
      {/if}
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Increase tempo (hold to scroll)" data-tip-ja="テンポを上げる (長押しでスクロール)">+</button>
      <span class="bpm-label">BPM</span>
    </div>

    <div class="transport">
      <button
        class="btn-transport"
        class:active={playback.playing}
        onpointerdown={wrappedPlay}
        aria-label="Play"
        data-tip="Play pattern" data-tip-ja="パターンを再生"
      >▶</button>
      <button
        class="btn-transport"
        onpointerdown={wrappedStop}
        aria-label="Stop"
        data-tip="Stop playback" data-tip-ja="再生を停止"
      >■</button>
      <button
        class="btn-rec"
        class:armed={recState === 'armed'}
        class:active={recState === 'recording'}
        onpointerdown={handleRec}
        aria-label={recState === 'recording' ? 'Stop recording' : recState === 'armed' ? 'Cancel record' : 'Arm recording'}
        data-tip={recState === 'recording' ? 'Stop recording and save WAV' : recState === 'armed' ? 'Cancel recording standby' : 'Arm recording (starts on play)'}
        data-tip-ja={recState === 'recording' ? '録音を停止してWAVを保存' : recState === 'armed' ? '録音待機を解除' : '録音待機 (再生で開始)'}
      >● REC</button>
    </div>

    <div class="sep" aria-hidden="true"></div>

    <!-- View toggle: SCENE / FX / EQ / MST -->
    <div class="view-toggle">
      <button
        class="btn-view"
        class:active={ui.phraseView === 'pattern' && !ui.patternSheet}
        onpointerdown={() => { ui.phraseView = 'pattern'; ui.patternSheet = false }}
        data-tip="Scene view" data-tip-ja="シーンビュー"
      >SCENE</button>
      <button
        class="btn-view"
        class:active={ui.phraseView === 'fx'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'fx' ? 'pattern' : 'fx'; ui.patternSheet = false }}
        data-tip="FX pad — drag nodes to control effects" data-tip-ja="FXパッド — ノードをドラッグしてエフェクト操作"
      >FX</button>
      <button
        class="btn-view"
        class:active={ui.phraseView === 'eq'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'eq' ? 'pattern' : 'eq'; ui.patternSheet = false }}
        data-tip="EQ / Filter view" data-tip-ja="EQ / フィルター画面"
      >EQ</button>
      <button
        class="btn-view"
        class:active={ui.phraseView === 'master'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'master' ? 'pattern' : 'master'; ui.patternSheet = false }}
        data-tip="Master bus — compressor, ducker, FX returns" data-tip-ja="マスターバス — コンプ、ダッカー、FXリターン"
      >MST</button>
    </div>

    <div class="sep" aria-hidden="true"></div>

    <!-- Performance buttons (momentary press-hold) -->
    <div class="perf-btns">
      <PerfButtons variant="bar" />
    </div>

    <div class="header-nav">
      <button
        class="btn-header-nav"
        class:active={ui.sidebar === 'help'}
        onpointerdown={compact ? () => toggleSidebar('help') : handleHelp}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
      <button
        class="btn-header-nav"
        class:active={ui.sidebar === 'system'}
        onpointerdown={handleSystem}
        aria-label="System settings"
        data-tip="System settings" data-tip-ja="システム設定"
      ><span class="btn-nav-inner">SYSTEM{#if project.dirty}<span class="dirty-dot"></span>{/if}</span></button>
    </div>
  </div>


</div>

<style>
  .header-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  /* ── Top bar (logo + oscilloscope) ── */
  .app-header {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 12px 0 12px;
    background: var(--color-fg);
    color: var(--color-bg);
    overflow: hidden;
  }
  .compact .app-header { height: 32px; }

  .app-logo {
    width: 18px;
    height: 18px;
    margin-right: 5px;
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }
  .compact .app-logo { width: 14px; height: 14px; margin-right: 4px; }

  .app-name {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
  }

  .cpu-meter {
    position: relative;
    z-index: 1;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.35);
    font-variant-numeric: tabular-nums;
  }
  .cpu-label { flex-shrink: 0; }
  .cpu-dots {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .cpu-dot {
    width: 4px;
    height: 8px;
    border-radius: 1px;
    background: rgba(237,232,220,0.12);
    transition: background 120ms linear;
  }
  .cpu-dot.lit { background: rgba(163,161,69,0.55); }
  .cpu-dot.lit.hi { background: rgba(220,180,50,0.7); }
  .cpu-meter.crit .cpu-dot.lit.hi { background: rgba(220,80,60,0.85); }
  .cpu-meter.crit { animation: cpu-blink 0.6s ease-in-out infinite alternate; }
  @keyframes cpu-blink {
    from { opacity: 1; }
    to { opacity: 0.5; }
  }

  .header-nav {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .btn-header-nav {
    border: 1.5px solid rgba(237,232,220,0.35);
    background: rgba(237,232,220,0.04);
    color: rgba(237,232,220,0.55);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear, border-color 40ms linear;
    user-select: none;
  }
  .btn-header-nav:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }
  .btn-header-nav:active,
  .btn-header-nav.active {
    background: rgba(237,232,220,0.14);
    color: rgba(237,232,220,0.90);
    border-color: rgba(237,232,220,0.50);
  }
  .btn-nav-inner {
    position: relative;
  }
  .dirty-dot {
    position: absolute;
    top: -2px;
    right: -6px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-olive);
  }

  /* ── Sub header (controls) ── */
  .sub-header {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 64px;
    padding: 0 12px 0 8px;
    background: var(--color-fg);
    color: var(--color-bg);
    border-top: 1px solid rgba(237,232,220,0.06);
  }
  .compact .sub-header { height: 52px; gap: 10px; }

  /* ── BPM ── */
  .bpm-block {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bpm-value {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: var(--color-bg);
    cursor: text;
  }
  .compact .bpm-value { font-size: 18px; }

  .bpm-adj {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.6);
    width: 24px;
    height: 24px;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .bpm-adj:active { background: rgba(237,232,220,0.15); }

  .bpm-input {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.9);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(237,232,220,0.25);
    border-radius: 2px;
    padding: 0 4px;
    width: 3.5ch;
    outline: none;
    text-align: center;
  }
  .compact .bpm-input { font-size: 18px; }

  .bpm-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.35);
    text-transform: uppercase;
  }

  /* ── Transport ── */
  .transport {
    display: flex;
    gap: 4px;
  }

  .btn-transport {
    border: 1px solid rgba(237,232,220,0.45);
    background: transparent;
    color: var(--color-bg);
    padding: 4px 10px;
    font-size: 11px;
    transition: background 60ms linear, color 60ms linear;
  }
  .btn-transport:active,
  .btn-transport.active {
    background: var(--color-bg);
    color: var(--color-fg);
  }

  /* ── REC button (ADR 085) ── */
  .btn-rec {
    border: 1px solid rgba(237,232,220,0.45);
    background: transparent;
    color: rgba(237,232,220,0.55);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    transition: background 60ms linear, color 60ms linear, border-color 60ms linear;
  }
  .btn-rec:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }
  .btn-rec.armed {
    color: var(--color-salmon);
    border-color: color-mix(in srgb, var(--color-salmon) 50%, transparent);
    background: transparent;
    animation: rec-blink 1s step-end infinite;
  }
  .btn-rec.active {
    color: var(--color-salmon);
    border-color: color-mix(in srgb, var(--color-salmon) 50%, transparent);
    background: color-mix(in srgb, var(--color-salmon) 10%, transparent);
    animation: rec-pulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes rec-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes rec-pulse {
    from { opacity: 1; }
    to { opacity: 0.6; }
  }

  /* ── Separator ── */
  .sep {
    width: 1px;
    height: 28px;
    background: rgba(237,232,220,0.12);
    flex-shrink: 0;
  }

  /* ── View toggle ── */
  .view-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-view {
    border: 1.5px solid rgba(237,232,220,0.35);
    background: rgba(237,232,220,0.04);
    color: rgba(237,232,220,0.55);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear, border-color 40ms linear;
    user-select: none;
  }
  .btn-view:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }
  .btn-view.active {
    background: rgba(237,232,220,0.14);
    color: rgba(237,232,220,0.90);
    border-color: rgba(237,232,220,0.50);
  }

  /* ── Performance buttons ── */
  .perf-btns {
    display: flex;
    align-items: center;
    gap: 4px;
  }


  /* ── Mobile ── */
  @media (max-width: 639px) {
    .sub-header,
    .compact .sub-header {
      height: auto;
      padding: 0;
      gap: 0;
      flex-wrap: wrap;
    }

    /* Row 1: BPM + transport + knobs + pat */
    .bpm-block {
      padding: 4px 0 4px 8px;
    }
    .bpm-value { font-size: 14px; }
    .bpm-input { font-size: 14px; }
    .bpm-adj { width: 20px; height: 20px; font-size: 12px; }
    .bpm-label { display: none; }

    .sep { display: none; }

    /* Hide perf-btns on mobile (moved to PerfBubble) */
    .perf-btns { display: none; }

    /* Mobile transport */
    .transport {
      display: flex;
      gap: 3px;
      order: 10;
      align-items: center;
      margin-left: 10px;
    }
    .btn-transport {
      border: 1px solid rgba(237,232,220,0.45);
      background: transparent;
      color: var(--color-bg);
      padding: 0 12px;
      height: 28px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-transport:active,
    .btn-transport.active {
      background: var(--color-bg);
      color: var(--color-fg);
    }

    /* Row 2: full-width tab bar */
    .view-toggle {
      order: 20;
      width: 100%;
      display: flex;
      gap: 0;
      border-top: 1px solid rgba(237,232,220,0.12);
    }
    .btn-view {
      flex: 1;
      padding: 6px 0;
      font-size: 9px;
      text-align: center;
      border: none;
      border-bottom: 2px solid transparent;
      color: rgba(237,232,220,0.35);
    }
    .btn-view:not(:last-child) { border-right: 1px solid rgba(237,232,220,0.08); }
    .btn-view.active {
      color: rgba(237,232,220,0.90);
      border-bottom-color: var(--color-olive);
      background: rgba(237,232,220,0.06);
    }
  }
</style>
