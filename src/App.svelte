<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import DockPanel from './lib/components/DockPanel.svelte'
  import PerfBar from './lib/components/PerfBar.svelte'
  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import SectionNav from './lib/components/SectionNav.svelte'
  import MatrixView from './lib/components/MatrixView.svelte'
  import TrackerView from './lib/components/TrackerView.svelte'
  import SceneView from './lib/components/SceneView.svelte'
  import FxPad from './lib/components/FxPad.svelte'
  import FilterView from './lib/components/FilterView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PerfBubble from './lib/components/PerfBubble.svelte'
  import { song, playback, ui, prefs, randomizePattern, effects, perf, fxPad, hasArrangement, advanceSection, applySection, updateSectionPerf, hasScenePlayback, advanceSceneNode, undo, redo } from './lib/state.svelte.ts'
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
  // Sync song + effects → worklet on any state change (rAF-throttled)
  let rafId = 0
  $effect(() => {
    void (JSON.stringify(song) + JSON.stringify(effects) + JSON.stringify(perf) + JSON.stringify(fxPad) + playback.currentSection + ui.currentPattern + playback.mode + JSON.stringify([...ui.soloTracks]))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      if (playback.soloPattern != null) {
        engine.sendPatternByIndex(song, effects, perf, fxPad, false, playback.soloPattern)
      } else if (playback.mode === 'scene' && hasScenePlayback()) {
        engine.sendPattern(song, effects, perf, fxPad, false, playback.currentSection)
      } else if (playback.mode === 'scene' && hasArrangement()) {
        engine.sendPattern(song, effects, perf, fxPad, false, playback.currentSection)
      } else {
        engine.sendPatternByIndex(song, effects, perf, fxPad, false, ui.currentPattern)
      }
    })
    return () => cancelAnimationFrame(rafId)
  })

  engine.onStep = (heads: number[]) => {
    const prev0 = playback.playheads[0]
    playback.playheads = heads
    // Solo pattern — just loop, no advancement
    if (playback.soloPattern != null) return
    // Loop mode — just loop current pattern, no advancement
    if (playback.mode !== 'scene') return
    if (heads[0] === 0 && prev0 !== 0) {
      // Beat boundary — scene graph takes priority
      if (hasScenePlayback()) {
        const { advanced, patternIndex } = advanceSceneNode()
        if (advanced) {
          perf.rootNote = song.rootNote + playback.sceneTranspose
          engine.sendPatternByIndex(song, effects, perf, fxPad, true, patternIndex)
        }
        return
      }
      // Fallback: linear section advancement
      const sectionAdvanced = advanceSection()
      if (hasArrangement()) {
        if (sectionAdvanced) applySection(song.sections[playback.currentSection])
        updateSectionPerf(heads[0])
        engine.sendPattern(song, effects, perf, fxPad, true, playback.currentSection)
        return
      }
    }
    if (hasArrangement() && !hasScenePlayback()) {
      const changed = updateSectionPerf(heads[0])
      if (changed) {
        engine.sendPattern(song, effects, perf, fxPad, false, playback.currentSection)
      }
    }
  }

  // Reactive solo switching: when soloPattern changes during playback, send immediately
  $effect(() => {
    if (playback.soloPattern != null && playback.playing) {
      engine.sendPatternByIndex(song, effects, perf, fxPad, true, playback.soloPattern)
    }
  })

  async function play() {
    if (playback.playing) return
    await engine.init()
    if (playback.soloPattern != null) {
      engine.sendPatternByIndex(song, effects, perf, fxPad, false, playback.soloPattern)
      engine.play()
      playback.playing = true
      return
    }
    // ADR 045: auto-engage scene mode only when in scene view
    if (ui.phraseView === 'scene' && (hasScenePlayback() || hasArrangement())) {
      playback.mode = 'scene'
    }
    if (playback.mode === 'scene' && hasScenePlayback()) {
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      const { patternIndex } = advanceSceneNode()
      perf.rootNote = song.rootNote + playback.sceneTranspose
      engine.sendPatternByIndex(song, effects, perf, fxPad, false, patternIndex)
    } else if (playback.mode === 'scene' && hasArrangement()) {
      playback.repeatCount = 0
      applySection(song.sections[playback.currentSection])
      engine.sendPattern(song, effects, perf, fxPad, false, playback.currentSection)
    } else {
      engine.sendPatternByIndex(song, effects, perf, fxPad, false, ui.currentPattern)
    }
    engine.play()
    playback.playing = true
  }

  function stop() {
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
    // Clear perf & FX
    perf.filling = false; perf.breaking = false; perf.reversing = false
    fxPad.verb = { ...fxPad.verb, on: false }
    fxPad.delay = { ...fxPad.delay, on: false }
    fxPad.glitch = { ...fxPad.glitch, on: false }
    fxPad.granular = { ...fxPad.granular, on: false }
    // Clear solo & scene playback
    playback.soloPattern = null
    playback.sceneNodeId = null
    playback.sceneEdgeId = null
    playback.sceneRepeatLeft = 0
    playback.sceneTranspose = 0
    playback.mode = 'loop'
    playback.playingPattern = null
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play() }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); redo() }
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} compact={true} />
    <PerfBar onPlay={play} onStop={stop} onRandom={randomizePattern} />
    <SectionNav />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      {#if ui.phraseView === 'scene'}
        <SceneView />
      {:else if ui.phraseView === 'fx'}
        <FxPad />
      {:else if ui.phraseView === 'eq'}
        <FilterView />
      {:else if prefs.patternEditor === 'tracker'}
        <TrackerView />
      {:else}
        <MobileTrackView />
      {/if}
      <Sidebar />
    </div>
    <PerfBubble />
  {:else}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} />
    <PerfBar />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      <div class="view-content-row">
        {#if ui.phraseView === 'pattern' || ui.phraseView === 'scene'}
          <MatrixView />
        {/if}
        <div class="view-main">
          {#if ui.phraseView === 'scene'}
            <SceneView />
          {:else if ui.phraseView === 'fx'}
            <FxPad />
          {:else if ui.phraseView === 'eq'}
            <FilterView />
          {:else if prefs.patternEditor === 'tracker'}
            <TrackerView />
          {:else}
            <StepGrid />
          {/if}
        </div>
        <DockPanel />
      </div>
      <Sidebar />
    </div>
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

  .view-content-row {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }

  .view-main {
    flex: 1;
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
