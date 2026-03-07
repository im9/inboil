<script lang="ts">
  import { song, playback, ui, sceneFormatNodes } from '../state.svelte.ts'
  import { ICON } from '../icons.ts'
  import { WORLD_W, WORLD_H, toPixel } from '../sceneGeometry.ts'

  const { zoom, viewEl, onpan, onreset }: {
    zoom: number
    viewEl: HTMLDivElement
    onpan?: (x: number, y: number) => void
    onreset?: (x: number, y: number) => void
  } = $props()

  function centerPan() {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    return {
      x: (rect.width - WORLD_W) / 2,
      y: (rect.height - WORLD_H) / 2,
    }
  }

  function focusRoot() {
    const root = song.scene.nodes.find(n => n.root)
    if (!root || !viewEl) return
    const rect = viewEl.getBoundingClientRect()
    const pos = toPixel(root.x, root.y, WORLD_W, WORLD_H)
    return {
      x: rect.width / 2 - pos.x * zoom,
      y: rect.height / 2 - pos.y * zoom,
    }
  }

  function focusPlaying() {
    if (!playback.sceneNodeId || !viewEl) return
    const node = song.scene.nodes.find(n => n.id === playback.sceneNodeId)
    if (!node) return
    const rect = viewEl.getBoundingClientRect()
    const pos = toPixel(node.x, node.y, WORLD_W, WORLD_H)
    return {
      x: rect.width / 2 - pos.x * zoom,
      y: rect.height / 2 - pos.y * zoom,
    }
  }
</script>

{#if song.scene.nodes.length > 1}
  <button
    class="scene-toolbar-btn right-0"
    aria-label="Auto-layout horizontal"
    data-tip="Auto-layout →" data-tip-ja="自動整列 →"
    onpointerdown={() => sceneFormatNodes(Object.keys(ui.selectedSceneNodes).length > 0 ? ui.selectedSceneNodes : undefined, 'horizontal')}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">{@html ICON.autoLayout}</svg>
  </button>
  <button
    class="scene-toolbar-btn right-1"
    aria-label="Auto-layout vertical"
    data-tip="Auto-layout ↓" data-tip-ja="自動整列 ↓"
    onpointerdown={() => sceneFormatNodes(Object.keys(ui.selectedSceneNodes).length > 0 ? ui.selectedSceneNodes : undefined, 'vertical')}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true" style="transform: rotate(90deg)">{@html ICON.autoLayout}</svg>
  </button>
  <button
    class="scene-toolbar-btn right-2"
    aria-label="Focus root node"
    data-tip="Focus root" data-tip-ja="ルートにフォーカス"
    onpointerdown={() => {
      const p = focusRoot()
      if (p) { onpan?.(p.x, p.y) }
    }}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICON.focusRoot}</svg>
  </button>
  {#if playback.playing && playback.mode === 'scene' && playback.sceneNodeId}
    <button
      class="scene-toolbar-btn right-3"
      aria-label="Focus playing node"
      data-tip="Focus playing" data-tip-ja="再生中にフォーカス"
      style="--beat: {30 / song.bpm}s; color: var(--color-olive); animation: node-pulse var(--beat, 0.25s) ease-out infinite alternate"
      onpointerdown={() => {
        const p = focusPlaying()
        if (p) { onpan?.(p.x, p.y) }
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="4"/></svg>
    </button>
  {/if}
{/if}
{#if zoom !== 1}
  <button
    class="scene-toolbar-btn zoom-reset"
    data-tip="Reset zoom" data-tip-ja="ズームリセット"
    onpointerdown={() => {
      const p = centerPan()
      if (p) onreset?.(p.x, p.y)
    }}
  >{Math.round(zoom * 100)}%</button>
{/if}

<style>
  .scene-toolbar-btn {
    position: absolute;
    top: 8px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(30, 32, 40, 0.12);
    background: rgba(255, 255, 255, 0.8);
    color: rgba(30, 32, 40, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }
  .scene-toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-fg);
  }
  .right-0 {
    right: 8px;
    border-radius: 0 4px 4px 0;
  }
  .right-1 {
    right: 40px;
    border-radius: 4px 0 0 4px;
    border-right: none;
  }
  .right-2 {
    right: 76px;
  }
  .right-3 {
    right: 110px;
  }
  .zoom-reset {
    right: 110px;
    width: auto;
    padding: 0 8px;
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  @keyframes node-pulse {
    from { filter: brightness(1.35); }
    to   { filter: brightness(1.0); }
  }
</style>
