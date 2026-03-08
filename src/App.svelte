<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import DockPanel from './lib/components/DockPanel.svelte'

  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import SectionNav from './lib/components/SectionNav.svelte'
  import MatrixView from './lib/components/MatrixView.svelte'
  import TrackerView from './lib/components/TrackerView.svelte'
  import SceneView from './lib/components/SceneView.svelte'
  import FxPad from './lib/components/FxPad.svelte'
  import FilterView from './lib/components/FilterView.svelte'
  import MasterView from './lib/components/MasterView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PerfBubble from './lib/components/PerfBubble.svelte'
  import PatternToolbar from './lib/components/PatternToolbar.svelte'
  import { song, playback, ui, prefs, randomizePattern, perf, fxPad, advanceSection, applySection, updateSectionPerf, hasScenePlayback, advanceSceneNode, soloPatternIndex, undo, redo, projectAutoSave, projectRestore } from './lib/state.svelte.ts'
  import { hasArrangement } from './lib/sectionActions.ts'
  import { engine } from './lib/audio/engine.ts'
  import { fade, fly } from 'svelte/transition'

  // ── Project restore (once) + save on page hide ───────────────────
  let restored = false
  $effect(() => {
    if (!restored) { restored = true; void projectRestore() }
    const onVisChange = () => { if (document.visibilityState === 'hidden') void projectAutoSave() }
    const onBeforeUnload = () => { void projectAutoSave() }
    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })

  // ── Responsive ────────────────────────────────────────────────────
  let windowWidth = $state(window.innerWidth)
  $effect(() => {
    const onResize = () => { windowWidth = window.innerWidth }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })
  const isMobile = $derived(windowWidth < 640)

  // ── Audio engine ──────────────────────────────────────────────────
  // Sync song (incl. effects) → worklet on any state change (rAF-throttled)
  let rafId = 0
  $effect(() => {
    void (JSON.stringify(song) + JSON.stringify(perf) + JSON.stringify(fxPad) + playback.currentSection + ui.currentPattern + playback.mode + playback.playingPattern + JSON.stringify([...ui.soloTracks]))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      const soloIdx = soloPatternIndex()
      if (soloIdx != null) {
        engine.sendPatternByIndex(song, perf, fxPad, false, soloIdx)
      } else if (playback.mode === 'scene' && hasScenePlayback()) {
        if (playback.playingPattern == null) return
        engine.sendPatternByIndex(song, perf, fxPad, false, playback.playingPattern)
      } else if (playback.mode === 'scene' && hasArrangement()) {
        engine.sendPattern(song, perf, fxPad, false, playback.currentSection)
      } else {
        engine.sendPatternByIndex(song, perf, fxPad, false, ui.currentPattern)
      }
    })
    return () => cancelAnimationFrame(rafId)
  })

  let soloSent: string | null = null // tracks which solo node was last sent to engine

  engine.onStep = (heads: number[], cycle: boolean) => {
    playback.playheads = heads
    // Solo node — only loop when scene has reached the target node
    if (playback.soloNodeId != null && playback.sceneNodeId === playback.soloNodeId) {
      if (cycle && playback.soloNodeId !== soloSent) {
        soloSent = playback.soloNodeId
        const idx = soloPatternIndex()
        if (idx != null) engine.sendPatternByIndex(song, perf, fxPad, true, idx)
      }
      return
    }
    if (playback.soloNodeId == null) soloSent = null
    // Loop mode — just loop current pattern, no advancement
    if (playback.mode !== 'scene') return
    if (cycle) {
      // Pattern cycle complete (all tracks finished) — scene graph takes priority
      if (hasScenePlayback()) {
        const { advanced, patternIndex, stop: shouldStop } = advanceSceneNode()
        if (shouldStop) { stop(); return }
        if (advanced) {
          perf.rootNote = playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)
          engine.sendPatternByIndex(song, perf, fxPad, true, patternIndex)
          // Check if we just arrived at the solo target
          if (playback.soloNodeId != null && playback.sceneNodeId === playback.soloNodeId) {
            soloSent = playback.soloNodeId
          }
        }
        return
      }
      // Fallback: linear section advancement
      const sectionAdvanced = advanceSection()
      if (hasArrangement()) {
        if (sectionAdvanced) applySection(song.sections[playback.currentSection])
        updateSectionPerf(heads[0])
        engine.sendPattern(song, perf, fxPad, true, playback.currentSection)
        return
      }
    }
    if (hasArrangement() && !hasScenePlayback()) {
      const changed = updateSectionPerf(heads[0])
      if (changed) {
        engine.sendPattern(song, perf, fxPad, false, playback.currentSection)
      }
    }
  }

  // Solo switching is handled in onStep at cycle boundary

  async function play() {
    if (playback.playing) return
    await engine.init()
    const soloIdx2 = soloPatternIndex()
    if (soloIdx2 != null) {
      soloSent = playback.soloNodeId
      engine.sendPatternByIndex(song, perf, fxPad, false, soloIdx2)
      engine.play()
      playback.playing = true
      return
    }
    // ADR 045: auto-engage scene mode — only when no sheet is covering the scene
    if (!hasSheet && (hasScenePlayback() || hasArrangement())) {
      playback.mode = 'scene'
    }
    if (playback.mode === 'scene' && hasScenePlayback()) {
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      playback.sceneAbsoluteKey = null
      const { patternIndex, stop: shouldStop } = advanceSceneNode()
      if (shouldStop) return
      perf.rootNote = playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)
      engine.sendPatternByIndex(song, perf, fxPad, false, patternIndex)
    } else if (playback.mode === 'scene' && hasArrangement()) {
      playback.repeatCount = 0
      applySection(song.sections[playback.currentSection])
      engine.sendPattern(song, perf, fxPad, false, playback.currentSection)
    } else {
      engine.sendPatternByIndex(song, perf, fxPad, false, ui.currentPattern)
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
    playback.soloNodeId = null
    playback.sceneNodeId = null
    playback.sceneEdgeId = null
    playback.sceneRepeatLeft = 0
    playback.sceneTranspose = 0
    playback.sceneAbsoluteKey = null
    playback.mode = 'loop'
    playback.playingPattern = null
    void projectAutoSave()
  }

  function closeAllSheets() {
    ui.patternSheet = false
    ui.phraseView = 'pattern'
  }

  function toggleLoop() {
    if (playback.mode === 'loop') {
      // Exit loop → re-engage scene if available
      if (hasScenePlayback() || hasArrangement()) {
        playback.mode = 'scene'
      }
    } else {
      playback.mode = 'loop'
      playback.soloNodeId = null
      playback.playingPattern = null
      if (playback.playing) {
        engine.sendPatternByIndex(song, perf, fxPad, false, ui.currentPattern)
      }
    }
  }

  const hasSheet = $derived(ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Escape' && hasSheet) { e.preventDefault(); closeAllSheets(); return }
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play() }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); redo() }
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} compact={true} />
    <SectionNav />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      <SceneView onplay={play} onstop={stop} />
      <!-- Overlay sheets (mobile) -->
      {#if ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
        <div class="pattern-sheet mobile" transition:fly={{ y: 12, duration: 100 }}>
          {#if ui.phraseView === 'fx'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-handle" onpointerdown={closeAllSheets}><span class="handle-bar"></span></div>
            <FxPad />
          {:else if ui.phraseView === 'eq'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-handle" onpointerdown={closeAllSheets}><span class="handle-bar"></span></div>
            <FilterView />
          {:else if ui.phraseView === 'master'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-handle" onpointerdown={closeAllSheets}><span class="handle-bar"></span></div>
            <MasterView />
          {:else}
            <PatternToolbar onRandom={randomizePattern} onClose={closeAllSheets} onLoop={toggleLoop} />
            {#if prefs.patternEditor === 'tracker'}
              <TrackerView />
            {:else}
              <MobileTrackView />
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    <PerfBubble />
  {:else}
    <AppHeader onPlay={play} onStop={stop} />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      <div class="view-content-row">
        <MatrixView />
        <div class="view-main">
          <SceneView onplay={play} onstop={stop} />
          <!-- Overlay sheets (desktop) -->
          {#if ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
            <div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
              {#if ui.phraseView === 'fx'}
                <FxPad />
              {:else if ui.phraseView === 'eq'}
                <FilterView />
              {:else if ui.phraseView === 'master'}
                <MasterView />
              {:else}
                <PatternToolbar onRandom={randomizePattern} onClose={closeAllSheets} onLoop={toggleLoop} />
                {#if prefs.patternEditor === 'tracker'}
                  <TrackerView />
                {:else}
                  <StepGrid />
                {/if}
              {/if}
            </div>
          {/if}
        </div>
        <DockPanel />
      </div>
    </div>
  {/if}
  <Sidebar />
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
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Pattern sheet overlay (ADR 054) ── */
  .sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.18);
    z-index: 50;
  }

  .pattern-sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 20%;
    z-index: 51;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-top: 1px solid rgba(237, 232, 220, 0.10);
    overflow: hidden;
  }

  .pattern-sheet.mobile {
    top: 25%;
  }

  .sheet-handle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    cursor: pointer;
  }

  .handle-bar {
    width: 28px;
    height: 3px;
    border-radius: 1.5px;
    background: rgba(237, 232, 220, 0.12);
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
