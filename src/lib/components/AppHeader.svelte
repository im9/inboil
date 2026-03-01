<script lang="ts">
  import { pattern, playback, switchPattern, patternNav, getPatternName, ui, toggleSidebar, copyPattern, pastePattern, clearPattern, clipboard } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'
  import Oscilloscope from './Oscilloscope.svelte'

  interface Props {
    onPlay: () => void
    onStop: () => void
    onRandom: () => void
    compact?: boolean
  }
  let { onPlay, onStop, onRandom, compact = false }: Props = $props()

  const displayPatId = $derived(patternNav.pendingId > 0 ? patternNav.pendingId : pattern.id)
  const displayNum = $derived(String(displayPatId - 1).padStart(2, '0'))
  const displayName = $derived(patternNav.pendingId > 0 ? getPatternName(patternNav.pendingId) : pattern.name)
  const isPending = $derived(patternNav.pendingId > 0)

  // ── Long-press auto-repeat for ◀/▶ buttons ──
  let repeatTimer: ReturnType<typeof setTimeout> | null = null
  let repeatInterval: ReturnType<typeof setInterval> | null = null

  function startRepeat(dir: -1 | 1) {
    switchPattern(displayPatId + dir)
    repeatTimer = setTimeout(() => {
      repeatInterval = setInterval(() => switchPattern(displayPatId + dir), 100)
    }, 400) // 400ms initial delay, then 100ms repeat
  }

  function stopRepeat() {
    if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null }
    if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null }
  }

  // ── Long-press auto-repeat for BPM ±buttons ──
  let bpmRepeatTimer: ReturnType<typeof setTimeout> | null = null
  let bpmRepeatInterval: ReturnType<typeof setInterval> | null = null

  function bpmStep(dir: -1 | 1) {
    pattern.bpm = Math.max(40, Math.min(240, pattern.bpm + dir))
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
    {#if !compact}
      <span class="app-name">INBOIL</span>
    {/if}
    <button
      class="btn-system"
      class:active={ui.sidebar === 'system'}
      onpointerdown={() => toggleSidebar('system')}
      aria-label="System settings"
      data-tip="System settings" data-tip-ja="システム設定"
    >&#x2699;</button>
  </header>

  <!-- Sub header: BPM, transport, pattern -->
  <div class="sub-header">
    <div class="bpm-block">
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(-1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Decrease tempo (hold to scroll)" data-tip-ja="テンポを下げる (長押しでスクロール)">−</button>
      <span class="bpm-value" data-tip="Current tempo (BPM)" data-tip-ja="現在のテンポ (BPM)"><SplitFlap value={pattern.bpm} /></span>
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
      <div class="pat-top">
        <span class="pat-label">PAT</span>
        <div class="pat-actions">
          <button class="pat-act" onpointerdown={() => copyPattern()} data-tip="Copy pattern" data-tip-ja="パターンをコピー">CPY</button>
          <button class="pat-act" class:disabled={!clipboard.hasData} onpointerdown={() => { if (clipboard.hasData) pastePattern(pattern.id) }} data-tip="Paste pattern to current slot" data-tip-ja="現在のスロットにペースト">PST</button>
          <button class="pat-act" onpointerdown={() => clearPattern(pattern.id)} data-tip="Clear current pattern" data-tip-ja="現在のパターンをクリア">CLR</button>
        </div>
      </div>
      <div class="pat-display">
        <button class="pat-adj" onpointerdown={() => startRepeat(-1)} onpointerup={stopRepeat} onpointerleave={stopRepeat} data-tip="Previous pattern (hold to scroll)" data-tip-ja="前のパターン (長押しでスクロール)">◀</button>
        <span class="pat-value" class:pending={isPending} data-tip="Current pattern number" data-tip-ja="現在のパターン番号"><SplitFlap value={displayNum} width={2} /></span>
        <span class="pat-sep" aria-hidden="true">|</span>
        <span class="pat-name"><SplitFlap value={displayName} width={8} /></span>
        <button class="pat-adj" onpointerdown={() => startRepeat(1)} onpointerup={stopRepeat} onpointerleave={stopRepeat} data-tip="Next pattern (hold to scroll)" data-tip-ja="次のパターン (長押しでスクロール)">▶</button>
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

  .app-name {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
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
  .pat-top {
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
  @keyframes pat-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }
</style>
