<script lang="ts">
  import type { FxFlavourKey } from '../constants.ts'
  import { FX_FLAVOURS } from '../constants.ts'
  import { fxFlavours } from '../state.svelte.ts'

  const {
    fxKey,
    pos,
    containerWidth,
    containerHeight,
    onpick,
    onclose,
  }: {
    fxKey: FxFlavourKey
    pos: { x: number; y: number }
    containerWidth: number
    containerHeight: number
    onpick: (id: string) => void
    onclose: () => void
  } = $props()

  const items = $derived(FX_FLAVOURS[fxKey])
  const current = $derived(fxFlavours[fxKey])

  const RADIUS = 44
  const MARGIN = RADIUS + 20

  const origin = $derived.by(() => ({
    x: Math.max(MARGIN, Math.min(containerWidth - MARGIN, pos.x)),
    y: Math.max(MARGIN, Math.min(containerHeight - MARGIN, pos.y)),
  }))

  const arcCenter = $derived.by(() => {
    const nearTop    = pos.y < MARGIN
    const nearBottom = pos.y > containerHeight - MARGIN
    const nearLeft   = pos.x < MARGIN
    const nearRight  = pos.x > containerWidth - MARGIN
    if (nearTop && nearLeft)     return Math.PI / 4
    if (nearTop && nearRight)    return 3 * Math.PI / 4
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
{#each items as item, i}
  {@const angle = arcCenter + (i - (items.length - 1) / 2) * 0.8}
  {@const bx = origin.x + Math.cos(angle) * RADIUS}
  {@const by = origin.y + Math.sin(angle) * RADIUS}
  <button
    class="bubble-item"
    class:current={item.id === current}
    style="
      left: {bx - 20}px;
      top: {by - 20}px;
      transition-delay: {i * 30}ms;
    "
    data-tip={item.tip} data-tip-ja={item.tipJa}
    onpointerdown={e => { e.stopPropagation(); onpick(item.id) }}
  >
    <span class="bubble-label">{item.label}</span>
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
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1.5px solid rgba(237, 232, 220, 0.15);
    background: var(--color-fg);
    color: rgba(237, 232, 220, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.35);
    animation: bubble-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .bubble-item.current {
    background: rgba(237, 232, 220, 0.15);
    border-color: rgba(237, 232, 220, 0.45);
    color: rgba(237, 232, 220, 0.9);
  }
  .bubble-item:hover {
    background: rgba(30, 32, 40, 0.7);
    color: white;
    transform: scale(1.12);
  }
  .bubble-item:active {
    transform: scale(0.95);
  }
  .bubble-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.05em;
    pointer-events: none;
  }
  @keyframes bubble-pop {
    from { opacity: 0; transform: scale(0.3); }
    to   { opacity: 1; transform: scale(1); }
  }

  @media (pointer: coarse) {
    .bubble-item { width: 44px; height: 44px; }
    .bubble-label { font-size: 9px; }
  }
</style>
