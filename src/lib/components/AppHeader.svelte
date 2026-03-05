<script lang="ts">
  import { song, playback, ui, toggleSidebar } from '../state.svelte.ts'
  import { PROJECT_NAME } from '../constants.ts'
  import SplitFlap from './SplitFlap.svelte'
  import Oscilloscope from './Oscilloscope.svelte'

  interface Props {
    onPlay: () => void
    onStop: () => void
    onRandom: () => void
    compact?: boolean
  }
  let { onPlay, onStop, onRandom, compact = false }: Props = $props()

  function handleHelp() {
    toggleSidebar('help')
  }

  function handleSystem() {
    toggleSidebar('system')
  }

  // ── Long-press auto-repeat for BPM ±buttons ──
  let bpmRepeatTimer: ReturnType<typeof setTimeout> | null = null
  let bpmRepeatInterval: ReturnType<typeof setInterval> | null = null

  function bpmStep(dir: -1 | 1) {
    song.bpm = Math.max(40, Math.min(240, song.bpm + dir))
  }

  function startBpmRepeat(dir: -1 | 1) {
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
    {#if compact}
      <div class="transport-center">
        <button
          class="btn-transport"
          class:active={playback.playing}
          onpointerdown={onPlay}
          aria-label="Play"
        >▶</button>
        <button
          class="btn-transport"
          onpointerdown={onStop}
          aria-label="Stop"
        >■</button>
        <button
          class="btn-rand"
          onpointerdown={onRandom}
          aria-label="Randomize"
        >RAND</button>
      </div>
      <button
        class="btn-help-mobile"
        class:active={ui.sidebar === 'help'}
        onpointerdown={() => toggleSidebar('help')}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
    {/if}
    {#if !compact}
      <button
        class="btn-help-desktop"
        class:active={ui.sidebar === 'help'}
        onpointerdown={handleHelp}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
    {/if}
    <button
      class="btn-system"
      class:active={ui.sidebar === 'system'}
      onpointerdown={handleSystem}
      aria-label="System settings"
      data-tip="System settings" data-tip-ja="システム設定"
    >&#x2699;</button>
  </header>

  <!-- Sub header: BPM, transport, pattern -->
  <div class="sub-header">
    <div class="bpm-block">
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(-1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Decrease tempo (hold to scroll)" data-tip-ja="テンポを下げる (長押しでスクロール)">−</button>
      <span class="bpm-value" data-tip="Current tempo (BPM)" data-tip-ja="現在のテンポ (BPM)"><SplitFlap value={song.bpm} /></span>
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Increase tempo (hold to scroll)" data-tip-ja="テンポを上げる (長押しでスクロール)">+</button>
      <span class="bpm-label">BPM</span>
    </div>

    <div class="transport">
      <button
        class="btn-transport"
        class:active={playback.playing}
        onpointerdown={onPlay}
        aria-label="Play"
        data-tip="Play pattern" data-tip-ja="パターンを再生"
      >▶</button>
      <button
        class="btn-transport"
        onpointerdown={onStop}
        aria-label="Stop"
        data-tip="Stop playback" data-tip-ja="再生を停止"
      >■</button>
      <button
        class="btn-rand"
        onpointerdown={onRandom}
        aria-label="Randomize"
        data-tip="Randomize pattern" data-tip-ja="パターンをランダム生成"
      >RAND</button>
    </div>

    <div class="pat-block">
      <div class="pat-display">
        <span class="pat-name"><SplitFlap value={PROJECT_NAME} width={8} /></span>
      </div>
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

  .btn-help-mobile {
    position: absolute;
    right: 42px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 13px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-help-mobile:active,
  .btn-help-mobile.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  .btn-help-desktop {
    position: absolute;
    right: 42px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 13px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-help-desktop:active,
  .btn-help-desktop.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  .btn-system {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 14px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-system:active,
  .btn-system.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
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
    font-size: 36px;
    line-height: 1;
    color: var(--color-bg);
  }
  .compact .bpm-value { font-size: 26px; }

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

  .btn-rand {
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 4px 8px;
    font-size: 9px;
    letter-spacing: 0.08em;
    transition: background 60ms linear, color 60ms linear;
  }
  .btn-rand:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── Pattern block ── */
  .pat-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
  }
  .pat-display {
    display: flex;
    align-items: center;
  }
  .pat-name {
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.5);
    transform: translateY(2px);
  }
  .compact .pat-name { font-size: 18px; }

  /* ── Transport center (mobile app-header) ── */
  .transport-center {
    display: none;
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    /* Transport moved to PerfBar on mobile */
    .transport-center { display: none; }
    .transport { display: none; }

    .sub-header,
    .compact .sub-header {
      height: auto;
      padding: 4px 8px;
      gap: 4px;
    }
    .bpm-value { font-size: 22px; }
    .bpm-adj { width: 20px; height: 20px; font-size: 12px; }
    .bpm-label { display: none; }
    /* BPM + pat side by side */
    .pat-block {
      margin-left: auto;
      align-items: flex-end;
      gap: 2px;
    }
    .pat-name { font-size: 14px; }
  }
</style>
