<script lang="ts">
  import { pattern, playback, switchPattern, patternNav } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'

  interface Props {
    onPlay: () => void
    onStop: () => void
    onRandom: () => void
    compact?: boolean
  }
  let { onPlay, onStop, onRandom, compact = false }: Props = $props()

  const displayPatId = $derived(patternNav.pendingId > 0 ? patternNav.pendingId : pattern.id)
  const displayNum = $derived(String(displayPatId - 1).padStart(2, '0'))
  const isPending = $derived(patternNav.pendingId > 0)
</script>

<div class="header-wrap" class:compact>
  <!-- Top bar: logo only -->
  <header class="app-header">
    <div class="geo-circle" aria-hidden="true"></div>
    {#if !compact}
      <span class="app-name">INBOIL</span>
    {/if}
    <div class="geo-rects" aria-hidden="true">
      <div class="rect-a"></div>
      <div class="rect-b"></div>
    </div>
  </header>

  <!-- Sub header: BPM, transport, pattern -->
  <div class="sub-header">
    <div class="bpm-block">
      <button class="bpm-adj" onpointerdown={() => { pattern.bpm = Math.max(40, pattern.bpm - 1) }}>−</button>
      <span class="bpm-value"><SplitFlap value={pattern.bpm} /></span>
      <button class="bpm-adj" onpointerdown={() => { pattern.bpm = Math.min(240, pattern.bpm + 1) }}>+</button>
      <span class="bpm-label">BPM</span>
    </div>

    <div class="transport">
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

    <div class="pat-block">
      <span class="pat-label">PAT</span>
      <div class="pat-display">
        <button class="pat-adj" onpointerdown={() => { switchPattern(pattern.id - 1) }}>◀</button>
        <span class="pat-value" class:pending={isPending}><SplitFlap value={displayNum} width={2} /></span>
        <span class="pat-sep" aria-hidden="true">|</span>
        <span class="pat-name"><SplitFlap value={pattern.name} width={7} /></span>
        <button class="pat-adj" onpointerdown={() => { switchPattern(pattern.id + 1) }}>▶</button>
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

  /* ── Top bar (logo) ── */
  .app-header {
    position: relative;
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 12px 0 8px;
    background: var(--color-fg);
    color: var(--color-bg);
    overflow: hidden;
  }
  .compact .app-header { height: 22px; }

  .geo-circle {
    position: absolute;
    left: -22px;
    top: 50%;
    transform: translateY(-50%);
    width: 76px;
    height: 76px;
    border-radius: 50%;
    background: var(--color-olive);
    opacity: 0.3;
    pointer-events: none;
  }

  .app-name {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
    margin-left: 38px;
  }

  .geo-rects {
    position: absolute;
    right: 76px;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    pointer-events: none;
    opacity: 0.18;
  }
  .rect-a { width: 28px; height: 10px; background: var(--color-blue); }
  .rect-b { width: 16px; height: 10px; background: var(--color-blue); }

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
    align-items: baseline;
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
    align-self: flex-end;
    padding-bottom: 2px;
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
  .pat-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.35);
    text-transform: uppercase;
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
  }
  .compact .pat-value { font-size: 20px; }
  .pat-value.pending {
    animation: pat-blink 400ms ease-in-out infinite;
  }
  .pat-name {
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.5);
  }
  .compact .pat-name { font-size: 18px; }
  @keyframes pat-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }
</style>
