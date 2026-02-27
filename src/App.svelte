<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import ParamPanel from './lib/components/ParamPanel.svelte'
  import PianoRoll from './lib/components/PianoRoll.svelte'
  import PerfBar from './lib/components/PerfBar.svelte'
  import FxPad from './lib/components/FxPad.svelte'
  import StepLane from './lib/components/StepLane.svelte'
  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import { pattern, playback, ui, isDrum, randomizePattern, effects, perf, fxPad, applyPendingSwitch, clearPendingSwitch } from './lib/state.svelte.ts'
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
  // Sync pattern + effects → worklet on any state change
  $effect(() => {
    // JSON.stringify traverses all nested props so Svelte tracks them
    const snap = JSON.stringify(pattern) + JSON.stringify(effects) + JSON.stringify(perf) + JSON.stringify(fxPad)
    void snap
    engine.sendPattern(pattern, effects, perf, fxPad)
  })

  engine.onStep = (heads: number[]) => {
    const prev0 = playback.playheads[0]
    for (let i = 0; i < heads.length; i++) playback.playheads[i] = heads[i]
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

  // ── Bottom panel (desktop) ────────────────────────────────────────
  const selectedTrack = $derived(pattern.tracks[ui.selectedTrack])
  const showPianoRoll = $derived(!isDrum(selectedTrack) && selectedTrack.bottomPanel === 'piano')
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} compact={true} />
    <PerfBar />
    {#if ui.view === 'fx'}
      <FxPad />
    {:else}
      <MobileTrackView />
    {/if}
  {:else}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} />
    <PerfBar />
    {#if ui.view === 'fx'}
      <FxPad />
    {:else}
      <StepGrid />
      <StepLane trackId={ui.selectedTrack} />
      {#if showPianoRoll}
        <PianoRoll trackId={ui.selectedTrack} />
      {/if}
    {/if}
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
</style>
