<script lang="ts">
  import { song, ui, playback } from '../state.svelte.ts'
  import type { SceneNode } from '../types.ts'
  import { PATTERN_COLORS } from '../constants.ts'

  // BFS from root to order patterns by playback traversal; unreachable nodes appended at end
  type NavEntry = { node: SceneNode; depth: number }
  const sceneBfs = $derived.by(() => {
    const nodes = song.scene.nodes
    const edges = song.scene.edges
    const root = nodes.find(n => n.root)
    if (!root) return { ordered: nodes.filter(n => n.type === 'pattern').map(n => ({ node: n, depth: 0 })) as NavEntry[], reachable: new Set<string>() }

    const visited = new Set<string>()
    const ordered: NavEntry[] = []
    const queue: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }]
    visited.add(root.id)

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      const node = nodes.find(n => n.id === id)
      if (node?.type === 'pattern') ordered.push({ node, depth })
      const outEdges = edges.filter(e => e.from === id).sort((a, b) => a.order - b.order)
      for (const e of outEdges) {
        if (!visited.has(e.to)) {
          visited.add(e.to)
          queue.push({ id: e.to, depth: depth + 1 })
        }
      }
    }

    const reachable = new Set(ordered.map(e => e.node.id))
    for (const n of nodes) {
      if (n.type === 'pattern' && !visited.has(n.id)) ordered.push({ node: n, depth: 0 })
    }
    return { ordered, reachable }
  })
  const placedPatternNodes = $derived(sceneBfs.ordered)

  function selectSceneNode(nodeId: string) {
    ui.selectedSceneNodes = { [nodeId]: true }
    ui.focusSceneNodeId = nodeId
  }
</script>

<div class="nav-section">
  <span class="section-label">SCENE</span>
  <div class="nav-list">
    {#each placedPatternNodes as entry}
      {@const node = entry.node}
      {@const pat = song.patterns.find(p => p.id === node.patternId)}
      {@const unreachable = !sceneBfs.reachable.has(node.id)}
      {#if pat}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="nav-item"
          class:selected={ui.selectedSceneNodes[node.id]}
          class:playing={playback.playing && playback.sceneNodeId === node.id}
          class:unreachable
          onpointerdown={() => selectSceneNode(node.id)}
          style="padding-left: {4 + Math.min(entry.depth, 2) * 10}px;{playback.playing && playback.sceneNodeId === node.id ? ` --pulse-dur: ${60 / (song.bpm || 120)}s` : ''}"
        >
          <span class="nav-color" style="background: {PATTERN_COLORS[pat.color ?? 0]}"></span>
          {#if node.root}<span class="nav-root">★</span>{/if}
          <span class="nav-name">{pat.name}</span>
        </div>
      {/if}
    {/each}
    {#if !placedPatternNodes.length}
      <div class="dec-empty">No patterns in scene</div>
    {/if}
  </div>
</div>

<style>
  .section-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220, 0.4);
    padding-bottom: 2px;
  }
  .nav-section {
    margin-bottom: 4px;
  }
  .nav-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 6px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    cursor: pointer;
    transition: background 60ms;
  }
  .nav-item:hover {
    background: rgba(237,232,220, 0.08);
  }
  .nav-item.selected {
    background: rgba(237,232,220, 0.12);
  }
  .nav-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .nav-root {
    font-size: 9px;
    color: var(--color-olive);
    flex-shrink: 0;
    margin: 0 -2px;
  }
  .nav-name {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220, 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-item.unreachable {
    opacity: 0.35;
  }
  .nav-item.playing {
    animation: nav-pulse var(--pulse-dur, 0.5s) ease-in-out infinite;
  }
  .nav-item.playing .nav-color {
    box-shadow: 0 0 6px 2px currentColor;
  }
  @keyframes nav-pulse {
    0%, 100% { background: rgba(237,232,220, 0.12); }
    50% { background: rgba(237,232,220, 0.2); }
  }
  @media (max-width: 639px) {
    .nav-item {
      padding: 8px 8px;
      gap: 8px;
    }
    .nav-color {
      width: 10px;
      height: 10px;
    }
    .nav-name {
      font-size: 11px;
    }
  }
</style>
