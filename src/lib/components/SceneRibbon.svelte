<script lang="ts">
  import { song, playback, ui, selectPattern } from '../state.svelte.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import { nodeName } from '../sceneGeometry.ts'

  function patternIndex(patternId: string): number {
    return song.patterns.findIndex(p => p.id === patternId)
  }

  function onNodeTap(node: typeof song.scene.nodes[0], e: PointerEvent) {
    if (node.type === 'pattern' && node.patternId) {
      const pi = patternIndex(node.patternId)
      if (pi >= 0) selectPattern(pi)
      // Spawn pulse
      const btn = e.currentTarget as HTMLElement
      const rect = btn.getBoundingClientRect()
      spawnPulse(rect.left + rect.width / 2, rect.bottom)
    }
    ui.selectedSceneNodes = { [node.id]: true }
  }

  function spawnPulse(x: number, y: number) {
    const dot = document.createElement('span')
    dot.className = 'tap-pulse'
    dot.style.left = `${x}px`
    dot.style.top = `${y}px`
    document.body.appendChild(dot)
    dot.addEventListener('animationend', () => dot.remove())
  }

  function onRibbonBgTap() {
    ui.viewFocus = 'scene'
  }

  // Order nodes by graph traversal order (root first, then follow edges)
  const orderedNodes = $derived.by(() => {
    const nodes = song.scene.nodes
    const edges = song.scene.edges
    if (nodes.length === 0) return []
    const root = nodes.find(n => n.root) ?? nodes[0]
    const visited = new Set<string>()
    const result: typeof nodes = []
    const queue = [root.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = nodes.find(n => n.id === id)
      if (node) result.push(node)
      for (const e of edges) {
        if (e.from === id && !visited.has(e.to)) queue.push(e.to)
      }
    }
    // Add any unconnected nodes at the end
    for (const n of nodes) {
      if (!visited.has(n.id)) result.push(n)
    }
    return result
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scene-ribbon" onpointerdown={onRibbonBgTap}>
  {#each orderedNodes as node, i (node.id)}
    {@const isPattern = node.type === 'pattern'}
    {@const isPlaying = playback.playing && playback.sceneNodeId === node.id}
    {@const isSelected = !!ui.selectedSceneNodes[node.id]}
    {@const pc = isPattern ? (song.patterns.find(p => p.id === node.patternId)?.color ?? 0) : -1}
    <button
      class="ribbon-node"
      class:fn={!isPattern}
      class:playing={isPlaying}
      class:selected={isSelected}
      style="--i: {i}; {isPattern ? `--nc: ${PATTERN_COLORS[pc]}` : ''}"
      onpointerdown={e => { e.stopPropagation(); onNodeTap(node, e) }}
    >
      {nodeName(node, song.patterns)}
    </button>
    {#if i < orderedNodes.length - 1}
      <span class="ribbon-arrow">›</span>
    {/if}
  {/each}
</div>

<style>
  .scene-ribbon {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 100%;
    padding: 0 8px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    cursor: pointer;
    background: var(--color-fg);
    border-bottom: 1px solid rgba(237, 232, 220, 0.06);
  }
  .scene-ribbon::-webkit-scrollbar { height: 0; display: none; }

  .ribbon-node {
    flex-shrink: 0;
    padding: 2px 8px;
    border: 1px solid rgba(237, 232, 220, 0.15);
    border-radius: 0;
    background: rgba(237, 232, 220, 0.06);
    color: rgba(237, 232, 220, 0.55);
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    cursor: pointer;
    animation: pop-in 0.15s cubic-bezier(0.2, 0, 0, 1.2) backwards;
    animation-delay: calc(var(--i) * 30ms);
  }

  .ribbon-node:not(.fn) {
    border-color: color-mix(in srgb, var(--nc, rgba(237,232,220,0.15)) 40%, transparent);
    background: color-mix(in srgb, var(--nc, rgba(237,232,220,0.06)) 15%, transparent);
  }

  .ribbon-node.fn {
    border-radius: var(--radius-md);
    font-size: 7px;
    padding: 2px 6px;
    color: rgba(237, 232, 220, 0.45);
  }

  .ribbon-node.playing {
    background: color-mix(in srgb, var(--color-blue) 25%, transparent);
    border-color: var(--color-blue);
    color: rgba(237, 232, 220, 0.85);
  }

  .ribbon-node.selected {
    border-color: var(--color-olive);
    color: rgba(237, 232, 220, 0.7);
  }

  .ribbon-node:active {
    opacity: 0.7;
  }

  .ribbon-arrow {
    color: rgba(237, 232, 220, 0.15);
    font-size: 10px;
    flex-shrink: 0;
    user-select: none;
    pointer-events: none;
  }

  @keyframes pop-in {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .ribbon-node {
      animation: none;
    }
  }
</style>
