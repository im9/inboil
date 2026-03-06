<script lang="ts">
  export type FnNodeType = 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'

  const BUBBLE_ITEMS: { type: FnNodeType; tip: string; tipJa: string }[] = [
    { type: 'transpose', tip: 'Transpose', tipJa: 'トランスポーズ' },
    { type: 'tempo', tip: 'Tempo', tipJa: 'テンポ' },
    { type: 'repeat', tip: 'Repeat', tipJa: 'リピート' },
    { type: 'probability', tip: 'Probability', tipJa: '確率' },
    { type: 'fx', tip: 'FX', tipJa: 'エフェクト' },
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
    onpick: (type: FnNodeType) => void
    onclose: () => void
  } = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker-backdrop" onpointerdown={e => { e.stopPropagation(); onclose() }}></div>
{#each BUBBLE_ITEMS as item, i}
  {@const angle = -Math.PI / 2 + (i - (BUBBLE_ITEMS.length - 1) / 2) * 0.7}
  {@const radius = 48}
  {@const bx = pos.x + Math.cos(angle) * radius}
  {@const by = pos.y + Math.sin(angle) * radius}
  {@const clampedX = Math.max(20, Math.min(containerWidth - 20, bx))}
  {@const clampedY = Math.max(20, Math.min(containerHeight - 20, by))}
  <button
    class="bubble-item"
    style="
      left: {clampedX - 16}px;
      top: {clampedY - 16}px;
      transition-delay: {i * 30}ms;
    "
    data-tip={item.tip} data-tip-ja={item.tipJa}
    onpointerdown={e => { e.stopPropagation(); onpick(item.type) }}
  >
    {#if item.type === 'transpose'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">
        <rect x="3" y="2" width="5" height="1.5" rx="0.5"/><rect x="3" y="2" width="1.5" height="8"/>
        <circle cx="3.5" cy="11" r="2"/><rect x="6.5" y="2" width="1.5" height="6.5"/><circle cx="7.5" cy="9.5" r="2"/>
      </svg>
    {:else if item.type === 'tempo'}
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <line x1="7" y1="7" x2="7" y2="3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <line x1="7" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="7" cy="7" r="0.7" fill="currentColor"/>
      </svg>
    {:else if item.type === 'repeat'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
        <path d="M11 5.5A4.5 4.5 0 0 0 3.5 4"/><path d="M3 8.5A4.5 4.5 0 0 0 10.5 10"/>
        <polyline points="3.5,1.5 3.5,4.5 6.5,4.5"/><polyline points="10.5,12.5 10.5,9.5 7.5,9.5"/>
      </svg>
    {:else if item.type === 'probability'}
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
        <circle cx="4" cy="10" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="10" cy="4" r="1.3" fill="currentColor"/>
      </svg>
    {:else if item.type === 'fx'}
      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
        <path d="M1 5 Q3.5 3 7 5 Q10.5 7 13 5"/><path d="M1 9 Q3.5 7 7 9 Q10.5 11 13 9"/>
      </svg>
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
