<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, playback } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import StepGrid from '$app/lib/components/StepGrid.svelte'
  import Knob from '$app/lib/components/Knob.svelte'
  import { getParamDefs, normalizeParam, denormalizeParam, displayLabel, paramSteps } from '$app/lib/paramDefs.ts'
  import { cellForTrack } from '$app/lib/state.svelte.ts'

  let audioReady = $state(false)
  let error = $state('')

  // Selected track's cell & params
  const track = $derived(song.tracks[ui.currentTrack])
  const cell = $derived(track ? cellForTrack(song.patterns[ui.currentPattern], track.id) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId).slice(0, 6) : [])

  // Engine context (minimal — no FX pad, no master pad)
  const engineCtx = { fxFlavours: { verb: 'room' as const, delay: 'sync' as const, glitch: 'glitch' as const, granular: 'cloud' as const }, masterPad: { comp: { on: false, x: 0, y: 0 }, duck: { on: false, x: 0, y: 0 }, ret: { on: false, x: 0, y: 0 } }, soloTracks: new Set<number>() }

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

  // Sync pattern to engine reactively
  $effect(() => {
    if (!audioReady) return
    // Touch reactive deps: read song deeply + playback state
    JSON.stringify(song.patterns[ui.currentPattern])
    engine.sendPatternByIndex(song, undefined, undefined, engineCtx, false, ui.currentPattern)
  })

  async function play() {
    try {
      await engine.init()
      audioReady = true
      engine.onStep = (heads: number[], cycle: boolean) => {
        playback.playheads = heads
      }
      engine.sendPatternByIndex(song, undefined, undefined, engineCtx, true, ui.currentPattern)
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
  }

  function handleParamChange(key: string, def: { min: number; max: number; step?: number }, normalized: number) {
    if (!cell) return
    cell.voiceParams[key] = denormalizeParam(def, normalized)
  }
</script>

<div class="audio-demo">
  <div class="audio-transport">
    {#if !playback.playing}
      <button class="btn-play" onclick={play}>▶ Play</button>
    {:else}
      <button class="btn-stop" onclick={stop}>■ Stop</button>
    {/if}
    <span class="bpm-label">BPM {song.bpm}</span>
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
  .btn-play, .btn-stop {
    border: 1.5px solid #787845;
    background: transparent;
    color: #EDE8DC;
    padding: 4px 16px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    border-radius: 2px;
    letter-spacing: 0.06em;
    font-weight: 700;
  }
  .btn-play:hover { background: #787845; }
  .btn-stop { border-color: #E8A090; }
  .btn-stop:hover { background: #E8A090; color: #1E2028; }
  .bpm-label { opacity: 0.6; }
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
