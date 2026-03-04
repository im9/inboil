<script lang="ts">
  import { song, ui, songNavBack } from '../state.svelte.ts'

  const trackName = $derived(song.tracks[ui.songNav.trackId]?.name ?? '')
  const chainLabel = $derived(`CHN ${String(ui.songNav.chainId).padStart(2, '0')}`)
  const phraseLabel = $derived.by(() => {
    const chain = song.tracks[ui.songNav.trackId]?.chains[ui.songNav.chainId]
    if (!chain) return ''
    const entry = chain.entries[ui.songNav.entryIndex]
    if (!entry) return ''
    return `PHR ${String(entry.phraseId).padStart(2, '0')}`
  })

  // ── Swipe-right to go back ──
  let startX = 0
  let startY = 0

  function onTouchStart(e: TouchEvent) {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
  }

  function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX
    const dy = Math.abs(e.changedTouches[0].clientY - startY)
    if (dx > 60 && dy < 40) {
      songNavBack()
    }
  }
</script>

{#if ui.mode === 'song' && ui.songNav.level !== 'song'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="breadcrumb" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
    <button class="bc-back" onpointerdown={songNavBack} aria-label="Back">&#9664;</button>

    <!-- Desktop: full breadcrumb -->
    <div class="bc-full">
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

    <!-- Mobile: compact (current level only) -->
    <div class="bc-compact">
      {#if ui.songNav.level === 'chain'}
        <span class="bc-seg current">{trackName} &middot; {chainLabel}</span>
      {:else if ui.songNav.level === 'phrase'}
        <span class="bc-seg current">{chainLabel} &gt; {phraseLabel}</span>
      {/if}
    </div>
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

  .bc-full {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bc-compact {
    display: none;
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

  @media (max-width: 639px) {
    .breadcrumb {
      padding: 3px 8px;
    }
    .bc-full {
      display: none;
    }
    .bc-compact {
      display: flex;
      align-items: center;
    }
    .bc-back {
      width: 26px;
      height: 26px;
      font-size: 10px;
    }
  }
</style>
