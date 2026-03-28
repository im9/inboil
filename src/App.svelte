<script lang="ts">
  // NOTE: Large file by design — engine lifecycle + playback orchestration + sweep automation + scene advancement are tightly coupled
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import DockPanel from './lib/components/DockPanel.svelte'

  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import MobileMatrixView from './lib/components/MobileMatrixView.svelte'
  import MobileSceneRibbon from './lib/components/MobileSceneRibbon.svelte'
  import MatrixView from './lib/components/MatrixView.svelte'
  import TrackerView from './lib/components/TrackerView.svelte'
  import SceneView from './lib/components/SceneView.svelte'
  import { dispatch, dispatchUp, registerKeyLayer, unregisterKeyLayer } from './lib/keyRouter.ts'
  import FxPad from './lib/components/FxPad.svelte'
  import FilterView from './lib/components/FilterView.svelte'
  import MasterView from './lib/components/MasterView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import MobilePerfSheet from './lib/components/MobilePerfSheet.svelte'
  import PatternToolbar from './lib/components/PatternToolbar.svelte'
  import SweepCanvas from './lib/components/SweepCanvas.svelte'
  import TonnetzSheet from './lib/components/TonnetzSheet.svelte'
  import QuantizerSheet from './lib/components/QuantizerSheet.svelte'
  import TuringSheet from './lib/components/TuringSheet.svelte'
  import SweepTrailStrip from './lib/components/SweepTrailStrip.svelte'
  import { findSweepNodeForPattern } from './lib/sceneActions.ts'
  import { markScenePlayStart } from './lib/scenePlayback.ts'
  import ErrorToast from './lib/components/ErrorToast.svelte'
  import ErrorDialog from './lib/components/ErrorDialog.svelte'
  import WelcomeOverlay from './lib/components/WelcomeOverlay.svelte'
  import { song, songVer, playback, ui, prefs, session, randomizePattern, perf, fxPad, fxFlavours, masterPad, masterLevels, hasScenePlayback, advanceSceneNode, restoreAutomationSnapshot, soloPatternIndex, undo, redo, projectAutoSave, projectRestore, projectLoadDemo, writeRecoverySnapshot, initPool, setPlayFromNodeCallback } from './lib/state.svelte.ts'
  import { applySweepStep } from './lib/scenePlayback.ts'
  import { sweepRec, stopRecording } from './lib/sweepRecorder.svelte.ts'
  import { cellCopy, cellPaste, patternCopy, patternPaste, patternClear } from './lib/sectionActions.ts'
  import { engine, type EngineContext } from './lib/audio/engine.ts'
  import { setSignalingUrl, initHostHandlers, setHostTransportCallbacks, sendSnapshot, sendPlayhead, setOnGuestConnected, initGuestHandlers, disconnect, setOnError } from './lib/multiDevice/index.ts'
  import { syncDelta, resetDeltaSync } from './lib/multiDevice/deltaSync.ts'
  import { showToast } from './lib/toast.svelte.ts'

  const engineCtx: EngineContext = $derived({
    fxFlavours,
    masterPad,
    soloTracks: ui.soloTracks,
  })
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'

  // ── Project restore (once) + save on page hide ───────────────────
  let restored = false
  $effect(() => {
    if (!restored) { restored = true; void projectRestore(); void initPool() }
    const onVisChange = () => { if (document.visibilityState === 'hidden') { writeRecoverySnapshot(); void projectAutoSave() } }
    const onBeforeUnload = () => {
      writeRecoverySnapshot(); void projectAutoSave()
      if (session.role !== 'solo') { disconnect(); resetDeltaSync() }
    }
    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })

  // ── Multi-device (ADR 019) ───────────────────────────────────────
  const sigUrl = import.meta.env.VITE_SIGNALING_URL
  if (sigUrl) setSignalingUrl(sigUrl)
  initHostHandlers()
  initGuestHandlers()
  setOnGuestConnected(() => sendSnapshot())
  setOnError((msg) => showToast(msg, 'warn'))

  // ── Responsive ────────────────────────────────────────────────────
  let windowWidth = $state(window.innerWidth)
  $effect(() => {
    const onResize = () => { windowWidth = window.innerWidth }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })
  const isMobile = $derived(windowWidth < 640)

  // ── Audio engine pre-warm ────────────────────────────────────────
  // Init AudioContext on first user interaction so it's ready by play time
  let enginePrewarmed = false
  function prewarmEngine() {
    if (enginePrewarmed) return
    enginePrewarmed = true
    void engine.init({ onLevels: (peakL, peakR, gr, cpu) => { masterLevels.peakL = peakL; masterLevels.peakR = peakR; masterLevels.gr = gr; masterLevels.cpu = cpu } })
    document.removeEventListener('pointerdown', prewarmEngine)
  }
  document.addEventListener('pointerdown', prewarmEngine, { once: true })

  // ── Audio engine ──────────────────────────────────────────────────
  // Sync song (incl. effects) → worklet on any state change
  // During playback: send immediately (Svelte effect batching is sufficient)
  // Stopped: rAF-throttled to avoid unnecessary work
  let rafId = 0
  $effect(() => {
    // Touch reactive deps without string allocation (perf/fxPad are $state proxies)
    void songVer.v; void ui.currentPattern; void playback.mode; void playback.playingPattern
    for (const v of Object.values(perf)) void v
    for (const k of ['verb', 'delay', 'glitch', 'granular', 'filter', 'eqLow', 'eqMid', 'eqHigh'] as const)
      for (const v of Object.values(fxPad[k])) void v
    for (const _ of ui.soloTracks) void _
    const sendPattern = () => {
      const soloIdx = soloPatternIndex()
      if (soloIdx != null) {
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, soloIdx)
      } else if (playback.mode === 'scene' && playback.playingPattern != null) {
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, playback.playingPattern)
      } else {
        const idx = (playback.playing && playback.playingPattern != null) ? playback.playingPattern : ui.currentPattern
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, idx)
      }
      // Broadcast song deltas to connected guests
      if (session.role === 'host') syncDelta(song)
    }
    if (playback.playing) {
      // During playback, send immediately to avoid stale trig data on live edits
      cancelAnimationFrame(rafId)
      sendPattern()
    } else {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(sendPattern)
    }
    return () => cancelAnimationFrame(rafId)
  })

  // ── Loop-mode modifier application (ADR 093) ───────────────
  // Apply modifier nodes (transpose, FX) connected to the current pattern in loop mode
  // so edits are heard without switching to scene playback.
  // Skips tempo (user controls BPM directly) and repeat (meaningless in loop).
  function applyLoopModifiers(): void {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return
    const patNode = song.scene.nodes.find(n => n.type === 'pattern' && n.patternId === pat.id)
    const patKey = pat.rootNote ?? song.rootNote
    if (!patNode) {
      perf.rootNote = patKey
      return
    }
    // Walk backward through incoming modifier node edges
    let transpose = 0
    let absKey: number | null = null
    const visited = new Set<string>()
    let currentId = patNode.id
    while (true) {
      const inEdge = song.scene.edges.find(e => e.to === currentId)
      if (!inEdge) break
      const src = song.scene.nodes.find(n => n.id === inEdge.from)
      if (!src?.modifierParams || visited.has(src.id)) break
      visited.add(src.id)
      const fp = src.modifierParams
      if (fp.transpose) {
        if (fp.transpose.mode === 'abs') absKey = fp.transpose.key ?? 0
        else transpose += fp.transpose.semitones
      }
      if (fp.fx) {
        fxPad.verb.on = fp.fx.verb
        fxPad.delay.on = fp.fx.delay
        fxPad.glitch.on = fp.fx.glitch
        fxPad.granular.on = fp.fx.granular
        if (fp.fx.flavourOverrides) {
          if (fp.fx.flavourOverrides.verb)     fxFlavours.verb     = fp.fx.flavourOverrides.verb
          if (fp.fx.flavourOverrides.delay)    fxFlavours.delay    = fp.fx.flavourOverrides.delay
          if (fp.fx.flavourOverrides.glitch)   fxFlavours.glitch   = fp.fx.flavourOverrides.glitch
          if (fp.fx.flavourOverrides.granular) fxFlavours.granular = fp.fx.flavourOverrides.granular
        }
      }
      currentId = src.id
    }
    const raw = absKey ?? (patKey + transpose)
    perf.rootNote = ((raw % 12) + 12) % 12
  }

  // Reactively apply modifier nodes when playing in loop mode
  $effect(() => {
    if (playback.mode !== 'loop' || !playback.playing) return
    applyLoopModifiers()
  })

  let soloSent: string | null = null // tracks which solo node was last sent to engine

  engine.onStep = (heads: number[], cycle: boolean) => {
    playback.playheads = heads
    // Sweep automation — apply on every step (ADR 118)
    if (playback.mode === 'scene' && playback.playing) {
      const patIdx = playback.playingPattern ?? 0
      const pat = song.patterns[patIdx]
      // Use the longest track's step count as cycle length; find its playhead for position
      const stepsArr = pat ? pat.cells.map(c => c.steps) : [16]
      const maxSteps = Math.max(...stepsArr)
      const longestTrackIdx = stepsArr.indexOf(maxSteps)
      const currentStep = heads[longestTrackIdx] ?? 0
      const changed = applySweepStep(currentStep, maxSteps)
      if (changed) {
        // Re-send pattern to worklet with updated track params (no reset to keep playhead)
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, patIdx)
      }
    }
    // Broadcast playhead to connected guests
    if (session.role === 'host') sendPlayhead()
    // Solo node — only loop when scene has reached the target node
    if (playback.soloNodeId != null && playback.sceneNodeId === playback.soloNodeId) {
      if (cycle && playback.soloNodeId !== soloSent) {
        soloSent = playback.soloNodeId
        const idx = soloPatternIndex()
        if (idx != null) engine.sendPatternByIndex(song, perf, fxPad, engineCtx, true, idx)
      }
      return
    }
    if (playback.soloNodeId == null) soloSent = null
    // Loop mode — queue-based pattern switching at cycle boundary
    if (playback.mode !== 'scene') {
      if (cycle && playback.queuedPattern != null) {
        const next = playback.queuedPattern
        playback.playingPattern = next
        playback.queuedPattern = null
        applyLoopModifiers()
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, true, next)
      }
      return
    }
    if (cycle) {
      // Pattern cycle complete (all tracks finished) — scene takes priority
      if (hasScenePlayback()) {
        const { advanced, patternIndex, stop: shouldStop } = advanceSceneNode()
        if (shouldStop) { stop(); return }
        if (advanced) {
          const scenePatKey = song.patterns[patternIndex]?.rootNote ?? song.rootNote
          perf.rootNote = ((playback.sceneAbsoluteKey ?? (scenePatKey + playback.sceneTranspose)) % 12 + 12) % 12
          engine.sendPatternByIndex(song, perf, fxPad, engineCtx, true, patternIndex)
          // Check if we just arrived at the solo target
          if (playback.soloNodeId != null && playback.sceneNodeId === playback.soloNodeId) {
            soloSent = playback.soloNodeId
          }
        }
        return
      }
    }
  }

  // Solo switching is handled in onStep at cycle boundary

  async function play(startFromNode?: string) {
    if (playback.playing) return
    await engine.init({ onLevels: (peakL, peakR, gr, cpu) => { masterLevels.peakL = peakL; masterLevels.peakR = peakR; masterLevels.gr = gr; masterLevels.cpu = cpu } })
    const soloIdx2 = soloPatternIndex()
    if (soloIdx2 != null && !startFromNode) {
      soloSent = playback.soloNodeId
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, soloIdx2)
      await engine.play()
      playback.playing = true
      return
    }
    // ADR 045: auto-engage scene mode — desktop only (mobile has no scene view)
    if (startFromNode) {
      playback.mode = 'scene'
    } else if (isMobile) {
      playback.mode = 'loop'
    } else if (!hasSheet && hasScenePlayback()) {
      playback.mode = 'scene'
    }
    if (playback.mode === 'scene' && (hasScenePlayback() || startFromNode)) {
      markScenePlayStart()
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      playback.sceneAbsoluteKey = null
      const { patternIndex, stop: shouldStop } = advanceSceneNode(startFromNode)
      if (shouldStop) {
        // Scene can't advance (e.g. root has no outgoing edges) — fall back to loop
        playback.mode = 'loop'
        applyLoopModifiers()
        playback.playingPattern = ui.currentPattern
        playback.queuedPattern = null
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, ui.currentPattern)
        await engine.play()
        playback.playing = true
        return
      }
      const initPatKey = song.patterns[patternIndex]?.rootNote ?? song.rootNote
      perf.rootNote = ((playback.sceneAbsoluteKey ?? (initPatKey + playback.sceneTranspose)) % 12 + 12) % 12
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, patternIndex)
    } else {
      applyLoopModifiers()
      playback.playingPattern = ui.currentPattern
      playback.queuedPattern = null
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, ui.currentPattern)
    }
    await engine.play()
    playback.playing = true
  }

  function stop() {
    const wasRecording = sweepRec.state === 'recording'
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
    // Clear perf & FX
    perf.filling = false; perf.breaking = false; perf.reversing = false
    perf.reverbHold = false; perf.delayHold = false; perf.glitchHold = false; perf.granularHold = false
    fxPad.verb.on = false
    fxPad.delay.on = false
    fxPad.glitch.on = false
    fxPad.granular.on = false
    // Clear solo & scene playback
    playback.soloNodeId = null
    playback.sceneNodeId = null
    playback.sceneEdgeId = null
    playback.sceneRepeatLeft = 0
    playback.sceneTranspose = 0
    playback.sceneAbsoluteKey = null
    if (playback.automationSnapshot) {
      restoreAutomationSnapshot(playback.automationSnapshot)
      playback.automationSnapshot = null
    }
    playback.mode = 'loop'
    playback.playingPattern = null
    playback.queuedPattern = null
    // Save sweep recording AFTER engine is fully stopped (ADR 123)
    if (wasRecording) {
      try { stopRecording() } catch (e) { console.error('[sweep] stopRecording failed:', e) }
    }
    void projectAutoSave()
  }

  // Register transport callbacks for multi-device host
  setHostTransportCallbacks(play, stop)
  // Register play-from-node callback for SceneView
  setPlayFromNodeCallback((nodeId: string) => {
    if (playback.playing) stop()
    void play(nodeId)
  })

  function closeAllSheets() {
    ui.patternSheet = false
    ui.phraseView = 'pattern'
    ui.sweepTab = false
    ui.tonnetzNodeId = null
    ui.quantizerNodeId = null
    ui.turingNodeId = null
  }

  function toggleLoop() {
    if (playback.mode === 'loop') {
      // Exit loop → re-engage scene if available
      if (hasScenePlayback()) {
        playback.mode = 'scene'
      }
    } else {
      playback.mode = 'loop'
      playback.soloNodeId = null
      playback.playingPattern = null
      if (playback.playing) {
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, ui.currentPattern)
      }
    }
  }

  const hasSheet = $derived(ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master' || ui.phraseView === 'perf' || ui.phraseView === 'tonnetz' || ui.phraseView === 'quantizer' || ui.phraseView === 'turing')

  // ── Keyboard routing (ADR 115) ─────────────────────────────────

  // Sheet layer (Phase 4): registered only when a sheet is open.
  // Handles Escape, cell-level copy/paste, and consumes Delete to prevent
  // pattern-level clear from firing through the app layer.
  function sheetKeyHandler(e: KeyboardEvent): boolean | void {
    if (e.code === 'Escape') { e.preventDefault(); closeAllSheets(); return true }
    // Cell-level copy/paste (not in select brush mode — that uses its own selection copy)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && ui.brushMode !== 'select') {
      if (e.code === 'KeyC') { cellCopy(ui.currentPattern, ui.selectedTrack); return true }
      if (e.code === 'KeyV') { e.preventDefault(); cellPaste(ui.currentPattern, ui.selectedTrack); return true }
    }
    // Consume Delete/Backspace so it doesn't fall through to pattern clear in app layer
    if (e.code === 'Backspace' || e.code === 'Delete') { return true }
  }

  $effect(() => {
    if (hasSheet) {
      registerKeyLayer('sheet', sheetKeyHandler)
      return () => unregisterKeyLayer('sheet')
    }
  })

  // App layer: global fallback (play/stop, undo/redo, pattern-level copy/paste/delete)
  function appKeyHandler(e: KeyboardEvent): boolean | void {
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play(); return true }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return true }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); redo(); return true }
    // Skip pattern-level ops when scene edges/labels are selected (SceneView handles its own keys).
    // Note: selectedSceneNodes is auto-set by MatrixView's selectAndFocus, so it must NOT block copy/paste.
    const hasSceneEdgeOrLabel = ui.selectedSceneEdge != null || Object.keys(ui.selectedSceneLabels).length > 0
    const hasSceneSelection = Object.keys(ui.selectedSceneNodes).length > 0 || hasSceneEdgeOrLabel
    // Pattern-level copy/paste (skip when scene edge/label is selected — scene layer handles those)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (!hasSceneEdgeOrLabel) {
        if (e.code === 'KeyC') { patternCopy(ui.currentPattern); return true }
        if (e.code === 'KeyV') { e.preventDefault(); patternPaste(ui.currentPattern); return true }
      }
    }
    // Delete/Backspace: clear pattern (never when scene nodes/edges/labels are selected)
    if (!hasSceneSelection && (e.code === 'Backspace' || e.code === 'Delete')) {
      e.preventDefault(); patternClear(ui.currentPattern); return true
    }
  }

  onMount(() => {
    registerKeyLayer('app', appKeyHandler)
    return () => unregisterKeyLayer('app')
  })

</script>

<svelte:window onkeydown={dispatch} onkeyup={dispatchUp} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} compact={true} />
    <MobileMatrixView />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      <MobileTrackView />
      <MobileSceneRibbon onplay={play} onstop={stop} />
      <!-- Overlay sheets (mobile: FX / EQ / Master / Perf) -->
      {#if ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master' || ui.phraseView === 'perf'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
        <div class="pattern-sheet mobile" transition:fly={{ y: 12, duration: 100 }}>
          <SweepTrailStrip />
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sheet-handle" onpointerdown={closeAllSheets}><span class="handle-bar"></span></div>
          {#if ui.phraseView === 'fx'}
            <FxPad />
          {:else if ui.phraseView === 'eq'}
            <FilterView />
          {:else if ui.phraseView === 'master'}
            <MasterView />
          {:else if ui.phraseView === 'perf'}
            <MobilePerfSheet />
          {/if}
        </div>
      {/if}
    </div>
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
          {#if ui.phraseView === 'tonnetz'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
            <div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
              <TonnetzSheet onclose={closeAllSheets} />
            </div>
          {:else if ui.phraseView === 'quantizer'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
            <div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
              <QuantizerSheet onclose={closeAllSheets} />
            </div>
          {:else if ui.phraseView === 'turing'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
            <div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
              <TuringSheet onclose={closeAllSheets} />
            </div>
          {:else if ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sheet-backdrop" transition:fade={{ duration: 100 }} onpointerdown={closeAllSheets}></div>
            <div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
              <SweepTrailStrip />
              {#if ui.phraseView === 'fx'}
                <FxPad />
              {:else if ui.phraseView === 'eq'}
                <FilterView />
              {:else if ui.phraseView === 'master'}
                <MasterView />
              {:else}
                {@const hasSweep = !!findSweepNodeForPattern(song.patterns[ui.currentPattern]?.id)}
                {#if ui.sweepTab && hasSweep}
                  <SweepCanvas onClose={closeAllSheets} onstop={stop} />
                {:else}
                  <PatternToolbar onRandom={randomizePattern} onClose={closeAllSheets} onLoop={toggleLoop} />
                  {#if prefs.patternEditor === 'tracker'}
                    <TrackerView />
                  {:else}
                    <StepGrid />
                  {/if}
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
  <ErrorToast />
  <ErrorDialog />
  {#if !prefs.visited}
    <WelcomeOverlay onLoadDemo={projectLoadDemo} onStartEmpty={() => {}} />
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
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Pattern sheet overlay (ADR 054) ── */
  .sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(30, 32, 40, 0.15);
    z-index: 50;
  }

  .pattern-sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 10%;
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
    border-radius: 0;
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
