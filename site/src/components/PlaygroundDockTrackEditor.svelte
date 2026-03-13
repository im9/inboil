<script lang="ts">
  import '../styles/playground.css'
  import { song, ui, activeCell } from '$app/lib/state.svelte.ts'
  import { cellForTrack } from '$app/lib/state.svelte.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '$app/lib/paramDefs.ts'
  import { knobValue, knobChange } from '$app/lib/paramHelpers.ts'
  import { VOICE_LIST } from '$app/lib/audio/dsp/voices.ts'
  import Knob from '$app/lib/components/Knob.svelte'

  ui.selectedTrack = 0

  const track = $derived(song.tracks[ui.selectedTrack])
  const cell  = $derived(track ? activeCell(ui.selectedTrack) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId) : [])
</script>

<div class="dock-demo not-content">
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

  <!-- Voice label -->
  {#if cell}
    {@const meta = VOICE_LIST.find(v => v.id === cell.voiceId)}
    <div class="voice-label">{meta?.fullName ?? cell.voiceId}</div>

    <!-- Synth param knobs -->
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
  {/if}
</div>

<style>
  .dock-demo {
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
  .voice-label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(237,232,220,0.7);
    margin-bottom: 10px;
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
</style>
