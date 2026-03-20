<script lang="ts">
  import { song, playback, ui } from '../state.svelte.ts'

  const pat = $derived(song.patterns[ui.currentPattern])
  const patName = $derived(pat.name || `PAT ${String(ui.currentPattern).padStart(2, '0')}`)

  function onTap() {
    ui.viewFocus = 'pattern'
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mini-seq" onpointerdown={onTap}>
  <span class="mini-label">{patName}</span>
  <div class="mini-grid">
    {#each pat.cells as cell}
      {@const track = song.tracks[cell.trackId]}
      {#if track && !track.muted}
        <div class="mini-track">
          {#each cell.trigs as trig, si}
            <span
              class="mini-step"
              class:on={trig.active}
              class:head={playback.playing && playback.playheads[cell.trackId] === si}
            ></span>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .mini-seq {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--color-fg);
    border-top: 1px solid rgba(237, 232, 220, 0.06);
  }

  .mini-label {
    flex-shrink: 0;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237, 232, 220, 0.45);
    white-space: nowrap;
    min-width: 40px;
  }

  .mini-grid {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow: hidden;
  }

  .mini-track {
    display: flex;
    gap: 1px;
    height: 4px;
  }

  .mini-step {
    flex: 1;
    min-width: 0;
    background: rgba(237, 232, 220, 0.06);
    border-radius: 0;
  }

  .mini-step.on {
    background: rgba(237, 232, 220, 0.30);
  }

  .mini-step.head {
    background: var(--color-blue);
  }

  .mini-step.on.head {
    background: var(--color-blue);
  }
</style>
