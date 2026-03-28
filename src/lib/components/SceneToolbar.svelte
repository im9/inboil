<script lang="ts">
  import { song, playback, ui } from '../state.svelte.ts'
  import { sceneFormatNodes } from '../sceneActions.ts'
  import { ICON } from '../icons.ts'
  import { WORLD_W, WORLD_H, toPixel } from '../sceneGeometry.ts'
  import type { BubblePickType } from './SceneBubbleMenu.svelte'

  const ADD_ITEMS: { type: BubblePickType | 'sep' | 'eraser'; tip: string; tipJa: string }[] = [
    { type: 'fn-transpose', tip: 'Transpose', tipJa: 'トランスポーズ' },
    { type: 'fn-repeat', tip: 'Repeat', tipJa: 'リピート' },
    { type: 'fn-tempo', tip: 'Tempo', tipJa: 'テンポ' },
    { type: 'fn-fx', tip: 'FX', tipJa: 'エフェクト' },
    { type: 'sep', tip: '', tipJa: '' },
    { type: 'fn-sweep', tip: 'Sweep', tipJa: 'スウィープ' },
    { type: 'turing', tip: 'Turing Machine', tipJa: 'チューリングマシン' },
    { type: 'quantizer', tip: 'Quantizer', tipJa: 'クォンタイザー' },
    { type: 'tonnetz', tip: 'Tonnetz', tipJa: 'トネッツ' },
    { type: 'sep', tip: '', tipJa: '' },
    { type: 'label', tip: 'Label', tipJa: 'ラベル' },
    { type: 'stamp', tip: 'Stamp', tipJa: 'スタンプ' },
    { type: 'eraser', tip: 'Delete node', tipJa: 'ノード削除' },
  ]

  const TOOL_ACCENT: Record<string, string> = {
    'fn-sweep': 'var(--tool-sweep)',
    turing: 'var(--tool-turing)',
    quantizer: 'var(--tool-quantizer)',
    tonnetz: 'var(--tool-tonnetz)',
  }

  const { zoom, viewEl, onpan, onreset, onadd, activeType, eraserActive, oneraser }: {
    zoom: number
    viewEl: HTMLDivElement
    onpan?: (x: number, y: number) => void
    onreset?: (x: number, y: number) => void
    onadd?: (type: BubblePickType) => void
    activeType?: BubblePickType | null
    eraserActive?: boolean
    oneraser?: () => void
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

<!-- Center: add-node tool palette -->
<div class="tool-palette">
  {#each ADD_ITEMS as item}
    {#if item.type === 'sep'}
      <div class="tool-sep"></div>
    {:else}
      {@const isEraser = item.type === 'eraser'}
      {@const accent = TOOL_ACCENT[item.type as string]}
      <button
        class="tool-btn"
        class:active={isEraser ? eraserActive : activeType === item.type}
        class:eraser={isEraser}
        aria-label={item.tip}
        data-tip={item.tip} data-tip-ja={item.tipJa}
        style={accent ? `--tool-accent: ${accent}` : ''}
        onpointerdown={(e: PointerEvent) => { e.stopPropagation(); isEraser ? oneraser?.() : onadd?.(item.type as BubblePickType) }}
      >
        {#if item.type === 'fn-transpose'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.transpose}</svg>
        {:else if item.type === 'fn-repeat'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.repeat}</svg>
        {:else if item.type === 'fn-tempo'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.tempo}</svg>
        {:else if item.type === 'fn-fx'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.fx}</svg>
        {:else if item.type === 'fn-sweep'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">{@html ICON.sweep}</svg>
        {:else if item.type === 'turing'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="5" width="2" height="4" rx="0.5"/><rect x="4" y="5" width="2" height="4" rx="0.5" opacity="0.4"/>
            <rect x="7" y="5" width="2" height="4" rx="0.5"/><rect x="10" y="5" width="2" height="4" rx="0.5" opacity="0.4"/>
            <rect x="1" y="10" width="11" height="1.5" rx="0.5" opacity="0.3"/>
          </svg>
        {:else if item.type === 'quantizer'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">
            <rect x="2" y="9" width="2" height="3" rx="0.5"/><rect x="5" y="6" width="2" height="6" rx="0.5"/>
            <rect x="8" y="3" width="2" height="9" rx="0.5"/><rect x="11" y="7" width="2" height="5" rx="0.5" opacity="0.5"/>
            <rect x="1" y="2" width="12" height="1" rx="0.5" opacity="0.2"/>
          </svg>
        {:else if item.type === 'tonnetz'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="3" r="1.5" opacity="0.4"/><circle cx="11" cy="3" r="1.5" opacity="0.4"/><circle cx="7" cy="11" r="1.5"/>
            <line x1="3" y1="3" x2="11" y2="3" stroke="currentColor" stroke-width="1" opacity="0.3"/>
            <line x1="3" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1" opacity="0.3"/>
            <line x1="11" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1" opacity="0.3"/>
          </svg>
        {:else if item.type === 'label'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.label}</svg>
        {:else if item.type === 'stamp'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">
            <rect x="4" y="1" width="6" height="5" rx="1.5"/>
            <rect x="5.5" y="5" width="3" height="3"/>
            <rect x="2.5" y="8" width="9" height="2" rx="0.5"/>
            <rect x="1.5" y="10.5" width="11" height="2" rx="0.5" opacity="0.5"/>
          </svg>
        {:else if item.type === 'eraser'}
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor" aria-hidden="true">{@html ICON.eraser}</svg>
        {/if}
      </button>
    {/if}
  {/each}
</div>

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
  /* ── Tool palette (creative tools — distinct from UI controls) ── */
  .tool-palette {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 5;
  }
  .tool-sep {
    width: 4px;
  }
  .tool-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.85);
    color: rgba(30, 32, 40, 0.50);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(30, 32, 40, 0.1);
    transition: transform 80ms, box-shadow 80ms, color 80ms, background 80ms;
  }
  .tool-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 6px rgba(30, 32, 40, 0.15);
    color: var(--color-fg);
  }
  .tool-btn:active {
    transform: scale(0.95);
  }
  .tool-btn.active {
    background: var(--tool-accent, var(--color-fg));
    color: rgba(237, 232, 220, 0.9);
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
  }
  /* Generative tool accent ring */
  .tool-btn[style*="--tool-accent"] {
    border: 2px solid var(--tool-accent);
    color: var(--tool-accent);
  }
  .tool-btn[style*="--tool-accent"]:hover {
    color: var(--tool-accent);
    background: rgba(255, 255, 255, 0.95);
  }
  .tool-btn[style*="--tool-accent"].active {
    background: var(--tool-accent);
    color: rgba(237, 232, 220, 0.9);
    border-color: var(--tool-accent);
  }

  .scene-toolbar-btn {
    position: absolute;
    top: 14px;
    width: 28px;
    height: 28px;
    border-radius: 0;
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
    border-radius: 0;
  }
  .right-1 {
    right: 40px;
    border-radius: 0;
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
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  @keyframes node-pulse {
    from { filter: brightness(1.35); }
    to   { filter: brightness(1.0); }
  }
</style>
