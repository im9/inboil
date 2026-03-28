<script lang="ts">
  import { song, ui, pushUndo } from '../state.svelte.ts'
  import { sceneSetSeed, sceneSetTargetTrack, sceneApplyGenerativePreset, autoGenerateFromNode } from '../sceneActions.ts'
  import { GENERATIVE_PRESETS } from '../generative.ts'

  const { nodeId }: { nodeId: string } = $props()

  const node = $derived(song.scene.nodes.find(n => n.id === nodeId))
  const gen = $derived(node?.generative)

  // Resolve target pattern's cells for track selector
  // Find currently matching preset index (-1 if none)
  const activePresetIdx = $derived.by(() => {
    if (!gen) return -1
    const presets = GENERATIVE_PRESETS.filter(p => p.engine === gen.engine)
    return presets.findIndex(p => {
      const pp = p.params as unknown as Record<string, unknown>
      const gp = gen.params as unknown as Record<string, unknown>
      return Object.keys(pp).every(k => k === 'engine' || JSON.stringify(pp[k]) === JSON.stringify(gp[k]))
    })
  })

  const targetPatCells = $derived.by(() => {
    const visited = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      for (const edge of song.scene.edges.filter(e => e.from === id)) {
        const target = song.scene.nodes.find(n => n.id === edge.to)
        if (!target) continue
        if (target.type === 'pattern' && target.patternId) {
          const pat = song.patterns.find(p => p.id === target.patternId)
          return pat?.cells ?? []
        }
        queue.push(target.id)
      }
    }
    return []
  })
</script>

{#if gen}
<div class="gen-common">
  <!-- Merge mode -->
  <div class="gc-row" role="tablist" aria-label="Merge mode">
    <span class="gc-label">MERGE</span>
    <span class="gc-desc">how to write</span>
    {#each [['replace', 'REPLACE'], ['merge', 'FILL']] as [m, label]}
      <button
        class="gc-pill"
        role="tab"
        aria-selected={gen.mergeMode === m}
        class:active={gen.mergeMode === m || (m === 'replace' && gen.mergeMode === 'layer')}
        onpointerdown={() => { pushUndo('Change merge mode'); gen.mergeMode = m as 'replace' | 'merge'; autoGenerateFromNode(nodeId) }}
      >{label}</button>
    {/each}
  </div>

  <!-- Target track -->
  <div class="gc-row">
    <span class="gc-label">TRACK</span>
    {#if targetPatCells.length > 0}
      <select class="gc-select"
        onchange={e => { sceneSetTargetTrack(nodeId, parseInt((e.target as HTMLSelectElement).value)); autoGenerateFromNode(nodeId) }}
      >
        {#each targetPatCells as cell}
          <option value={cell.trackId} selected={(gen.targetTrack ?? 0) === cell.trackId}>{cell.trackId + 1}: {cell.name}</option>
        {/each}
      </select>
    {:else}
      <span class="gc-dim">no target</span>
    {/if}
  </div>

  <!-- Seed -->
  <div class="gc-row">
    <span class="gc-label">SEED</span>
    <span class="gc-desc">reproducibility</span>
    {#if gen.seed != null}
      <span class="gc-val">{gen.seed}</span>
      <button class="gc-icon" aria-label="Randomize seed" data-tip="Randomize seed" data-tip-ja="シードをランダム化"
        onpointerdown={() => { sceneSetSeed(nodeId, Math.floor(Math.random() * 100000)); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 3A5 5 0 1 1 1 6.5"/><path d="M1 1v2.5h2.5"/></svg></button>
      <button class="gc-icon" aria-label="Remove seed" data-tip="Remove seed (non-deterministic)" data-tip-ja="シード解除"
        onpointerdown={() => { sceneSetSeed(nodeId, undefined); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
    {:else}
      <span class="gc-dim">off</span>
      <button class="gc-icon" aria-label="Set random seed" data-tip="Set random seed" data-tip-ja="ランダムシードを設定"
        onpointerdown={() => { sceneSetSeed(nodeId, Math.floor(Math.random() * 100000)); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2v8M2 6h8"/></svg></button>
    {/if}
  </div>

  <!-- Preset -->
  {#if GENERATIVE_PRESETS.some(p => p.engine === gen.engine)}
    <div class="gc-row">
      <span class="gc-label">PRESET</span>
      <select class="gc-select"
        onchange={e => {
          const presets = GENERATIVE_PRESETS.filter(p => p.engine === gen.engine)
          const idx = parseInt((e.target as HTMLSelectElement).value)
          if (idx >= 0 && presets[idx]) {
            sceneApplyGenerativePreset(nodeId, presets[idx].params)
            autoGenerateFromNode(nodeId)
            if (gen.engine === 'tonnetz') { ui.tonnetzNodeId = nodeId; ui.phraseView = 'tonnetz' }
          }
        }}
      >
        <option value="-1" selected={activePresetIdx < 0}>—</option>
        {#each GENERATIVE_PRESETS.filter(p => p.engine === gen.engine) as preset, i}
          <option value={i} selected={i === activePresetIdx}>{preset.name}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
{/if}

<style>
  .gen-common {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .gc-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gc-label {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.5;
  }
  .gc-val {
    font-family: var(--font-data);
    font-size: var(--fs-md);
  }
  .gc-desc {
    font-family: var(--font-data);
    font-size: 9px;
    opacity: 0.35;
    letter-spacing: 0.02em;
  }
  .gc-dim {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    opacity: 0.4;
  }
  .gc-pill {
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    cursor: pointer;
    opacity: 0.5;
  }
  .gc-pill.active {
    background: var(--lz-bg-active);
    opacity: 1;
  }
  .gc-select {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    background: transparent;
    border: 1px solid var(--lz-border-strong);
    color: inherit;
    padding: 2px 4px;
  }
  .gc-icon {
    width: 20px;
    height: 20px;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    color: var(--color-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
  }
  .gc-icon:hover {
    opacity: 1;
    background: var(--lz-bg-hover);
  }
</style>
