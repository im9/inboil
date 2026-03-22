<script lang="ts">
  import { STAMP_LIBRARY, STAMP_IDS } from '../stampLibrary.ts'

  const { pos, below = false, onpick, onclose }: {
    pos: { x: number; y: number }
    below?: boolean
    onpick: (stampId: string) => void
    onclose: () => void
  } = $props()

  const COLS = 5
  const CELL = 36
  const GAP = 4
  const PAD = 8
  const rows = Math.ceil(STAMP_IDS.length / COLS)
  const gridW = COLS * CELL + (COLS - 1) * GAP + PAD * 2
  const gridH = rows * CELL + (rows - 1) * GAP + PAD * 2

  // Position so the grid doesn't overflow the viewport
  const left = $derived(Math.max(8, Math.min(pos.x - gridW / 2, window.innerWidth - gridW - 8)))
  const top = $derived(
    below
      ? Math.min(pos.y, window.innerHeight - gridH - 8)
      : Math.max(8, Math.min(pos.y - gridH - 12, window.innerHeight - gridH - 8))
  )
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="stamp-picker-backdrop" onpointerdown={(e) => { e.stopPropagation(); onclose() }}></div>
<div class="stamp-picker" style="left: {left}px; top: {top}px;">
  <div class="stamp-picker-label">STAMPS</div>
  <div class="stamp-picker-grid">
    {#each STAMP_IDS as sid}
      {@const def = STAMP_LIBRARY[sid]}
      <button
        class="stamp-picker-item"
        style="color: {def.color}"
        data-tip={def.name}
        data-tip-ja={def.nameJa}
        onpointerdown={(e) => { e.stopPropagation(); onpick(sid) }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          {@html def.svg}
        </svg>
      </button>
    {/each}
  </div>
</div>

<style>
  .stamp-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9;
  }
  .stamp-picker {
    position: absolute;
    z-index: 10;
    background: var(--color-fg);
    border: 1px solid rgba(30, 32, 40, 0.15);
    padding: 4px 8px 8px;
    animation: stamp-picker-in 120ms ease-out both;
  }
  .stamp-picker-label {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237, 232, 220, 0.45);
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .stamp-picker-grid {
    display: grid;
    grid-template-columns: repeat(5, 36px);
    gap: 4px;
  }
  .stamp-picker-item {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid rgba(237, 232, 220, 0.1);
    color: rgba(237, 232, 220, 0.7);
    cursor: pointer;
    transition: background 80ms, color 80ms;
  }
  .stamp-picker-item:hover {
    background: rgba(237, 232, 220, 0.1);
    color: rgba(237, 232, 220, 1);
  }
  .stamp-picker-item:active {
    transform: scale(0.9);
  }
  @keyframes stamp-picker-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
