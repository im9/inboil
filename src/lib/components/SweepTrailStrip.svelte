<script lang="ts">
  // Recording preview strip (ADR 123 Phase 4).
  // Shows real-time sparkline traces of captured parameters during sweep recording.
  import { slide } from 'svelte/transition'
  import { sweepRec } from '../sweepRecorder.svelte.ts'

  const isVisible = $derived(sweepRec.state === 'recording' && sweepRec.recentTraces.length > 0)

  const STRIP_H = 32
  const TRACE_W = 120 // SVG viewBox width for sparkline
</script>

{#if isVisible}
  <div class="trail-strip" transition:slide={{ duration: 150 }}>
    {#each sweepRec.recentTraces as trace (trace.key)}
      <div class="trail-trace" style="--tc: {trace.color}">
        <span class="trail-label">{trace.label}</span>
        <svg
          class="trail-spark"
          viewBox="0 0 {TRACE_W} {STRIP_H}"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {#if trace.values.length >= 2}
            {@const pts = trace.values}
            {@const len = pts.length}
            {@const step = TRACE_W / (len - 1)}
            <polyline
              points={pts.map((v, i) => `${i * step},${STRIP_H - v * (STRIP_H - 4) - 2}`).join(' ')}
              stroke={trace.color}
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.85"
            />
          {/if}
        </svg>
      </div>
    {/each}
  </div>
{/if}

<style>
  .trail-strip {
    display: flex;
    align-items: stretch;
    gap: 2px;
    height: 32px;
    background: var(--color-fg);
    border-bottom: 1px solid var(--dz-divider);
    padding: 0 8px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .trail-trace {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .trail-label {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    color: var(--dz-text-dim);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 32px;
  }
  .trail-spark {
    flex: 1;
    height: 100%;
    min-width: 0;
  }
</style>
