<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, playback, perf } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import { advanceSceneNode, hasScenePlayback } from '$app/lib/scenePlayback.ts'
  import { initTutorialPatterns } from './tutorialSetup.ts'
  import SceneView from '$app/lib/components/SceneView.svelte'
  import DockPanel from '$app/lib/components/DockPanel.svelte'
  import type { GenerativeEngine, TuringParams, QuantizerParams, TonnetzParams } from '$app/lib/types.ts'

  const { engine: engineType = 'turing' }: { engine?: GenerativeEngine } = $props()

  let audioReady = $state(false)

  const engineCtx = $derived({
    fxFlavours: { verb: 'room' as const, delay: 'sync' as const, glitch: 'glitch' as const, granular: 'cloud' as const },
    masterPad: { comp: { on: false, x: 0, y: 0 }, duck: { on: false, x: 0, y: 0 }, ret: { on: false, x: 0, y: 0 } },
    soloTracks: ui.soloTracks,
  })

  function defaultParams(e: GenerativeEngine): TuringParams | QuantizerParams | TonnetzParams {
    switch (e) {
      case 'turing': return { engine: 'turing', length: 8, lock: 0.5, range: [48, 72], mode: 'note' as const, density: 0.7 }
      case 'quantizer': return { engine: 'quantizer', scale: 'minor', root: 0, octaveRange: [3, 5] as [number, number] }
      case 'tonnetz': return { engine: 'tonnetz', startChord: [60, 64, 67] as [number, number, number], sequence: ['P', 'L', 'R'], stepsPerChord: 4, voicing: 'close' as const }
    }
  }

  // Initialize: tutorial patterns + generator scene
  initTutorialPatterns()

  const patId = song.patterns[0]?.id ?? 'pat_00'
  const genId = 'pg_gen'
  const patNodeId = 'pg_pat'

  if (engineType === 'quantizer') {
    // Chain: Turing → Quantizer → Pattern
    const tmId = 'pg_tm'
    song.scene.nodes = [
      { id: tmId, type: 'generative', x: 0.44, y: 0.42, root: false,
        generative: { engine: 'turing', mergeMode: 'replace', targetTrack: 0, params: defaultParams('turing') } },
      { id: genId, type: 'generative', x: 0.56, y: 0.42, root: false,
        generative: { engine: 'quantizer', mergeMode: 'replace', targetTrack: 0, params: defaultParams('quantizer') } },
      { id: patNodeId, type: 'pattern', patternId: patId, x: 0.50, y: 0.58, root: true },
    ]
    song.scene.edges = [
      { id: 'pg_e1', from: tmId, to: genId, order: 0 },
      { id: 'pg_e2', from: genId, to: patNodeId, order: 0 },
    ]
  } else {
    song.scene.nodes = [
      { id: patNodeId, type: 'pattern', patternId: patId, x: 0.58, y: 0.45, root: true },
      { id: genId, type: 'generative', x: 0.42, y: 0.45, root: false,
        generative: { engine: engineType, mergeMode: 'replace', targetTrack: 0, params: defaultParams(engineType) } },
    ]
    song.scene.edges = [
      { id: 'pg_e1', from: genId, to: patNodeId, order: 0 },
    ]
  }
  song.scene.labels = []
  song.scene.stamps = []

  // Pre-select the generator node so DockPanel shows its controls
  ui.selectedSceneNodes = { [genId]: true }

  // Sync pattern data to engine reactively
  let rafId = 0
  $effect(() => {
    if (!audioReady || playback.playingPattern == null) return
    JSON.stringify(song.patterns[playback.playingPattern])
    JSON.stringify(song.tracks.map(t => t.muted))
    void ui.soloTracks.size
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      engine.sendPatternByIndex(song, perf, undefined, engineCtx, false, playback.playingPattern!)
    })
    return () => cancelAnimationFrame(rafId)
  })

  async function play() {
    try {
      await engine.init()
      audioReady = true
      playback.mode = 'scene'
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      playback.sceneAbsoluteKey = null

      engine.onStep = (heads: number[], cycle: boolean) => {
        playback.playheads = heads
        if (!cycle || playback.mode !== 'scene') return
        if (!hasScenePlayback()) return
        const { advanced, patternIndex, stop: shouldStop } = advanceSceneNode()
        if (shouldStop) { stop(); return }
        if (advanced) {
          perf.rootNote = ((playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)) % 12 + 12) % 12
          engine.sendPatternByIndex(song, perf, undefined, engineCtx, true, patternIndex)
        }
      }

      const { patternIndex, stop: shouldStop } = advanceSceneNode()
      if (shouldStop) return
      perf.rootNote = ((playback.sceneAbsoluteKey ?? (song.rootNote + playback.sceneTranspose)) % 12 + 12) % 12
      engine.sendPatternByIndex(song, perf, undefined, engineCtx, false, patternIndex)
      await engine.play()
      playback.playing = true
    } catch (e) {
      console.error('Audio init failed', e)
    }
  }

  function stop() {
    engine.stop()
    playback.playing = false
    playback.mode = 'loop'
    playback.playingPattern = null
    playback.sceneNodeId = null
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
  }
</script>

<div class="playground pg-generator">
  <SceneView onplay={play} onstop={stop} />
  <div class="pg-dock-wrap">
    <DockPanel />
  </div>
</div>

<style>
  .pg-generator {
    flex-direction: row;
    height: 400px;
  }
  .pg-dock-wrap {
    width: 280px;
    flex-shrink: 0;
    overflow-y: auto;
    background: var(--color-fg);
    color: var(--color-bg);
  }
</style>
