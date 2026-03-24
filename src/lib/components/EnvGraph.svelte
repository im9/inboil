<script lang="ts">
  /** Compact ADSR envelope visualizer (SVG) */
  let { attack = 0.005, decay = 0.3, sustain = 0.5, release = 0.3 } = $props<{
    attack?: number; decay?: number; sustain?: number; release?: number
  }>()

  const W = 248, H = 36, PAD = 2
  const usableW = W - PAD * 2
  const top = PAD, bot = H - PAD

  // Normalize ADSR times to fit width (max total ~5s mapped to full width)
  const points = $derived.by(() => {
    const a = Math.max(0.001, attack)
    const d = Math.max(0.01, decay)
    const s = Math.max(0, Math.min(1, sustain))
    const r = Math.max(0.01, release)

    // Sustain hold is fixed visual width
    const sustainHold = 0.15
    const total = a + d + sustainHold + r
    const scale = usableW / total

    const x0 = PAD
    const x1 = x0 + a * scale              // end of attack
    const x2 = x1 + d * scale              // end of decay
    const x3 = x2 + sustainHold * scale     // end of sustain hold
    const x4 = x3 + r * scale              // end of release

    const yTop = top
    const ySus = top + (1 - s) * (bot - top)
    const yBot = bot

    return `M${x0},${yBot} L${x1},${yTop} L${x2},${ySus} L${x3},${ySus} L${x4},${yBot}`
  })

  // Fill polygon (closed version)
  const fillPath = $derived(points + ' Z')
</script>

<svg class="env-graph" viewBox="0 0 {W} {H}" preserveAspectRatio="none">
  <path d={fillPath} fill="rgba(108,119,68,0.15)" />
  <path d={points} fill="none" stroke="rgba(108,119,68,0.7)" stroke-width="1.5" stroke-linejoin="round" />
</svg>

<style>
  .env-graph {
    width: 100%;
    height: 36px;
    display: block;
    margin-bottom: 4px;
    border-radius: 0;
    background: var(--lz-border-strong);
  }
</style>
