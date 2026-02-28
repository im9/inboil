<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import ParamPanel from './lib/components/ParamPanel.svelte'
  import PerfBar from './lib/components/PerfBar.svelte'
  import FxPad from './lib/components/FxPad.svelte'
  import FilterView from './lib/components/FilterView.svelte'
  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import { pattern, playback, ui, randomizePattern, effects, perf, fxPad, applyPendingSwitch, clearPendingSwitch } from './lib/state.svelte.ts'
  import { engine } from './lib/audio/engine.ts'

  // ── Responsive ────────────────────────────────────────────────────
  let windowWidth = $state(window.innerWidth)
  $effect(() => {
    const onResize = () => { windowWidth = window.innerWidth }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })
  const isMobile = $derived(windowWidth < 640)

  // ── Audio engine ──────────────────────────────────────────────────
  // Sync pattern + effects → worklet on any state change (rAF-throttled)
  let rafId = 0
  $effect(() => {
    // JSON.stringify traverses all nested props so Svelte tracks them
    void (JSON.stringify(pattern) + JSON.stringify(effects) + JSON.stringify(perf) + JSON.stringify(fxPad))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      engine.sendPattern(pattern, effects, perf, fxPad)
    })
    return () => cancelAnimationFrame(rafId)
  })

  engine.onStep = (heads: number[]) => {
    const prev0 = playback.playheads[0]
    playback.playheads = heads  // single reactive notification instead of 8 individual mutations
    if (heads[0] === 0 && prev0 !== 0) applyPendingSwitch()
  }

  async function play() {
    if (playback.playing) return
    await engine.init()
    engine.sendPattern(pattern, effects, perf, fxPad)
    engine.play()
    playback.playing = true
  }

  function stop() {
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
    clearPendingSwitch()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play() }
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} compact={true} />
    <PerfBar />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      {#if ui.view === 'fx'}
        <FxPad />
      {:else if ui.view === 'eq'}
        <FilterView />
      {:else}
        <MobileTrackView />
      {/if}
    </div>
  {:else}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} />
    <PerfBar />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      {#if ui.view === 'fx'}
        <FxPad />
      {:else if ui.view === 'eq'}
        <FilterView />
      {:else}
        <StepGrid />
      {/if}
      <Sidebar />
    </div>
    <ParamPanel />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    overscroll-behavior: none;
  }

  .view-area {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Perf flash ── */
  .perf-flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    transition: opacity 350ms ease-out;
  }
  .perf-flash.on {
    opacity: 1;
    transition: opacity 40ms ease-in;
  }
  .perf-flash.fill { background: radial-gradient(ellipse at center, color-mix(in srgb, var(--color-blue) 18%, transparent) 0%, transparent 75%); }
  .perf-flash.rev  { background: radial-gradient(ellipse at center, color-mix(in srgb, var(--color-blue) 14%, transparent) 0%, transparent 75%); }
  .perf-flash.brk  { background: radial-gradient(ellipse at center, color-mix(in srgb, var(--color-salmon) 22%, transparent) 0%, transparent 75%); }
</style>
