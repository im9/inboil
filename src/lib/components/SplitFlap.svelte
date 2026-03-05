<script lang="ts">
  interface Props {
    value: string | number
    width?: number
  }
  let { value, width }: Props = $props()

  function fmt(v: string | number): string {
    const s = String(v)
    const w = width ?? (typeof v === 'number' ? 3 : s.length)
    return typeof v === 'number' ? s.padStart(w, ' ') : s.padEnd(w, ' ')
  }

  // svelte-ignore state_referenced_locally
  const initial = fmt(value)
  let curStr = $state(initial)
  let prevStr = $state(initial)
  let flipping = $state<boolean[]>(new Array(initial.length).fill(false))

  const curChars  = $derived(curStr.split(''))
  const prevChars = $derived(prevStr.split(''))

  $effect.pre(() => {
    const newStr = fmt(value)
    if (newStr !== curStr) {
      prevStr = curStr
      curStr = newStr
      const len = newStr.length
      if (flipping.length !== len) {
        flipping = new Array(len).fill(true)
      } else {
        for (let i = 0; i < len; i++) {
          if (prevStr[i] !== newStr[i]) flipping[i] = true
        }
      }
    }
  })

  function onEnd(i: number) {
    flipping[i] = false
  }
</script>

<span class="split-flap">
  {#each curChars as ch, i}
    <span class="flap-cell">
      <!-- Layer 1 (behind): top = new value revealed, bottom = old value -->
      <span class="half top queued">
        <span class="char">{ch}</span>
      </span>
      <span class="half bottom visible">
        <span class="char">{ch}</span>
      </span>

      <!-- Layer 2 (front): these flip away / flip in -->
      {#if flipping[i]}
        <!-- Old top flap falls forward -->
        <span class="half top flip-out" onanimationend={() => onEnd(i)}>
          <span class="char">{prevChars[i]}</span>
        </span>
        <!-- New bottom flap swings in from top -->
        <span class="half bottom flip-in">
          <span class="char">{ch}</span>
        </span>
      {:else}
        <!-- Static: top shows current value -->
        <span class="half top visible">
          <span class="char">{ch}</span>
        </span>
      {/if}

      <!-- Center groove -->
      <span class="groove"></span>
    </span>
  {/each}
</span>

<style>
  .split-flap {
    display: inline-flex;
    gap: 3px;
  }

  .flap-cell {
    position: relative;
    width: 0.65em;
    height: 1.15em;
    perspective: 400px;
    background: #0a0a0a;
    border-radius: 3px;
    box-shadow: inset 1px 1px 2px rgba(0,0,0,0.6);
  }

  /* ── Half panels ── */
  .half {
    position: absolute;
    left: 0;
    right: 0;
    height: 50%;
    overflow: hidden;
    backface-visibility: hidden;
  }

  .half.top {
    top: 0;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
    border-top: 1px solid #2a2a2a;
  }
  .half.bottom {
    bottom: 0;
    border-radius: 0 0 3px 3px;
    background: linear-gradient(180deg, #0e0e0e 0%, #161616 100%);
    border-bottom: 1px solid #222;
  }

  /* Queued (behind) — slightly dimmer */
  .half.queued {
    z-index: 0;
  }
  .half.visible {
    z-index: 1;
  }

  .char {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: inherit;
    line-height: 1.15em;
    color: var(--color-bg);
  }
  .top .char {
    top: 0;
  }
  .bottom .char {
    bottom: 0;
  }

  /* ── Center groove (gap between flaps) ── */
  .groove {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    z-index: 4;
    pointer-events: none;
    background: #000;
    box-shadow: 0 1px 0 rgba(255,255,255,0.06);
  }

  /* ── Flip-out: old top half falls forward ── */
  .flip-out {
    z-index: 2;
    transform-origin: bottom center;
    animation: flapOut 60ms ease-in forwards;
  }

  /* ── Flip-in: new bottom half swings into place ── */
  .flip-in {
    z-index: 2;
    transform-origin: top center;
    animation: flapIn 60ms 40ms ease-out forwards;
    transform: rotateX(90deg);
  }

  @keyframes flapOut {
    0%   { transform: rotateX(0deg); }
    100% { transform: rotateX(-90deg); }
  }

  @keyframes flapIn {
    0%   { transform: rotateX(90deg); }
    100% { transform: rotateX(0deg); }
  }
</style>
