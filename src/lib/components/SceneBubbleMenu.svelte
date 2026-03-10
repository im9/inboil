<script lang="ts">
  import type { GenerativeEngine } from '../state.svelte.ts'
  import { ICON } from '../icons.ts'

  export type BubblePickType = GenerativeEngine | 'label'

  const BUBBLE_ITEMS: { type: BubblePickType; tip: string; tipJa: string }[] = [
    { type: 'turing', tip: 'Turing Machine', tipJa: 'チューリングマシン' },
    { type: 'quantizer', tip: 'Quantizer', tipJa: 'クォンタイザー' },
    { type: 'tonnetz', tip: 'Tonnetz', tipJa: 'トネッツ' },
    { type: 'label', tip: 'Label', tipJa: 'ラベル' },
  ]

  const {
    pos,
    containerWidth,
    containerHeight,
    onpick,
    onclose,
  }: {
    pos: { x: number; y: number }
    containerWidth: number
    containerHeight: number
    onpick: (type: BubblePickType) => void
    onclose: () => void
  } = $props()

  const RADIUS = 48
  const MARGIN = RADIUS + 20  // enough room for arc + half bubble size

  // Offset the arc origin so bubbles never clip the container edge
  const origin = $derived.by(() => {
    const x = Math.max(MARGIN, Math.min(containerWidth - MARGIN, pos.x))
    const y = Math.max(MARGIN, Math.min(containerHeight - MARGIN, pos.y))
    return { x, y }
  })

  // Pick arc center angle: point away from nearest edge
  const arcCenter = $derived.by(() => {
    const nearTop = pos.y < MARGIN
    const nearBottom = pos.y > containerHeight - MARGIN
    const nearLeft = pos.x < MARGIN
    const nearRight = pos.x > containerWidth - MARGIN
    if (nearTop && nearLeft)  return Math.PI / 4
    if (nearTop && nearRight) return 3 * Math.PI / 4
    if (nearBottom && nearLeft)  return -Math.PI / 4
    if (nearBottom && nearRight) return -3 * Math.PI / 4
    if (nearTop)    return Math.PI / 2
    if (nearBottom) return -Math.PI / 2
    if (nearLeft)   return 0
    if (nearRight)  return Math.PI
    return -Math.PI / 2
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker-backdrop" onpointerdown={e => { e.stopPropagation(); onclose() }}></div>
{#each BUBBLE_ITEMS as item, i}
  {@const angle = arcCenter + (i - (BUBBLE_ITEMS.length - 1) / 2) * 0.7}
  {@const bx = origin.x + Math.cos(angle) * RADIUS}
  {@const by = origin.y + Math.sin(angle) * RADIUS}
  <button
    class="bubble-item"
    style="
      left: {bx - 16}px;
      top: {by - 16}px;
      transition-delay: {i * 30}ms;
    "
    data-tip={item.tip} data-tip-ja={item.tipJa}
    onpointerdown={e => { e.stopPropagation(); onpick(item.type) }}
  >
    {#if item.type === 'turing'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">
        <rect x="1" y="5" width="2" height="4" rx="0.5"/>
        <rect x="4" y="5" width="2" height="4" rx="0.5" opacity="0.4"/>
        <rect x="7" y="5" width="2" height="4" rx="0.5"/>
        <rect x="10" y="5" width="2" height="4" rx="0.5" opacity="0.4"/>
        <rect x="1" y="10" width="11" height="1.5" rx="0.5" opacity="0.3"/>
      </svg>
    {:else if item.type === 'quantizer'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">
        <rect x="2" y="9" width="2" height="3" rx="0.5"/>
        <rect x="5" y="6" width="2" height="6" rx="0.5"/>
        <rect x="8" y="3" width="2" height="9" rx="0.5"/>
        <rect x="11" y="7" width="2" height="5" rx="0.5" opacity="0.5"/>
        <rect x="1" y="2" width="12" height="1" rx="0.5" opacity="0.2"/>
      </svg>
    {:else if item.type === 'tonnetz'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="3" r="1.5" opacity="0.4"/>
        <circle cx="11" cy="3" r="1.5" opacity="0.4"/>
        <circle cx="7" cy="11" r="1.5"/>
        <line x1="3" y1="3" x2="11" y2="3" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        <line x1="3" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        <line x1="11" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      </svg>
    {:else if item.type === 'label'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">{@html ICON.label}</svg>
    {/if}
  </button>
{/each}

<style>
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9;
  }
  .bubble-item {
    position: absolute;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid rgba(30, 32, 40, 0.15);
    background: var(--color-fg);
    color: rgba(237, 232, 220, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.2);
    animation: bubble-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .bubble-item:hover {
    background: rgba(30, 32, 40, 0.9);
    color: white;
    transform: scale(1.15);
  }
  .bubble-item:active {
    transform: scale(0.95);
  }
  @keyframes bubble-pop {
    from { opacity: 0; transform: scale(0.3); }
    to   { opacity: 1; transform: scale(1); }
  }

  @media (pointer: coarse) {
    .bubble-item { width: 36px; height: 36px; }
  }
</style>
