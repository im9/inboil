<script lang="ts">
  import { perf } from '../state.svelte.ts'

  let open = $state(false)
  let dragging = $state(false)

  // Position state (fixed, bottom-right default)
  let posX = $state(window.innerWidth - 56)
  let posY = $state(window.innerHeight - 220)

  // Drag tracking
  let dragStartX = 0
  let dragStartY = 0
  let startPosX = 0
  let startPosY = 0
  let hasMoved = false

  const anyActive = $derived(perf.filling || perf.reversing || perf.breaking)

  function onTriggerDown(e: PointerEvent) {
    dragging = true
    hasMoved = false
    dragStartX = e.clientX
    dragStartY = e.clientY
    startPosX = posX
    startPosY = posY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onTriggerMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true
    posX = Math.max(0, Math.min(window.innerWidth - 44, startPosX + dx))
    posY = Math.max(0, Math.min(window.innerHeight - 44, startPosY + dy))
  }

  function onTriggerUp() {
    dragging = false
    // Snap to nearest horizontal edge
    const mid = window.innerWidth / 2
    posX = posX + 22 < mid ? 12 : window.innerWidth - 56
    if (!hasMoved) open = !open
  }

  function closeMenu() { open = false }
</script>

<!-- Backdrop -->
{#if open}
  <button class="bubble-backdrop" onpointerdown={closeMenu}></button>
{/if}

<!-- Floating trigger -->
<div
  class="bubble-trigger"
  class:active={anyActive}
  class:open
  style="left:{posX}px;top:{posY}px"
  onpointerdown={onTriggerDown}
  onpointermove={onTriggerMove}
  onpointerup={onTriggerUp}
  role="button"
  tabindex="-1"
>
  <span class="bubble-icon">{anyActive ? '!' : '+'}</span>
</div>

<!-- Expanded buttons -->
{#if open}
  <div class="bubble-menu" style="left:{posX}px;top:{posY}px">
    <button
      class="bubble-btn fill"
      class:active={perf.filling}
      style="--offset: 1"
      onpointerdown={() => { perf.filling = true }}
      onpointerup={() => { perf.filling = false }}
      onpointerleave={() => { perf.filling = false }}
    >FILL</button>
    <button
      class="bubble-btn rev"
      class:active={perf.reversing}
      style="--offset: 2"
      onpointerdown={() => { perf.reversing = true }}
      onpointerup={() => { perf.reversing = false }}
      onpointerleave={() => { perf.reversing = false }}
    >REV</button>
    <button
      class="bubble-btn brk"
      class:active={perf.breaking}
      style="--offset: 3"
      onpointerdown={() => { perf.breaking = true }}
      onpointerup={() => { perf.breaking = false }}
      onpointerleave={() => { perf.breaking = false }}
    >BRK</button>
  </div>
{/if}

<style>
  .bubble-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
    background: rgba(0,0,0,0.15);
    border: none;
  }

  .bubble-trigger {
    position: fixed;
    z-index: 50;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(30,32,40,0.75);
    border: 1.5px solid rgba(237,232,220,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    user-select: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: background 120ms, border-color 120ms;
  }
  .bubble-trigger.active {
    background: rgba(30,32,40,0.90);
    border-color: var(--color-blue);
  }
  .bubble-trigger.open {
    background: rgba(30,32,40,0.95);
    border-color: rgba(237,232,220,0.50);
  }

  .bubble-icon {
    color: rgba(237,232,220,0.70);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }
  .bubble-trigger.active .bubble-icon {
    color: var(--color-blue);
  }

  .bubble-menu {
    position: fixed;
    z-index: 50;
    pointer-events: none;
  }

  .bubble-btn {
    position: absolute;
    width: 44px;
    height: 36px;
    border-radius: 8px;
    border: 1.5px solid var(--color-blue);
    background: rgba(30,32,40,0.90);
    color: var(--color-blue);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    user-select: none;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transform: translateY(calc(-1 * var(--offset) * 44px));
    animation: bubble-pop 150ms cubic-bezier(0.2, 0, 0.4, 1.3) backwards;
    animation-delay: calc((var(--offset) - 1) * 30ms);
  }

  .bubble-btn.brk {
    border-color: var(--color-salmon);
    color: var(--color-salmon);
  }

  .bubble-btn.active {
    background: var(--color-blue);
    color: var(--color-bg);
  }
  .bubble-btn.brk.active {
    background: var(--color-salmon);
    color: var(--color-bg);
  }

  @keyframes bubble-pop {
    from {
      opacity: 0;
      transform: translateY(0) scale(0.5);
    }
    to {
      opacity: 1;
      transform: translateY(calc(-1 * var(--offset) * 44px)) scale(1);
    }
  }
</style>
