<script lang="ts">
  import { song, playback, ui, selectPattern } from '../state.svelte.ts'
  import { hasScenePlayback } from '../scenePlayback.ts'

  const { onplay, onstop }: {
    onplay?: () => void
    onstop?: () => void
  } = $props()

  const isScenePlaying = $derived(playback.playing && playback.mode === 'scene')

  function toggleScene() {
    if (isScenePlaying) {
      onstop?.()
    } else {
      // Switch to scene mode before playing
      playback.mode = 'scene'
      playback.sceneNodeId = null
      playback.sceneRepeatLeft = 0
      playback.sceneTranspose = 0
      playback.sceneAbsoluteKey = null
      onplay?.()
    }
  }

  interface RibbonNode {
    nodeId: string
    patternIndex: number
    name: string
    color: number
  }

  // Linearize scene graph: BFS from root, pattern nodes only
  const ribbonNodes = $derived.by(() => {
    const nodes = song.scene.nodes
    const edges = song.scene.edges
    const root = nodes.find(n => n.root)
    if (!root) return [] as RibbonNode[]

    const result: RibbonNode[] = []
    const visited = new Set<string>()
    const queue = [root.id]

    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)

      const node = nodes.find(n => n.id === id)
      if (!node) continue

      if (node.type === 'pattern' && node.patternId) {
        const pi = song.patterns.findIndex(p => p.id === node.patternId)
        if (pi >= 0) {
          result.push({
            nodeId: node.id,
            patternIndex: pi,
            name: song.patterns[pi].name || `P${pi}`,
            color: song.patterns[pi].color ?? 0,
          })
        }
      }

      // Enqueue outgoing edges (sorted by order)
      const out = edges.filter(e => e.from === id).sort((a, b) => a.order - b.order)
      for (const e of out) {
        if (!visited.has(e.to)) queue.push(e.to)
      }
    }
    return result
  })

  const hasScene = $derived(hasScenePlayback())
  const playingNodeId = $derived(playback.playing && playback.mode === 'scene' ? playback.sceneNodeId : null)

  function tapNode(rn: RibbonNode) {
    selectPattern(rn.patternIndex)
  }
</script>

{#if hasScene && ribbonNodes.length > 0}
  <div class="scene-ribbon">
    <button
      class="ribbon-play"
      class:playing={isScenePlaying}
      onpointerdown={toggleScene}
      data-tip={isScenePlaying ? 'Stop scene' : 'Play scene'}
      data-tip-ja={isScenePlaying ? 'シーン停止' : 'シーン再生'}
    >{isScenePlaying ? '■' : '▶'}</button>
    <div class="ribbon-strip">
      {#each ribbonNodes as rn, i}
        {#if i > 0}<span class="ribbon-arrow">→</span>{/if}
        <button
          class="ribbon-node"
          class:playing={playingNodeId === rn.nodeId}
          class:selected={ui.currentPattern === rn.patternIndex}
          onpointerdown={() => tapNode(rn)}
        >{rn.name}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scene-ribbon {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-top: 1px solid rgba(30,32,40,0.08);
    flex-shrink: 0;
    overflow: hidden;
  }

  .ribbon-play {
    width: 28px;
    height: 22px;
    flex-shrink: 0;
    border: 1px solid rgba(30,32,40,0.25);
    background: transparent;
    font-size: 10px;
    color: rgba(30,32,40,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition: background 60ms, border-color 60ms;
  }
  .ribbon-play:active {
    background: rgba(30,32,40,0.08);
  }
  .ribbon-play.playing {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }

  .ribbon-strip {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
    flex: 1;
  }
  .ribbon-strip::-webkit-scrollbar { display: none; }

  .ribbon-arrow {
    font-size: 9px;
    color: rgba(30,32,40,0.2);
    flex-shrink: 0;
  }

  .ribbon-node {
    padding: 3px 8px;
    border: 1px solid rgba(30,32,40,0.2);
    background: transparent;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(30,32,40,0.5);
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    text-transform: uppercase;
    transition: background 60ms, border-color 60ms;
  }

  .ribbon-node.selected {
    border-color: var(--color-fg);
    color: var(--color-fg);
  }

  .ribbon-node.playing {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
    animation: rn-pulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes rn-pulse {
    from { opacity: 1; }
    to   { opacity: 0.7; }
  }
</style>
