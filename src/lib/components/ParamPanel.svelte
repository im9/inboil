<script lang="ts">
  import { pattern, ui, isDrum, toggleBottomPanel, setVoiceParam } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, denormalizeParam } from '../paramDefs.ts'
  import Knob from './Knob.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track  = $derived(pattern.tracks[ui.selectedTrack])
  const drum   = $derived(isDrum(track))
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))
</script>

<div class="param-panel">
  <!-- Geometric decoration: circle + rect -->
  <div class="geo" aria-hidden="true">
    <div class="geo-circle"></div>
    <div class="geo-rect"></div>
  </div>

  <div class="inner">
    <div class="track-info">
      <span class="track-display"><SplitFlap value={track.name} width={5} /></span>
      {#if !drum}
        <button
          class="btn-notes"
          class:active={track.bottomPanel === 'piano'}
          onpointerdown={() => toggleBottomPanel(ui.selectedTrack)}
        >♪ NOTES</button>
      {/if}
    </div>

    <!-- Synth params (interactive knobs) -->
    <div class="knobs">
      {#each params as p}
        <Knob
          value={normalizeParam(p, track.voiceParams[p.key] ?? p.default)}
          label={p.label}
          size={32}
          onchange={v => setVoiceParam(ui.selectedTrack, p.key, denormalizeParam(p, v))}
        />
      {/each}
    </div>

  </div>
</div>

<style>
  .param-panel {
    position: relative;
    background: var(--color-fg);
    color: var(--color-bg);
    padding: 10px 16px;
    flex-shrink: 0;
    overflow: hidden;
    min-height: 84px;
  }

  /* ── Geometric decoration ── */
  .geo {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
    pointer-events: none;
    opacity: 0.2;
  }
  .geo-circle {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--color-olive);
  }
  .geo-rect {
    width: 24px; height: 10px;
    background: var(--color-blue);
  }

  /* ── Inner layout ── */
  .inner {
    display: flex;
    gap: 16px;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .track-info {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .track-display {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: var(--color-bg);
  }

  .btn-notes {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .btn-notes:active,
  .btn-notes.active {
    background: var(--color-blue);
    border-color: var(--color-blue);
    color: white;
  }

  /* ── Synth params (interactive knobs) ── */
  .knobs {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    flex: 1;
  }

</style>
