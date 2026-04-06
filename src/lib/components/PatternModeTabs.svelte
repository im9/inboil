<script lang="ts">
  import { prefs, setPatternEditor } from '../state.svelte.ts'

  const modes = ['grid', 'tracker'] as const
  const labels: Record<typeof modes[number], string> = { grid: 'Grid', tracker: 'Tracker' }
</script>

<div class="tab-bar">
  {#each modes as mode}
    <button
      class="tab"
      class:active={prefs.patternEditor === mode}
      onpointerdown={() => setPatternEditor(mode)}
    >{labels[mode]}</button>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: flex-end;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 14px;
    margin-right: 2px;
    border: 1px solid var(--lz-border-mid);
    border-bottom: none;
    cursor: pointer;
    background: color-mix(in srgb, var(--color-bg) 88%, var(--color-fg) 12%);
    color: var(--color-muted);
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 6px 6px 0 0;
    outline: none;
  }

  .tab.active {
    background: var(--color-bg);
    color: var(--color-fg);
    border-color: transparent;
  }
</style>
