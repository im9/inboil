<script lang="ts">
  /** Compact wavetable waveform visualizer (SVG) */
  let { position = 0 } = $props<{ position?: number }>()

  const W = 248, H = 36, PAD = 2, SAMPLES = 128

  // Generate simple waveform shapes (no need for full band-limited tables at this size)
  function sawWave(t: number): number { return 2 * t - 1 }
  function squareWave(t: number): number { return t < 0.5 ? 1 : -1 }
  function triWave(t: number): number { return t < 0.5 ? 4 * t - 1 : 3 - 4 * t }
  function sineWave(t: number): number { return Math.sin(2 * Math.PI * t) }
  function pulseWave(t: number): number { return t < 0.15 ? 1 : -0.2 }

  const shapes = [sawWave, squareWave, triWave, sineWave, pulseWave]

  const pathD = $derived.by(() => {
    const pos = position * (shapes.length - 1)
    const idx = Math.floor(pos)
    const frac = pos - idx
    const idxNext = Math.min(idx + 1, shapes.length - 1)
    const shapeA = shapes[idx]
    const shapeB = shapes[idxNext]

    const mid = H / 2
    const amp = (H - PAD * 2) / 2
    const parts: string[] = []

    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES
      const x = PAD + t * (W - PAD * 2)
      const v = shapeA(t) + (shapeB(t) - shapeA(t)) * frac
      const y = mid - v * amp
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return parts.join(' ')
  })
</script>

<svg class="wave-graph" viewBox="0 0 {W} {H}" preserveAspectRatio="none">
  <!-- center line -->
  <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(237,232,220,0.1)" stroke-width="1" />
  <path d={pathD} fill="none" stroke="rgba(237,232,220,0.6)" stroke-width="1.5" stroke-linejoin="round" />
</svg>

<style>
  .wave-graph {
    width: 100%;
    height: 36px;
    display: block;
    margin-bottom: 4px;
    border-radius: 0;
    background: var(--lz-border-strong);
  }
</style>
