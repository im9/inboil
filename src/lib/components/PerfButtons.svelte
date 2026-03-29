<script lang="ts">
  import { perf, playback } from '../state.svelte.ts'
  import { isGuest, guestPerf } from '../multiDevice/guest.ts'
  import { captureToggle } from '../sweepRecorder.svelte.ts'
  import type { SweepToggleTarget } from '../types.ts'

  let { variant = 'bar' }: { variant?: 'bar' | 'bubble' } = $props()

  const stopped = $derived(!playback.playing)

  const PERF_TARGET: Record<string, SweepToggleTarget> = {
    fill: { kind: 'perf', param: 'fill' },
    reverse: { kind: 'perf', param: 'rev' },
    break: { kind: 'perf', param: 'brk' },
  }
  const PERF_COLOR: Record<string, string> = {
    fill: '#5b8a72', reverse: '#5b8a72', break: '#c47a5a',
  }

  function setPerf(action: 'fill' | 'reverse' | 'break', on: boolean) {
    if (isGuest()) { guestPerf(action, on); return }
    if (action === 'fill') perf.filling = on
    else if (action === 'reverse') perf.reversing = on
    else perf.breaking = on
    captureToggle(PERF_TARGET[action], on, PERF_COLOR[action])
  }
</script>

{#if variant === 'bar'}
  <button
    class="btn-perf"
    class:active={perf.filling}
    class:stopped
    onpointerdown={() => setPerf('fill', true)}
    onpointerup={() => setPerf('fill', false)}
    onpointerleave={() => setPerf('fill', false)}
    data-tip="Hold for drum fill (play first)" data-tip-ja="長押しでドラムフィル (再生中のみ)"
  >FILL</button>
  <button
    class="btn-perf"
    class:active={perf.reversing}
    class:stopped
    onpointerdown={() => setPerf('reverse', true)}
    onpointerup={() => setPerf('reverse', false)}
    onpointerleave={() => setPerf('reverse', false)}
    data-tip="Hold to reverse playback (play first)" data-tip-ja="長押しで逆再生 (再生中のみ)"
  >REV</button>
  <button
    class="btn-perf btn-brk"
    class:active={perf.breaking}
    class:stopped
    onpointerdown={() => setPerf('break', true)}
    onpointerup={() => setPerf('break', false)}
    onpointerleave={() => setPerf('break', false)}
    data-tip="Hold for rhythmic break (play first)" data-tip-ja="長押しでリズムブレイク (再生中のみ)"
  >BRK</button>
{:else}
  <button
    class="bubble-btn fill"
    class:active={perf.filling}
    style="--offset: 1"
    onpointerdown={() => setPerf('fill', true)}
    onpointerup={() => setPerf('fill', false)}
    onpointerleave={() => setPerf('fill', false)}
  >FILL</button>
  <button
    class="bubble-btn rev"
    class:active={perf.reversing}
    style="--offset: 2"
    onpointerdown={() => setPerf('reverse', true)}
    onpointerup={() => setPerf('reverse', false)}
    onpointerleave={() => setPerf('reverse', false)}
  >REV</button>
  <button
    class="bubble-btn brk"
    class:active={perf.breaking}
    style="--offset: 3"
    onpointerdown={() => setPerf('break', true)}
    onpointerup={() => setPerf('break', false)}
    onpointerleave={() => setPerf('break', false)}
  >BRK</button>
{/if}

<style>
  /* ── Bar variant (PerfBar) ── */
  .btn-perf {
    border: 1.5px solid var(--color-blue);
    background: transparent;
    color: var(--color-blue);
    padding: 5px 10px;
    font-size: var(--fs-md);
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
  .btn-perf.stopped {
    border-color: var(--dz-border);
    color: var(--dz-border-mid);
    cursor: default;
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
  .btn-brk.stopped {
    border-color: var(--dz-border);
    color: var(--dz-border-mid);
  }

  /* ── Bubble variant (MobilePerfSheet) ── */
  .bubble-btn {
    position: absolute;
    width: 44px;
    height: 36px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-blue);
    background: var(--lz-text-strong);
    color: var(--color-blue);
    font-size: var(--fs-sm);
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
