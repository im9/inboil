<script lang="ts">
  import AppHeader from './lib/components/AppHeader.svelte'
  import StepGrid from './lib/components/StepGrid.svelte'
  import DockPanel from './lib/components/DockPanel.svelte'
  import PerfBar from './lib/components/PerfBar.svelte'
  import MobileTrackView from './lib/components/MobileTrackView.svelte'
  import ChainView from './lib/components/ChainView.svelte'
  import SongView from './lib/components/SongView.svelte'
  import TrackerView from './lib/components/TrackerView.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PerfBubble from './lib/components/PerfBubble.svelte'
  import Breadcrumb from './lib/components/Breadcrumb.svelte'
  import { song, playback, ui, randomizePattern, effects, perf, fxPad, songPlay, advanceSong, applySongRow, updateSongPerf, songForPlayback, undo, redo, songNavBack } from './lib/state.svelte.ts'
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
    void (JSON.stringify(song) + JSON.stringify(effects) + JSON.stringify(perf) + JSON.stringify(fxPad) + songPlay.active + songPlay.playingPhraseSet + JSON.stringify([...ui.soloTracks]))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      const s = songPlay.active && songPlay.playingPhraseSet >= 0
        ? songForPlayback(songPlay.playingPhraseSet)
        : song
      const phraseIndices = songPlay.active ? undefined : [...ui.activePhrases]
      engine.sendPattern(s, effects, perf, fxPad, false, phraseIndices)
    })
    return () => cancelAnimationFrame(rafId)
  })

  engine.onStep = (heads: number[]) => {
    const prev0 = playback.playheads[0]
    playback.playheads = heads
    let songSent = false
    if (heads[0] === 0 && prev0 !== 0) {
      const advanced = advanceSong()
      if (songPlay.active && song.rows.length > 0) {
        if (advanced) {
          applySongRow(song.rows[songPlay.currentRow])
        }
        updateSongPerf(heads[0])
        const s = songForPlayback(songPlay.playingPhraseSet)
        engine.sendPattern(s, effects, perf, fxPad, true)
        songSent = true
      }
    }
    if (!songSent && songPlay.active && song.rows.length > 0) {
      const changed = updateSongPerf(heads[0])
      if (changed) {
        const s = songForPlayback(songPlay.playingPhraseSet)
        engine.sendPattern(s, effects, perf, fxPad, false)
      }
    }
  }

  async function play() {
    if (playback.playing) return
    await engine.init()
    const s = songPlay.active && songPlay.playingPhraseSet >= 0
      ? songForPlayback(songPlay.playingPhraseSet)
      : song
    const phraseIndices = songPlay.active ? undefined : [...ui.activePhrases]
    engine.sendPattern(s, effects, perf, fxPad, false, phraseIndices)
    engine.play()
    playback.playing = true
  }

  function stop() {
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Space') { e.preventDefault(); playback.playing ? stop() : play() }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); redo() }
    if (e.code === 'Escape' && ui.mode === 'song' && ui.songNav.level !== 'song') {
      e.preventDefault(); songNavBack()
    }
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  {#if isMobile}
    <AppHeader onPlay={play} onStop={stop} onRandom={randomizePattern} compact={true} />
    <PerfBar onPlay={play} onStop={stop} onRandom={randomizePattern} />
    <Breadcrumb />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      {#if ui.mode === 'song'}
        {#if ui.songNav.level === 'song'}
          <SongView />
        {:else if ui.songNav.level === 'chain'}
          <ChainView />
        {:else}
          <MobileTrackView />
        {/if}
      {:else if ui.phraseView === 'tracker'}
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
    <Breadcrumb />
    <div class="view-area">
      <div class="perf-flash fill" class:on={perf.filling}></div>
      <div class="perf-flash rev" class:on={perf.reversing}></div>
      <div class="perf-flash brk" class:on={perf.breaking}></div>
      <div class="view-content-row" class:bottom={ui.dockPosition === 'bottom'}>
        <div class="view-main">
          {#if ui.mode === 'song'}
            {#if ui.songNav.level === 'song'}
              <SongView />
            {:else if ui.songNav.level === 'chain'}
              <ChainView />
            {:else}
              {#if ui.phraseView === 'tracker'}
                <TrackerView />
              {:else}
                <StepGrid />
              {/if}
            {/if}
          {:else if ui.phraseView === 'tracker'}
            <TrackerView />
          {:else}
            <StepGrid />
          {/if}
        </div>
        <DockPanel />
      </div>
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
  .view-content-row.bottom {
    flex-direction: column;
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
