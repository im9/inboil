<script lang="ts">
  import {
    song, ui,
    songSetRowChainId,
    addChainEntry, removeChainEntry, moveChainEntry,
    setChainEntryTranspose, setChainEntryPhrase,
    drillToPhrase,
  } from '../state.svelte.ts'

  const trackId = $derived(ui.songNav.trackId)
  const chainId = $derived(ui.songNav.chainId)
  const track = $derived(song.tracks[trackId])
  const chain = $derived(track?.chains[chainId] ?? null)
  const phrases = $derived(track?.phrases ?? [])

  function stepChainId(dir: -1 | 1) {
    const maxChain = track.chains.length
    let next = chainId + dir
    if (next < 0) next = maxChain - 1
    if (next >= maxChain) next = 0
    songSetRowChainId(ui.songNav.rowIndex, trackId, next)
    ui.songNav.chainId = next
  }

  function stepTranspose(entryIndex: number, dir: -1 | 1) {
    if (!chain) return
    const entry = chain.entries[entryIndex]
    if (!entry) return
    setChainEntryTranspose(trackId, chainId, entryIndex, entry.transpose + dir)
  }

  function stepPhrase(entryIndex: number, dir: -1 | 1) {
    if (!chain) return
    const entry = chain.entries[entryIndex]
    if (!entry) return
    const maxPh = phrases.length
    let next = entry.phraseId + dir
    if (next < 0) next = maxPh - 1
    if (next >= maxPh) next = 0
    setChainEntryPhrase(trackId, chainId, entryIndex, next)
  }
</script>

{#if chain}
  <div class="chain-editor">
    <div class="ce-header">
      <span class="ce-label">CHAIN</span>
      <span class="ce-id">{String(chainId).padStart(2, '0')}</span>
      <span class="ce-sep">|</span>
      <span class="ce-track">{track.name}</span>
      <span class="ce-nav">
        <button class="ce-nav-btn" onpointerdown={() => stepChainId(-1)}>&#9664;</button>
        <button class="ce-nav-btn" onpointerdown={() => stepChainId(1)}>&#9654;</button>
      </span>
    </div>

    <div class="ce-entries">
      {#each chain.entries as entry, ei}
        <div class="ce-entry">
          <span class="ce-idx">{String(ei + 1).padStart(2, '0')}</span>

          <button class="ce-ph-nav" onpointerdown={() => stepPhrase(ei, -1)}>&#9664;</button>
          <button class="ce-phrase" onpointerdown={() => drillToPhrase(ei)}
            data-tip="Edit this phrase" data-tip-ja="このフレーズを編集"
          >
            <span class="ce-ph-id">{String(entry.phraseId).padStart(2, '0')}</span>
            <span class="ce-ph-name">{phrases[entry.phraseId]?.name ?? '---'}</span>
          </button>
          <button class="ce-ph-nav" onpointerdown={() => stepPhrase(ei, 1)}>&#9654;</button>

          <button class="ce-tr-nav" onpointerdown={() => stepTranspose(ei, -1)}>&#9664;</button>
          <span class="ce-transpose">{entry.transpose >= 0 ? '+' : ''}{entry.transpose}st</span>
          <button class="ce-tr-nav" onpointerdown={() => stepTranspose(ei, 1)}>&#9654;</button>

          <button class="ce-btn" onpointerdown={() => moveChainEntry(trackId, chainId, ei, -1)}
            disabled={ei === 0}
            data-tip="Move entry up" data-tip-ja="エントリーを上に移動"
          >&#9650;</button>
          <button class="ce-btn" onpointerdown={() => moveChainEntry(trackId, chainId, ei, 1)}
            disabled={ei === chain.entries.length - 1}
            data-tip="Move entry down" data-tip-ja="エントリーを下に移動"
          >&#9660;</button>
          <button class="ce-btn ce-del"
            onpointerdown={() => removeChainEntry(trackId, chainId, ei)}
            disabled={chain.entries.length <= 1}
            data-tip="Remove entry" data-tip-ja="エントリーを削除"
          >&times;</button>
        </div>
      {/each}
    </div>

    <div class="ce-actions">
      <button class="ce-add"
        onpointerdown={() => addChainEntry(trackId, chainId, 0)}
        disabled={chain.entries.length >= 16}
        data-tip="Add phrase to this chain" data-tip-ja="このチェーンにフレーズを追加"
      >+ ADD PHRASE</button>
    </div>
  </div>
{/if}

<style>
  .chain-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .ce-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .ce-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.35);
  }

  .ce-id {
    font-family: var(--font-data);
    font-size: 14px;
    color: rgba(237,232,220,0.70);
  }

  .ce-sep {
    font-size: 12px;
    color: rgba(237,232,220,0.12);
  }

  .ce-track {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-olive);
  }

  .ce-nav {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  .ce-nav-btn {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    width: 20px;
    height: 20px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ce-nav-btn:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.70); }

  .ce-entries {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .ce-entry {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(237,232,220,0.04);
    height: 30px;
  }

  .ce-idx {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.20);
    width: 16px;
    flex-shrink: 0;
  }

  .ce-ph-nav {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 14px;
    height: 18px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ce-ph-nav:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  .ce-phrase {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 2px 4px;
    cursor: pointer;
  }
  .ce-phrase:hover {
    background: rgba(237,232,220,0.08);
  }

  .ce-ph-id {
    font-family: var(--font-data);
    font-size: 11px;
    color: rgba(237,232,220,0.60);
  }

  .ce-ph-name {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ce-tr-nav {
    border: 1px solid rgba(237,232,220,0.10);
    background: transparent;
    color: rgba(237,232,220,0.25);
    width: 12px;
    height: 16px;
    font-size: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ce-tr-nav:active { background: rgba(237,232,220,0.08); color: rgba(237,232,220,0.55); }

  .ce-transpose {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    min-width: 30px;
    text-align: center;
    flex-shrink: 0;
  }

  .ce-btn {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 18px;
    height: 18px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ce-btn:active:not(:disabled) { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }
  .ce-btn:disabled { opacity: 0.3; cursor: default; }

  .ce-del:active:not(:disabled) { background: rgba(237,232,220,0.10); color: var(--color-salmon); }

  .ce-actions {
    padding: 8px 10px;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .ce-add {
    width: 100%;
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 5px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .ce-add:active:not(:disabled) { background: var(--color-olive); color: var(--color-fg); }
  .ce-add:disabled { opacity: 0.3; cursor: default; }
</style>
