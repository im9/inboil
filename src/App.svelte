<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import DockPanel from './lib/components/DockPanel.svelte'

  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import MobileMatrixView from './lib/components/MobileMatrixView.svelte'
  import MobileSceneRibbon from './lib/components/MobileSceneRibbon.svelte'
  import MatrixView from './lib/components/MatrixView.svelte'
  import TrackerView from './lib/components/TrackerView.svelte'
  import SceneView from './lib/components/SceneView.svelte'
  import FxPad from './lib/components/FxPad.svelte'
  import FilterView from './lib/components/FilterView.svelte'
  import MasterView from './lib/components/MasterView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import MobilePerfSheet from './lib/components/MobilePerfSheet.svelte'
  import PatternToolbar from './lib/components/PatternToolbar.svelte'
  import ErrorToast from './lib/components/ErrorToast.svelte'
  import WelcomeOverlay from './lib/components/WelcomeOverlay.svelte'
  import { song, playback, ui, prefs, session, randomizePattern, perf, fxPad, fxFlavours, masterPad, masterLevels, hasScenePlayback, advanceSceneNode, applyAutomations, restoreAutomationSnapshot, soloPatternIndex, undo, redo, projectAutoSave, projectRestore, projectLoadDemo, writeRecoverySnapshot, initPool } from './lib/state.svelte.ts'
  import { cellCopy, cellPaste, patternCopy, patternPaste, patternClear } from './lib/sectionActions.ts'
  import { engine, type EngineContext } from './lib/audio/engine.ts'
  import { setSignalingUrl, initHostHandlers, setHostTransportCallbacks, sendSnapshot, sendPlayhead, setOnGuestConnected, initGuestHandlers, disconnect, setOnError } from './lib/multiDevice/index.ts'
  import { syncDelta, resetDeltaSync } from './lib/multiDevice/deltaSync.ts'
  import { showToast } from './lib/toast.svelte.ts'

  // ── Global unhandled rejection handler ──────────────────────────
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled]', e.reason)
    showToast('Unexpected error', 'error')
  })

  const engineCtx: EngineContext = $derived({
    fxFlavours,
    masterPad,
    soloTracks: ui.soloTracks,
  })
  import { fade, fly } from 'svelte/transition'

  // ── Project restore (once) + save on page hide ───────────────────
  let restored = false
  $effect(() => {
    if (!restored) { restored = true; void projectRestore(); void initPool() }
    const onVisChange = () => { if (document.visibilityState === 'hidden') { writeRecoverySnapshot(); void projectAutoSave() } }
    const onBeforeUnload = () => { writeRecoverySnapshot(); void projectAutoSave() }
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
  // Clean disconnect on page unload
  window.addEventListener('beforeunload', () => {
    if (session.role !== 'solo') { disconnect(); resetDeltaSync() }
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
    void (JSON.stringify(song) + JSON.stringify(perf) + JSON.stringify(fxPad) + ui.currentPattern + playback.mode + playback.playingPattern + JSON.stringify([...ui.soloTracks]))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
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
    })
    return () => cancelAnimationFrame(rafId)
  })

  // ── Loop-mode decorator application ──────────────────────────────
  // Apply scene decorators (transpose, FX) to the current pattern in loop mode
  // so SCENE tab edits are heard without switching to scene playback.
  // Skips tempo (user controls BPM directly) and repeat (meaningless in loop).
  function applyLoopDecorators(): void {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return
    const node = song.scene.nodes.find(n => n.type === 'pattern' && n.patternId === pat.id)
    if (!node) {
      perf.rootNote = song.rootNote
      return
    }
    let transpose = 0
    let absKey: number | null = null
    for (const dec of node.decorators ?? []) {
      if (dec.type === 'transpose') {
        if (dec.params.mode === 1) absKey = dec.params.key ?? 0
        else transpose += (dec.params.semitones ?? 0)
      } else if (dec.type === 'fx') {
        fxPad.verb.on = !!dec.params.verb
        fxPad.delay.on = !!dec.params.delay
        fxPad.glitch.on = !!dec.params.glitch
        fxPad.granular.on = !!dec.params.granular
        if (dec.flavourOverrides) {
          if (dec.flavourOverrides.verb)     fxFlavours.verb     = dec.flavourOverrides.verb
          if (dec.flavourOverrides.delay)    fxFlavours.delay    = dec.flavourOverrides.delay
          if (dec.flavourOverrides.glitch)   fxFlavours.glitch   = dec.flavourOverrides.glitch
          if (dec.flavourOverrides.granular) fxFlavours.granular = dec.flavourOverrides.granular
        }
      }
    }
    const raw = absKey ?? (song.rootNote + transpose)
    perf.rootNote = ((raw % 12) + 12) % 12  // clamp to 0–11 for SCALE_TEMPLATES
  }

  // Reactively apply decorators when playing in loop mode
  $effect(() => {
    if (playback.mode !== 'loop' || !playback.playing) return
    applyLoopDecorators()
  })

  let soloSent: string | null = null // tracks which solo node was last sent to engine

  engine.onStep = (heads: number[], cycle: boolean) => {
    playback.playheads = heads
    // Broadcast playhead to connected guests
    if (session.role === 'host') sendPlayhead()
    // Apply automation curves on every step (ADR 053)
    if (playback.mode === 'scene' && playback.activeAutomations.length > 0 && playback.playingPattern != null) {
      const pat = song.patterns[playback.playingPattern]
      if (pat) {
        const totalSteps = Math.max(1, ...pat.cells.map(c => c.steps))
        applyAutomations(heads[0], totalSteps)
      }
    }
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
        applyLoopDecorators()
        engine.sendPatternByIndex(song, perf, fxPad, engineCtx, true, next)
      }
      return
    }
    if (cycle) {
      // Pattern cycle complete (all tracks finished) — scene graph takes priority
      if (hasScenePlayback()) {
        const { advanced, patternIndex, stop: shouldStop } = advanceSceneNode()
        if (shouldStop) { stop(); return }
        if (advanced) {
          perf.rootNote = ((playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)) % 12 + 12) % 12
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

  async function play() {
    if (playback.playing) return
    await engine.init({ onLevels: (peakL, peakR, gr, cpu) => { masterLevels.peakL = peakL; masterLevels.peakR = peakR; masterLevels.gr = gr; masterLevels.cpu = cpu } })
    const soloIdx2 = soloPatternIndex()
    if (soloIdx2 != null) {
      soloSent = playback.soloNodeId
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, soloIdx2)
      engine.play()
      playback.playing = true
      return
    }
    // ADR 045: auto-engage scene mode — desktop only (mobile has no scene view)
    if (isMobile) {
      playback.mode = 'loop'
    } else if (!hasSheet && hasScenePlayback()) {
      playback.mode = 'scene'
    }
    if (playback.mode === 'scene' && hasScenePlayback()) {
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      playback.sceneAbsoluteKey = null
      const { patternIndex, stop: shouldStop } = advanceSceneNode()
      if (shouldStop) return
      perf.rootNote = ((playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)) % 12 + 12) % 12
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, patternIndex)
    } else {
      applyLoopDecorators()
      playback.playingPattern = ui.currentPattern
      playback.queuedPattern = null
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, ui.currentPattern)
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
    playback.activeAutomations = []
    playback.mode = 'loop'
    playback.playingPattern = null
    playback.queuedPattern = null
    void projectAutoSave()
  }

  // Register transport callbacks for multi-device host
  setHostTransportCallbacks(play, stop)

  function closeAllSheets() {
    ui.patternSheet = false
    ui.phraseView = 'pattern'
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

  const hasSheet = $derived(ui.patternSheet || ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master' || ui.phraseView === 'perf')

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Escape' && hasSheet) { e.preventDefault(); closeAllSheets(); return }
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play() }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); redo() }
    // Skip pattern-level ops when scene edge/label is selected (SceneView handles its own keys).
    // Note: selectedSceneNodes is auto-set by MatrixView's selectAndFocus, so it must NOT block pattern ops.
    const hasSceneEdgeOrLabel = ui.selectedSceneEdge != null || ui.selectedSceneLabel != null
    const inMatrix = !!(e.target as HTMLElement)?.closest?.('.matrix-view')
    // Copy/paste: pattern-level (matrix focus or no sheet) vs cell-level (sheet open)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (inMatrix || (!hasSheet && !hasSceneEdgeOrLabel)) {
        if (e.code === 'KeyC') { patternCopy(ui.currentPattern) }
        if (e.code === 'KeyV') { e.preventDefault(); patternPaste(ui.currentPattern) }
      } else if (hasSheet && ui.brushMode !== 'select') {
        if (e.code === 'KeyC') { cellCopy(ui.currentPattern, ui.selectedTrack) }
        if (e.code === 'KeyV') { e.preventDefault(); cellPaste(ui.currentPattern, ui.selectedTrack) }
      }
    }
    // Delete/Backspace: clear pattern (matrix focus or no sheet, no scene edge/label)
    if ((inMatrix || (!hasSheet && !hasSceneEdgeOrLabel)) && (e.code === 'Backspace' || e.code === 'Delete')) {
      e.preventDefault(); patternClear(ui.currentPattern)
    }
  }

</script>

<svelte:window onkeydown={onKeydown} />

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
  <ErrorToast />
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
    background: rgba(0, 0, 0, 0.18);
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
