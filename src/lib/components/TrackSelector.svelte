<script lang="ts">
  import { song, ui } from '../state.svelte.ts'
</script>

<div class="track-bar" class:hide-desktop={true}>
  <div class="track-dots" data-tip="Select track" data-tip-ja="トラックを選択">
    {#each song.patterns[ui.currentPattern].cells as c}
      <button
        class="dot"
        class:active={c.trackId === ui.selectedTrack}
        onpointerdown={() => { ui.selectedTrack = c.trackId }}
        aria-label="Track {c.name}"
      >{c.name.slice(0, 2)}</button>
    {/each}
  </div>
</div>

<style>
  .track-bar {
    display: flex;
    align-items: center;
    padding: 5px 12px;
    background: var(--color-fg);
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .track-dots {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }
  .dot {
    height: 18px;
    padding: 0 5px;
    border: 1px solid rgba(237,232,220,0.2);
    background: transparent;
    color: rgba(237,232,220,0.35);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  @media (min-width: 640px) {
    .track-bar.hide-desktop { display: none; }
  }
</style>
