<script lang="ts">
  import { pattern, ui, isDrum, toggleBottomPanel, setVoiceParam, toggleSidebar } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, denormalizeParam } from '../paramDefs.ts'
  import Knob from './Knob.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track  = $derived(pattern.tracks[ui.selectedTrack])
  const drum   = $derived(isDrum(track))
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))
</script>

<div class="param-panel">
  <button
    class="btn-help"
    onpointerdown={() => toggleSidebar('help')}
    aria-label="Help"
    data-tip="Show help" data-tip-ja="ヘルプを表示"
  >
    <span class="help-flip" class:flipped={ui.sidebar === 'help'}>
      <span class="face off">?</span>
      <span class="face on">?</span>
    </span>
  </button>

  <div class="inner">
    <div class="track-info">
      <span class="track-display"><SplitFlap value={track.name} width={5} /></span>
      {#if !drum}
        <button
          class="btn-notes"
          class:active={track.bottomPanel === 'piano'}
          onpointerdown={() => toggleBottomPanel(ui.selectedTrack)}
          data-tip="Toggle piano roll" data-tip-ja="ピアノロールを表示/非表示"
        >♪ NOTES</button>
      {/if}
    </div>

    <!-- Synth params (interactive knobs) -->
    <div class="knobs" data-tip="Synth parameters — drag to adjust" data-tip-ja="シンセパラメータ — ドラッグで調整">
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

  /* ── Help button (Othello flip) ── */
  .btn-help {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    border: none;
    background: transparent;
    padding: 0;
    width: 28px;
    height: 28px;
    perspective: 80px;
  }
  .help-flip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .help-flip.flipped {
    transform: rotateY(180deg);
  }
  .btn-help:active .help-flip { transform: scale(0.85); }
  .btn-help:active .help-flip.flipped { transform: rotateY(180deg) scale(0.85); }
  .help-flip > .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    backface-visibility: hidden;
  }
  .help-flip > .face.off {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
  }
  .help-flip > .face.on {
    border: 1px solid var(--color-blue);
    background: var(--color-blue);
    color: white;
    transform: rotateY(180deg);
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
