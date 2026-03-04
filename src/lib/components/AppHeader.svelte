<script lang="ts">
  import { song, playback, ui, toggleSidebar, selectSection, getActiveSectionName } from '../state.svelte.ts'
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
    if (compact) {
      toggleSidebar('help')
    } else {
      ui.dockTab = ui.dockTab === 'help' ? 'param' : 'help'
    }
  }

  function handleSystem() {
    if (compact) {
      toggleSidebar('system')
    } else {
      ui.dockTab = ui.dockTab === 'sys' ? 'param' : 'sys'
    }
  }

  const displayNum = $derived(String(ui.currentSection).padStart(2, '0'))
  const displayName = $derived(getActiveSectionName())

  // ── Long-press auto-repeat for ◀/▶ buttons ──
  let repeatTimer: ReturnType<typeof setTimeout> | null = null
  let repeatInterval: ReturnType<typeof setInterval> | null = null

  function startRepeat(dir: -1 | 1) {
    selectSection(ui.currentSection + dir)
    repeatTimer = setTimeout(() => {
      repeatInterval = setInterval(() => selectSection(ui.currentSection + dir), 100)
    }, 400)
  }

  function stopRepeat() {
    if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null }
    if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null }
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
        class:active={ui.dockTab === 'help'}
        onpointerdown={handleHelp}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
    {/if}
    <button
      class="btn-system"
      class:active={compact ? ui.sidebar === 'system' : ui.dockTab === 'sys'}
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
        <button class="pat-adj" onpointerdown={() => startRepeat(-1)} onpointerup={stopRepeat} onpointerleave={stopRepeat} data-tip="Previous section (hold to scroll)" data-tip-ja="前のセクション (長押しでスクロール)">◀</button>
        <span class="pat-value" data-tip="Current section" data-tip-ja="現在のセクション"><SplitFlap value={displayNum} width={2} /></span>
        <span class="pat-sep" aria-hidden="true">|</span>
        <span class="pat-name"><SplitFlap value={displayName} width={8} /></span>
        <button class="pat-adj" onpointerdown={() => startRepeat(1)} onpointerup={stopRepeat} onpointerleave={stopRepeat} data-tip="Next section (hold to scroll)" data-tip-ja="次のセクション (長押しでスクロール)">▶</button>
      </div>
      <div class="pat-bottom">
        <span class="pat-label">SEC</span>
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
  .pat-bottom {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pat-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.35);
    text-transform: uppercase;
  }
  .pat-actions {
    display: flex;
    gap: 2px;
  }
  .pat-act {
    border: 1px solid rgba(237,232,220,0.2);
    background: transparent;
    color: rgba(237,232,220,0.4);
    font-size: 8px;
    letter-spacing: 0.06em;
    padding: 1px 4px;
    line-height: 1.2;
  }
  .pat-act:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.8);
  }
  .pat-act.disabled {
    opacity: 0.25;
    pointer-events: none;
  }
  .pat-display {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pat-adj {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.6);
    width: 22px;
    height: 22px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pat-adj:active { background: rgba(237,232,220,0.15); }
  .pat-sep {
    font-size: 20px;
    color: rgba(237,232,220,0.15);
    line-height: 1;
    margin: 0 2px;
  }
  .compact .pat-sep { font-size: 16px; }
  .pat-value {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: var(--color-bg);
    transform: translateY(2px);
  }
  .compact .pat-value { font-size: 20px; }
  .pat-value.pending {
    animation: pat-blink 400ms ease-in-out infinite;
  }
  .pat-name {
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.5);
    transform: translateY(2px);
  }
  .compact .pat-name { font-size: 18px; }

  /* ── Pat radial menu ── */
  .pat-menu-wrap {
    position: relative;
    display: none; /* shown on mobile only */
  }
  .pat-menu-trigger {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.5);
    font-size: 14px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    position: relative;
    z-index: 52;
    transition: background 150ms, color 150ms;
  }
  .pat-menu-wrap.open .pat-menu-trigger {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.9);
  }
  .pat-menu-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.25);
    z-index: 50;
    border: none;
  }
  .pat-menu-item {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.85);
    background: var(--color-fg);
    border: 1px solid rgba(237,232,220,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 51;
    /* Closed: collapsed to trigger center */
    top: -6px;
    left: -6px;
    transform: scale(0);
    opacity: 0;
    transition: all 150ms cubic-bezier(0.2, 0, 0.4, 1.3);
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }
  .pat-menu-item:active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .pat-menu-item.disabled {
    opacity: 0.2;
    pointer-events: none;
  }
  /* Fan out down-left from trigger */
  .pat-menu-wrap.open .pat-menu-item {
    transform: scale(1);
    opacity: 1;
  }
  .pat-menu-wrap.open .pat-menu-item:nth-child(1) {
    top: -20px;
    left: -48px;
    transition-delay: 0ms;
  }
  .pat-menu-wrap.open .pat-menu-item:nth-child(2) {
    top: 16px;
    left: -52px;
    transition-delay: 30ms;
  }
  .pat-menu-wrap.open .pat-menu-item:nth-child(3) {
    top: 48px;
    left: -38px;
    transition-delay: 60ms;
  }

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
    .pat-display {
      gap: 3px;
    }
    .pat-adj { width: 20px; height: 20px; font-size: 10px; }
    .pat-value { font-size: 16px; }
    .pat-name { font-size: 14px; }
    .pat-sep { font-size: 14px; }
    /* Hide inline actions on mobile, use bubble menu instead */
    .pat-bottom { display: none; }
    .pat-menu-wrap { display: block; }
    .pat-act {
      font-size: 8px;
      padding: 2px 6px;
    }
  }

  @keyframes pat-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }
</style>
