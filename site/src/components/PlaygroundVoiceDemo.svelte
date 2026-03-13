<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, perf, activeCell } from '$app/lib/state.svelte.ts'
  import { engine } from '$app/lib/audio/engine.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '$app/lib/paramDefs.ts'
  import { knobValue, knobChange } from '$app/lib/paramHelpers.ts'
  import { VOICE_LIST } from '$app/lib/audio/dsp/voices.ts'
  import { changeVoice } from '$app/lib/stepActions.ts'
  import Knob from '$app/lib/components/Knob.svelte'
  import type { VoiceId } from '$app/lib/types.ts'

  ui.selectedTrack = 0

  let audioReady = $state(false)
  let activeKey = $state(-1)

  const track = $derived(song.tracks[ui.selectedTrack])
  const cell  = $derived(track ? activeCell(ui.selectedTrack) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId) : [])
  const isDrum = $derived(cell ? VOICE_LIST.find(v => v.id === cell.voiceId)?.category === 'drum' : false)

  // Engine context for sendPattern
  const engineCtx = $derived({ fxFlavours: { verb: 'room' as const, delay: 'sync' as const, glitch: 'glitch' as const, granular: 'cloud' as const }, masterPad: { comp: { on: false, x: 0, y: 0 }, duck: { on: false, x: 0, y: 0 }, ret: { on: false, x: 0, y: 0 } }, soloTracks: ui.soloTracks })

  // Sync voice params to engine when changed
  let rafId = 0
  $effect(() => {
    if (!audioReady) return
    JSON.stringify(song.patterns[ui.currentPattern])
    JSON.stringify(song.tracks.map(t => t.muted))
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      engine.sendPatternByIndex(song, perf, undefined, engineCtx, false, ui.currentPattern)
    })
    return () => cancelAnimationFrame(rafId)
  })

  async function ensureAudio() {
    if (audioReady) return
    await engine.init()
    audioReady = true
    engine.sendPatternByIndex(song, perf, undefined, engineCtx, true, ui.currentPattern)
  }

  // Piano keys: 1 octave from C3 (MIDI 48) for synths, single trigger for drums
  const OCTAVE_KEYS = [
    { note: 48, label: 'C',  black: false },
    { note: 49, label: 'C#', black: true },
    { note: 50, label: 'D',  black: false },
    { note: 51, label: 'D#', black: true },
    { note: 52, label: 'E',  black: false },
    { note: 53, label: 'F',  black: false },
    { note: 54, label: 'F#', black: true },
    { note: 55, label: 'G',  black: false },
    { note: 56, label: 'G#', black: true },
    { note: 57, label: 'A',  black: false },
    { note: 58, label: 'A#', black: true },
    { note: 59, label: 'B',  black: false },
    { note: 60, label: 'C',  black: false },
  ]

  async function keyDown(note: number) {
    await ensureAudio()
    activeKey = note
    engine.triggerNote(ui.selectedTrack, note, 0.85)
  }

  function keyUp() {
    engine.releaseNote(ui.selectedTrack)
    activeKey = -1
  }

  async function drumHit() {
    await ensureAudio()
    activeKey = 60
    engine.triggerNote(ui.selectedTrack, 60, 0.9)
    setTimeout(() => { activeKey = -1 }, 120)
  }
</script>

<div class="voice-demo not-content">
  <!-- Track selector -->
  <div class="track-bar">
    {#each song.patterns[ui.currentPattern].cells as c}
      {@const t = song.tracks[c.trackId]}
      <button
        class="track-btn"
        class:active={c.trackId === ui.selectedTrack}
        onpointerdown={() => { ui.selectedTrack = c.trackId }}
      ><span class="track-num">{c.trackId + 1}</span><span class="track-voice">{c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? '') : ''}</span></button>
    {/each}
  </div>

  {#if cell}
    <!-- Voice selector (representative set for getting-started) -->
    {@const voices: { id: VoiceId, label: string }[] = [
      { id: 'Kick', label: 'KICK' },
      { id: 'Snare', label: 'SNARE' },
      { id: 'Hat', label: 'HH' },
      { id: 'Bass303', label: 'BASS' },
      { id: 'MoogLead', label: 'LEAD' },
      { id: 'FM', label: 'FM' },
      { id: 'WT', label: 'WAVE' },
    ]}
    <div class="voice-select">
      {#each voices as v}
        <button
          class="voice-chip"
          class:active={cell.voiceId === v.id}
          onpointerdown={() => changeVoice(ui.selectedTrack, v.id)}
        >{v.label}</button>
      {/each}
    </div>

    <!-- Param knobs -->
    <div class="knob-grid">
      {#each params as p}
        {#if p.key !== 'polyMode' && p.key !== 'reverse'}
          {#if p.group}
            {@const prevIdx = params.indexOf(p)}
            {@const isFirst = prevIdx === 0 || params[prevIdx - 1].group !== p.group}
            {#if isFirst}
              {@const groupLabels: Record<string, string> = { tone: 'OSC', noise: 'NOISE', metal: 'METAL', amp: 'AMP', filter: 'FILTER', env: 'ENV', arp: 'ARP', osc: 'OSC', lfo: 'LFO', sample: 'SAMPLE', chop: 'CHOP', sync: 'SYNC', ratio: 'RATIO', level: 'LEVEL', decay: 'DECAY' }}
              <div class="group-label">{groupLabels[p.group] ?? p.group.toUpperCase()}</div>
            {/if}
          {/if}
          <Knob
            value={normalizeParam(p, knobValue(p))}
            label={p.label}
            size={40}
            steps={paramSteps(p)}
            displayValue={displayLabel(p, knobValue(p))}
            onchange={v => knobChange(p, v)}
          />
        {/if}
      {/each}
    </div>

    <!-- Audition keys -->
    {#if isDrum}
      <div class="drum-pad-row">
        <button
          class="drum-pad"
          class:active={activeKey >= 0}
          onpointerdown={drumHit}
        >▶ TAP</button>
      </div>
    {:else}
      <div class="piano-keys">
        {#each OCTAVE_KEYS as k}
          <button
            class="piano-key"
            class:black={k.black}
            class:active={activeKey === k.note}
            onpointerdown={() => keyDown(k.note)}
            onpointerup={keyUp}
            onpointerleave={keyUp}
          >{k.black ? '' : k.label}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .voice-demo {
    background: #1E2028;
    border-radius: 12px;
    padding: 12px 16px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: rgba(237,232,220,0.85);
  }
  .track-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-bottom: 12px;
  }
  .track-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    padding: 6px 8px 5px;
    border: 1.5px solid rgba(237,232,220,0.18);
    border-radius: 4px;
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-family: inherit;
    font-weight: 700;
    cursor: pointer;
    gap: 2px;
  }
  .track-btn:hover {
    border-color: rgba(237,232,220,0.35);
    color: rgba(237,232,220,0.65);
  }
  .track-btn.active {
    background: #787845;
    border-color: #787845;
    color: #1E2028;
  }
  .track-num {
    font-size: 10px;
    opacity: 0.5;
  }
  .track-btn.active .track-num { opacity: 0.7; }
  .track-voice {
    font-size: 9px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 48px;
  }
  .voice-select {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-bottom: 10px;
  }
  .voice-chip {
    padding: 3px 8px;
    border: 1px solid rgba(237,232,220,0.15);
    border-radius: 3px;
    background: transparent;
    color: rgba(237,232,220,0.4);
    font-family: inherit;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    user-select: none;
  }
  .voice-chip:hover {
    border-color: rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.6);
  }
  .voice-chip.active {
    background: rgba(120,120,69,0.3);
    border-color: #787845;
    color: #787845;
  }
  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 4px 0;
  }
  .group-label {
    width: 100%;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220,0.4);
    margin-top: 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }

  /* ── Drum pad ── */
  .drum-pad-row {
    margin-top: 12px;
    display: flex;
  }
  .drum-pad {
    width: 100%;
    height: 44px;
    border: 1.5px solid #787845;
    border-radius: 6px;
    background: transparent;
    color: #787845;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    transition: background 0.06s, color 0.06s;
  }
  .drum-pad:hover { background: rgba(120,120,69,0.15); }
  .drum-pad.active {
    background: #787845;
    color: #1E2028;
  }

  /* ── Piano keys ── */
  .piano-keys {
    display: flex;
    margin-top: 12px;
    height: 48px;
    position: relative;
    gap: 1px;
  }
  .piano-key {
    flex: 1;
    border: 1px solid rgba(237,232,220,0.2);
    border-radius: 0 0 4px 4px;
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.5);
    font-family: inherit;
    font-size: 8px;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 4px;
    transition: background 0.06s;
  }
  .piano-key:hover { background: rgba(237,232,220,0.15); }
  .piano-key.active {
    background: #787845;
    color: #1E2028;
  }
  .piano-key.black {
    background: #1a1a22;
    border-color: rgba(237,232,220,0.1);
    color: transparent;
    flex: 0.6;
    height: 60%;
    margin: 0 -2px;
    z-index: 1;
    border-radius: 0 0 3px 3px;
  }
  .piano-key.black:hover { background: rgba(237,232,220,0.1); }
  .piano-key.black.active {
    background: #787845;
  }
</style>
