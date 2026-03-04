<script lang="ts">
  import { song, ui, songNavBack } from '../state.svelte.ts'

  const trackName = $derived(song.tracks[ui.songNav.trackId]?.name ?? '')
  const chainLabel = $derived(`Chain ${String(ui.songNav.chainId).padStart(2, '0')}`)
  const phraseLabel = $derived.by(() => {
    const chain = song.tracks[ui.songNav.trackId]?.chains[ui.songNav.chainId]
    if (!chain) return ''
    const entry = chain.entries[ui.songNav.entryIndex]
    if (!entry) return ''
    return `Phrase ${String(entry.phraseId).padStart(2, '0')}`
  })
</script>

{#if ui.mode === 'song' && ui.songNav.level !== 'song'}
  <div class="breadcrumb">
    <button class="bc-back" onpointerdown={songNavBack} aria-label="Back">&#9664;</button>
    <button class="bc-seg" onpointerdown={() => { ui.songNav.level = 'song' }}>SONG</button>
    {#if ui.songNav.level === 'chain' || ui.songNav.level === 'phrase'}
      <span class="bc-arrow">&#9654;</span>
      <button
        class="bc-seg"
        class:current={ui.songNav.level === 'chain'}
        onpointerdown={() => { ui.songNav.level = 'chain' }}
      >{trackName} &middot; {chainLabel}</button>
    {/if}
    {#if ui.songNav.level === 'phrase'}
      <span class="bc-arrow">&#9654;</span>
      <span class="bc-seg current">{phraseLabel}</span>
    {/if}
  </div>
{/if}

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--color-fg);
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .bc-back {
    border: 1px solid rgba(237,232,220,0.25);
    background: transparent;
    color: rgba(237,232,220,0.50);
    font-size: 8px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-right: 4px;
  }
  .bc-back:active {
    background: rgba(237,232,220,0.12);
    color: rgba(237,232,220,0.80);
  }

  .bc-seg {
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.40);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 4px;
    white-space: nowrap;
  }
  .bc-seg:active:not(.current) {
    color: rgba(237,232,220,0.75);
  }
  .bc-seg.current {
    color: rgba(237,232,220,0.85);
  }

  .bc-arrow {
    font-size: 7px;
    color: rgba(237,232,220,0.20);
  }
</style>
