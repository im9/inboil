<script lang="ts">
  import { pattern, playback, ui, toggleTrig, toggleMute } from '../state.svelte.ts'
  import Knob from './Knob.svelte'
</script>

<div class="step-grid">
  {#each pattern.tracks as track, trackId}
    {@const selected = ui.selectedTrack === trackId}

    <div
      class="track-row"
      class:selected
      class:muted={track.muted}
    >
      <!-- Track label -->
      <button
        class="track-label"
        onpointerdown={() => { ui.selectedTrack = trackId }}
      >
        <span class="track-name">{track.name}</span>
        <span class="track-type">{track.synthType.replace('Synth', '').replace('Analog', 'ANA')}</span>
      </button>

      <!-- Gain, Pan, Mute -->
      <div class="track-knobs">
        <Knob
          value={track.volume}
          label="VOL"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].volume = v }}
        />
        <Knob
          value={(track.pan + 1) / 2}
          label="PAN"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].pan = v * 2 - 1 }}
        />
      </div>
      <button
        class="btn-mute"
        onpointerdown={() => toggleMute(trackId)}
      >
        <span class="mute-flip" class:flipped={track.muted}>
          <span class="face off">M</span>
          <span class="face on">M</span>
        </span>
      </button>

      <!-- Steps -->
      <div class="steps" style="--count: {track.steps}">
        {#each track.trigs as trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          <button
            class="step"
            class:playhead={isPlayhead}
            onpointerdown={() => toggleTrig(trackId, stepIdx)}
          >
            <span class="step-flip" class:flipped={trig.active}>
              <span class="face off"></span>
              <span class="face on"></span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .step-grid {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: none;
    background: var(--color-bg);
    padding: 4px 0;
  }

  /* ── Track row ── */
  .track-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid rgba(30,32,40,0.08);
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
  }
  .track-row.selected {
    background: var(--color-surface);
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
  }
  .track-row.muted .steps {
    opacity: 0.35;
    background-image: repeating-linear-gradient(
      45deg,
      rgba(30,32,40,0.07) 0px, rgba(30,32,40,0.07) 1px,
      transparent 1px, transparent 6px
    );
  }

  /* ── Track label ── */
  .track-label {
    width: 64px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 6px;
    border: none;
    background: transparent;
    text-align: left;
  }
  .track-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    line-height: 1;
    text-transform: uppercase;
  }
  .track-type {
    font-size: 9px;
    color: var(--color-muted);
    line-height: 1;
    text-transform: uppercase;
  }

  /* ── Mute button (Othello flip) ── */
  .btn-mute {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .mute-flip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .mute-flip.flipped {
    transform: rotateY(180deg);
  }
  .btn-mute:active .mute-flip { transform: scale(0.85); }
  .btn-mute:active .mute-flip.flipped { transform: rotateY(180deg) scale(0.85); }
  .mute-flip > .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    backface-visibility: hidden;
  }
  .mute-flip > .face.off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
  }
  .mute-flip > .face.on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    transform: rotateY(180deg);
  }

  .track-knobs {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /* ── Steps ── */
  .steps {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--count), 1fr);
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: none;
    padding: 6px 0;
    height: 100%;
    align-items: center;
  }

  .step {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    max-width: 28px;
    min-width: 14px;
    perspective: 80px;
    border: none;
    background: transparent;
    padding: 0;
  }

  .step-flip {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .step-flip.flipped {
    transform: rotateY(180deg);
  }
  .step:active .step-flip { transform: scale(0.85); }
  .step:active .step-flip.flipped { transform: rotateY(180deg) scale(0.85); }

  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
  }
  .face.off {
    background: var(--color-bg);
    border: 1px solid rgba(30,32,40,0.5);
  }
  .face.on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
    transform: rotateY(180deg);
  }

  /* ── Playhead glow ── */
  .step.playhead {
    animation: ph-glow 180ms ease-out;
  }

  @keyframes ph-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
  }
</style>
