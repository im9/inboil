<script lang="ts">
  import { perf } from '../state.svelte.ts'

  let { variant = 'bar' }: { variant?: 'bar' | 'bubble' } = $props()
</script>

{#if variant === 'bar'}
  <button
    class="btn-perf"
    class:active={perf.filling}
    onpointerdown={() => { perf.filling = true }}
    onpointerup={() => { perf.filling = false }}
    onpointerleave={() => { perf.filling = false }}
    data-tip="Hold for drum fill" data-tip-ja="長押しでドラムフィル"
  >FILL</button>
  <button
    class="btn-perf"
    class:active={perf.reversing}
    onpointerdown={() => { perf.reversing = true }}
    onpointerup={() => { perf.reversing = false }}
    onpointerleave={() => { perf.reversing = false }}
    data-tip="Hold to reverse playback" data-tip-ja="長押しで逆再生"
  >REV</button>
  <button
    class="btn-perf btn-brk"
    class:active={perf.breaking}
    onpointerdown={() => { perf.breaking = true }}
    onpointerup={() => { perf.breaking = false }}
    onpointerleave={() => { perf.breaking = false }}
    data-tip="Hold for rhythmic break" data-tip-ja="長押しでリズムブレイク"
  >BRK</button>
{:else}
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
{/if}

<style>
  /* ── Bar variant (PerfBar) ── */
  .btn-perf {
    border: 1.5px solid var(--color-blue);
    background: transparent;
    color: var(--color-blue);
    padding: 5px 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear;
    user-select: none;
    touch-action: none;
  }
  .btn-perf:active,
  .btn-perf.active {
    background: var(--color-blue);
    color: var(--color-bg);
  }
  .btn-brk {
    border-color: var(--color-salmon);
    color: var(--color-salmon);
  }
  .btn-brk:active,
  .btn-brk.active {
    background: var(--color-salmon);
    color: var(--color-bg);
  }

  /* ── Bubble variant (PerfBubble) ── */
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
