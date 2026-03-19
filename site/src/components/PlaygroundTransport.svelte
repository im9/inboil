<script lang="ts">
  import '../styles/playground.css'
  import { song, playback, perf, fxPad, fxFlavours, masterPad, ui } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import { initTutorialPatterns } from './tutorialSetup.ts'
  import type { Snippet } from 'svelte'

  let { children, height = 320, view }: { children: Snippet; height?: number; view?: 'fx' | 'eq' | 'master' } = $props()

  let audioReady = $state(false)
  let error = $state('')

  initTutorialPatterns()

  const engineCtx = $derived({
    fxFlavours,
    masterPad,
    soloTracks: ui.soloTracks,
  })

  // Sync pattern + FX + master + flavours to engine (rAF-batched, mirrors App.svelte)
  let rafId = 0
  $effect(() => {
    if (!audioReady) return
    void (JSON.stringify(song.patterns[ui.currentPattern]) + JSON.stringify(perf) + JSON.stringify(fxPad) + JSON.stringify(masterPad) + JSON.stringify(fxFlavours))
    void JSON.stringify(song.tracks.map(t => t.muted))
    void ui.soloTracks.size
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, false, ui.currentPattern)
    })
    return () => cancelAnimationFrame(rafId)
  })

  async function play() {
    if (playback.playing) return
    try {
      await engine.init()
      audioReady = true
      // Force loop mode (scene mode may persist from SPA navigation)
      playback.mode = 'loop'
      // Activate the correct view so component visualization starts
      if (view) ui.phraseView = view
      engine.onStep = (heads: number[]) => { playback.playheads = heads }
      engine.sendPatternByIndex(song, perf, fxPad, engineCtx, true, ui.currentPattern)
      await engine.play()
      playback.playing = true
    } catch {
      error = 'Audio not available'
    }
  }

  function stop() {
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
  }
</script>

<div class="transport-demo not-content">
  <div class="transport-bar">
    {#if !playback.playing}
      <button class="btn btn-play" onclick={play}>▶ Play</button>
    {:else}
      <button class="btn btn-stop" onclick={stop}>■ Stop</button>
    {/if}
    <span class="bpm-label">BPM {song.bpm}</span>
    {#if error}<span class="error">{error}</span>{/if}
  </div>
  <div class="playground dark-zone" style="height: {height}px; border-radius: 0 0 12px 12px;">
    {@render children()}
  </div>
</div>

<style>
  .transport-demo {
    border-radius: 12px;
    overflow: hidden;
    --c-bg:      #1E2028;
    --c-fg:      #EDE8DC;
    --c-olive:   #787845;
    --c-salmon:  #E8A090;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .transport-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--c-bg);
    color: var(--c-fg);
    font-family: var(--font-mono);
    font-size: 12px;
    border-radius: 12px 12px 0 0;
  }

  .btn {
    height: 28px;
    line-height: 26px;
    padding: 0 10px;
    border: 1.5px solid;
    border-radius: 3px;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    box-sizing: border-box;
    transition: background 0.1s, color 0.1s;
  }

  .btn-play { border-color: var(--c-olive); color: var(--c-fg); }
  .btn-play:hover { background: var(--c-olive); }
  .btn-stop { border-color: var(--c-salmon); color: var(--c-fg); }
  .btn-stop:hover { background: var(--c-salmon); color: var(--c-bg); }

  .bpm-label { opacity: 0.5; font-size: 11px; }
  .error { color: var(--c-salmon); }
</style>
