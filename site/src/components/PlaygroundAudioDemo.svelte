<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, playback, perf, undo, redo } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import StepGrid from '$app/lib/components/StepGrid.svelte'
  import Knob from '$app/lib/components/Knob.svelte'
  import { getParamDefs, normalizeParam, denormalizeParam, displayLabel, paramSteps } from '$app/lib/paramDefs.ts'
  import { cellForTrack } from '$app/lib/state.svelte.ts'
  import { randomizePattern } from '$app/lib/randomize.ts'
  import { knobValue, knobChange, isParamLocked } from '$app/lib/paramHelpers.ts'
  import { clearAllParamLocks } from '$app/lib/stepActions.ts'

  let { showPerf = false, showRand = false, showGrid = true, showLock = false }: { showPerf?: boolean; showRand?: boolean; showGrid?: boolean; showLock?: boolean } = $props()

  let audioReady = $state(false)
  let error = $state('')

  // Selected track's cell & params
  const track = $derived(song.tracks[ui.selectedTrack])
  const cell = $derived(track ? cellForTrack(song.patterns[ui.currentPattern], track.id) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId).slice(0, showLock ? 4 : 6) : [])

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
      await engine.play()
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

  function onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="audio-demo not-content">
  <div class="audio-transport">
    {#if !playback.playing}
      <button class="btn btn-play" onclick={play}>▶ Play</button>
    {:else}
      <button class="btn btn-stop" onclick={stop}>■ Stop</button>
    {/if}
    <span class="bpm-label">BPM {song.bpm}</span>
    {#if showRand}
      <button class="btn btn-olive" onclick={randomizePattern}>RAND</button>
    {/if}
    {#if showLock}
      <span class="separator"></span>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="plock-toggle" onpointerdown={() => { ui.lockMode = !ui.lockMode; if (!ui.lockMode) ui.selectedStep = null }}>
        <span class="plock-label">P-LOCK</span>
        <span class="mode-switch" class:on={ui.lockMode}><span class="mode-switch-thumb"></span></span>
      </div>
      {#if ui.lockMode}
        <span class="lock-info" class:active={ui.selectedStep !== null}>
          {ui.selectedStep !== null ? `STEP ${ui.selectedStep + 1}` : 'tap a step'}
        </span>
        {#if ui.selectedStep !== null}
          <button
            class="btn btn-salmon"
            onclick={() => { if (ui.selectedStep !== null) clearAllParamLocks(ui.selectedTrack, ui.selectedStep); }}
          >CLR</button>
        {/if}
      {/if}
    {/if}
    {#if showPerf}
      <div class="perf-group">
        <button
          class="btn btn-blue"
          class:active={perf.filling}
          class:stopped={!playback.playing}
          onpointerdown={() => { perf.filling = true }}
          onpointerup={() => { perf.filling = false }}
          onpointerleave={() => { perf.filling = false }}
        >FILL</button>
        <button
          class="btn btn-blue"
          class:active={perf.reversing}
          class:stopped={!playback.playing}
          onpointerdown={() => { perf.reversing = true }}
          onpointerup={() => { perf.reversing = false }}
          onpointerleave={() => { perf.reversing = false }}
        >REV</button>
        <button
          class="btn btn-salmon"
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
  {#if showLock && cell && params.length > 0}
    <div class="audio-params">
      <span class="track-name">{cell.voiceId}</span>
      {#each params as def}
        {@const val = ui.lockMode ? knobValue(def) : (cell.voiceParams[def.key] ?? def.default)}
        {@const locked = isParamLocked(def.key)}
        <span class="knob-wrap" class:locked>
          <Knob
            value={normalizeParam(def, val)}
            label={def.label}
            size={36}
            displayValue={displayLabel(def, val) ?? String(Math.round(val * 10) / 10)}
            steps={paramSteps(def)}
            onchange={ui.lockMode ? (v) => knobChange(def, v) : (v) => handleParamChange(def.key, def, v)}
          />
        </span>
      {/each}
    </div>
  {/if}
  {#if showGrid}
  <div class="playground" style="height: 360px;">
    <StepGrid />
  </div>
  {/if}
  {#if !showLock && cell && params.length > 0}
    <div class="audio-params">
      <span class="track-name">{cell.voiceId}</span>
      {#each params as def}
        {@const val = (cell.voiceParams[def.key] ?? def.default)}
        <span class="knob-wrap">
          <Knob
            value={normalizeParam(def, val)}
            label={def.label}
            size={36}
            displayValue={displayLabel(def, val) ?? String(Math.round(val * 10) / 10)}
            steps={paramSteps(def)}
            onchange={(v) => handleParamChange(def.key, def, v)}
          />
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .audio-demo {
    border-radius: 12px;
    overflow: hidden;
    --c-bg:      #1E2028;
    --c-fg:      #EDE8DC;
    --c-olive:   #787845;
    --c-salmon:  #E8A090;
    --c-blue:    #4472B4;
    --c-muted:   rgba(237,232,220,0.15);
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  .audio-demo :global(.playground) {
    border-radius: 0;
  }

  /* ── Transport bar ── */
  .audio-transport {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--c-bg);
    color: var(--c-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-base);
    border-radius: 12px 12px 0 0;
  }

  /* ── Button base — single source of truth ── */
  .btn {
    height: 28px;
    line-height: 26px;
    padding: 0 10px;
    border: 1.5px solid;
    border-radius: 3px;
    background: transparent;
    font-family: var(--font-mono);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    box-sizing: border-box;
    transition: background 0.1s, color 0.1s;
  }

  /* Color variants — olive (primary), salmon (destructive), blue (perf) */
  .btn-olive  { border-color: var(--c-olive);  color: var(--c-olive); }
  .btn-olive:hover  { background: var(--c-olive);  color: var(--c-bg); }
  .btn-salmon { border-color: var(--c-salmon); color: var(--c-salmon); }
  .btn-salmon:hover { background: var(--c-salmon); color: var(--c-bg); }
  .btn-blue   { border-color: var(--c-blue);   color: var(--c-blue); }
  .btn-blue:active, .btn-blue.active { background: var(--c-blue); color: var(--c-fg); }
  .btn-salmon:active, .btn-salmon.active { background: var(--c-salmon); color: var(--c-bg); }

  /* Stopped state — shared by perf buttons */
  .btn.stopped {
    border-color: var(--c-muted);
    color: rgba(237,232,220,0.25);
    cursor: default;
  }

  /* Play / Stop — larger text for primary action */
  .btn-play { border-color: var(--c-olive); color: var(--c-fg); font-size: var(--fs-base); }
  .btn-play:hover { background: var(--c-olive); }
  .btn-stop  { border-color: var(--c-salmon); color: var(--c-fg); font-size: var(--fs-base); }
  .btn-stop:hover  { background: var(--c-salmon); color: var(--c-bg); }

  .bpm-label { opacity: 0.5; font-size: var(--fs-lg); }
  .error { color: var(--c-salmon); }

  /* ── Separator ── */
  .separator {
    width: 1px;
    height: 16px;
    background: var(--c-muted);
    flex-shrink: 0;
  }

  /* ── P-LOCK toggle ── */
  .plock-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  .plock-label {
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.6);
  }
  .mode-switch {
    width: 34px;
    height: 18px;
    border-radius: 9px;
    background: var(--c-muted);
    position: relative;
    transition: background 0.15s;
  }
  .mode-switch.on { background: var(--c-olive); }
  .mode-switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(237,232,220,0.6);
    transition: left 0.15s, background 0.15s;
  }
  .mode-switch.on .mode-switch-thumb {
    left: 19px;
    background: var(--c-fg);
  }

  /* ── Lock info ── */
  .lock-info {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
  }
  .lock-info.active { color: var(--c-olive); }

  /* ── Perf group ── */
  .perf-group {
    display: flex;
    gap: 4px;
    margin-left: auto;
    align-items: center;
  }

  /* ── Knob lock indicator ── */
  .knob-wrap { position: relative; display: inline-flex; }
  .knob-wrap.locked::after {
    content: '';
    position: absolute;
    top: -2px;
    right: -2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c-olive);
  }

  /* ── Params row ── */
  .audio-params {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--c-bg);
    color: var(--c-fg);
    border-radius: 0 0 12px 12px;
    flex-wrap: wrap;
  }
  .track-name {
    color: var(--c-olive);
    font-family: var(--font-mono);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-width: 48px;
  }
</style>
