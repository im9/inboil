<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, playback, perf } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import { advanceSceneNode, hasScenePlayback } from '$app/lib/scenePlayback.ts'
  import { initTutorialScene } from './tutorialSetup.ts'
  import MatrixView from '$app/lib/components/MatrixView.svelte'
  import SceneView from '$app/lib/components/SceneView.svelte'

  let audioReady = $state(false)

  const engineCtx = $derived({
    fxFlavours: { verb: 'room' as const, delay: 'sync' as const, glitch: 'glitch' as const, granular: 'cloud' as const },
    masterPad: { comp: { on: false, x: 0, y: 0 }, duck: { on: false, x: 0, y: 0 }, ret: { on: false, x: 0, y: 0 } },
    soloTracks: ui.soloTracks,
  })

  initTutorialScene()

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

      // Start from root
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

<div class="playground scene-with-matrix">
  <MatrixView />
  <SceneView onplay={play} onstop={stop} />
</div>

<style>
  .scene-with-matrix {
    flex-direction: row;
    height: 400px;
  }
</style>
