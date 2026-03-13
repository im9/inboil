<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, playback, perf } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import StepGrid from '$app/lib/components/StepGrid.svelte'
  import Knob from '$app/lib/components/Knob.svelte'
  import { getParamDefs, normalizeParam, denormalizeParam, displayLabel, paramSteps } from '$app/lib/paramDefs.ts'
  import { cellForTrack } from '$app/lib/state.svelte.ts'
  import { randomizePattern } from '$app/lib/randomize.ts'

  let { showPerf = false, showRand = false }: { showPerf?: boolean; showRand?: boolean } = $props()

  let audioReady = $state(false)
  let error = $state('')

  // Selected track's cell & params
  const track = $derived(song.tracks[ui.currentTrack])
  const cell = $derived(track ? cellForTrack(song.patterns[ui.currentPattern], track.id) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId).slice(0, 6) : [])

  // Engine context — soloTracks is reactive via $derived
  const engineCtx = $derived({ fxFlavours: { verb: 'room' as const, delay: 'sync' as const, glitch: 'glitch' as const, granular: 'cloud' as const }, masterPad: { comp: { on: false, x: 0, y: 0 }, duck: { on: false, x: 0, y: 0 }, ret: { on: false, x: 0, y: 0 } }, soloTracks: ui.soloTracks })

  // Init tutorial pattern
  function initPattern() {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return
    // Reset all trigs first
    for (const c of pat.cells) for (const t of c.trigs) t.active = false
    const kick = pat.cells.find(c => c.voiceId === 'Kick')
    if (kick) for (let i = 0; i < kick.steps; i += 4) { kick.trigs[i].active = true; kick.trigs[i].velocity = 0.9 }
    const hh = pat.cells.find(c => c.voiceId === 'CHH')
    if (hh) for (let i = 0; i < hh.steps; i += 2) { hh.trigs[i].active = true; hh.trigs[i].velocity = 0.6 }
    const snare = pat.cells.find(c => c.voiceId === 'Snare')
    if (snare) { snare.trigs[4].active = true; snare.trigs[12].active = true }
  }
  initPattern()

  // Sync pattern + perf to engine reactively (rAF-batched like App.svelte)
  let rafId = 0
  $effect(() => {
    if (!audioReady) return
    // Touch reactive deps: pattern data + mute/solo + perf state
    JSON.stringify(song.patterns[ui.currentPattern])
    JSON.stringify(song.tracks.map(t => t.muted))
    void ui.soloTracks.size
    void perf.filling; void perf.reversing; void perf.breaking
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      engine.sendPatternByIndex(song, perf, undefined, engineCtx, false, ui.currentPattern)
    })
    return () => cancelAnimationFrame(rafId)
  })

  async function play() {
    try {
      await engine.init()
      audioReady = true
      engine.onStep = (heads: number[], cycle: boolean) => {
        playback.playheads = heads
      }
      engine.sendPatternByIndex(song, perf, undefined, engineCtx, true, ui.currentPattern)
      engine.play()
      playback.playing = true
    } catch (e) {
      error = 'Audio not available'
    }
  }

  function stop() {
    engine.stop()
    playback.playing = false
    for (let i = 0; i < playback.playheads.length; i++) playback.playheads[i] = 0
    perf.filling = false; perf.breaking = false; perf.reversing = false
  }

  function handleParamChange(key: string, def: { min: number; max: number; step?: number }, normalized: number) {
    if (!cell) return
    cell.voiceParams[key] = denormalizeParam(def, normalized)
  }
</script>

<div class="audio-demo not-content">
  <div class="audio-transport">
    {#if !playback.playing}
      <button class="btn-transport btn-play" onclick={play}>▶ Play</button>
    {:else}
      <button class="btn-transport btn-stop" onclick={stop}>■ Stop</button>
    {/if}
    <span class="bpm-label">BPM {song.bpm}</span>
    {#if showRand}
      <button class="btn-transport btn-rand" onclick={randomizePattern}>RAND</button>
    {/if}
    {#if showPerf}
      <div class="perf-group">
        <button
          class="btn-transport btn-perf"
          class:active={perf.filling}
          class:stopped={!playback.playing}
          onpointerdown={() => { perf.filling = true }}
          onpointerup={() => { perf.filling = false }}
          onpointerleave={() => { perf.filling = false }}
        >FILL</button>
        <button
          class="btn-transport btn-perf"
          class:active={perf.reversing}
          class:stopped={!playback.playing}
          onpointerdown={() => { perf.reversing = true }}
          onpointerup={() => { perf.reversing = false }}
          onpointerleave={() => { perf.reversing = false }}
        >REV</button>
        <button
          class="btn-transport btn-brk"
          class:active={perf.breaking}
          class:stopped={!playback.playing}
          onpointerdown={() => { perf.breaking = true }}
          onpointerup={() => { perf.breaking = false }}
          onpointerleave={() => { perf.breaking = false }}
        >BRK</button>
      </div>
    {/if}
    {#if error}<span class="error">{error}</span>{/if}
  </div>
  <div class="playground" style="height: 360px;">
    <StepGrid />
  </div>
  {#if cell && params.length > 0}
    <div class="audio-params">
      <span class="track-name">{cell.voiceId}</span>
      {#each params as def}
        <Knob
          value={normalizeParam(def, cell.voiceParams[def.key] ?? def.default)}
          label={def.label}
          size={36}
          displayValue={displayLabel(def, cell.voiceParams[def.key] ?? def.default) ?? String(Math.round((cell.voiceParams[def.key] ?? def.default) * 10) / 10)}
          steps={paramSteps(def)}
          onchange={(v) => handleParamChange(def.key, def, v)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .audio-demo {
    border-radius: 12px;
    overflow: hidden;
    --color-bg:      #EDE8DC;
    --color-fg:      #1E2028;
    --color-blue:    #4472B4;
    --color-salmon:  #E8A090;
    --color-olive:   #787845;
    --color-muted:   #9A9680;
    --font-data:     'JetBrains Mono', 'Fira Code', monospace;
  }
  .audio-demo :global(.playground) {
    border-radius: 0;
  }
  .audio-transport {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: #1E2028;
    color: #EDE8DC;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    border-radius: 12px 12px 0 0;
  }

  /* Shared base for ALL transport buttons — single source of truth */
  .btn-transport {
    height: 28px;
    line-height: 28px;
    padding: 0 12px;
    border: 1.5px solid;
    background: transparent;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    box-sizing: border-box;
  }

  /* Play / Stop variants */
  .btn-play {
    border-color: #787845;
    color: #EDE8DC;
    font-size: 12px;
  }
  .btn-play:hover { background: #787845; }
  .btn-stop {
    border-color: #E8A090;
    color: #EDE8DC;
    font-size: 12px;
  }
  .btn-stop:hover { background: #E8A090; color: #1E2028; }

  .bpm-label { opacity: 0.6; }

  .perf-group {
    display: flex;
    gap: 4px;
    margin-left: auto;
    align-items: center;
  }

  /* Perf button colors */
  .btn-perf {
    border-color: #4472B4;
    color: #4472B4;
  }
  .btn-perf:active, .btn-perf.active {
    background: #4472B4;
    color: #EDE8DC;
  }
  .btn-perf.stopped {
    border-color: rgba(237,232,220,0.18);
    color: rgba(237,232,220,0.25);
    cursor: default;
  }
  .btn-brk {
    border-color: #E8A090;
    color: #E8A090;
  }
  .btn-brk:active, .btn-brk.active {
    background: #E8A090;
    color: #1E2028;
  }
  .btn-brk.stopped {
    border-color: rgba(237,232,220,0.18);
    color: rgba(237,232,220,0.25);
  }

  .btn-rand {
    border-color: #787845;
    color: #787845;
  }
  .btn-rand:hover {
    background: #787845;
    color: #EDE8DC;
  }

  .error { color: #E8A090; }

  .audio-params {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #1E2028;
    color: #EDE8DC;
    border-radius: 0 0 12px 12px;
    flex-wrap: wrap;
  }
  .track-name {
    color: #787845;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-width: 48px;
  }
</style>
