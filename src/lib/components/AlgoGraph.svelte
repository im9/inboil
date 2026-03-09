<script lang="ts">
  /** FM algorithm routing visualizer (SVG) — shows 4-op carrier/modulator connections */
  let { algorithm = 0 } = $props<{ algorithm?: number }>()

  const W = 248, H = 48
  const OPR = 9  // operator circle radius

  // Operator positions: [x, y] for each operator (1-4)
  // Layout: top row = modulators, bottom row = carriers
  type Pos = [number, number]
  type Algo = { ops: Pos[]; links: [number, number][]; carriers: number[] }

  const ALGOS: Algo[] = [
    { // 0: [4]→[3]→[2]→[1]→out (serial)
      ops: [[40, 12], [100, 12], [160, 12], [220, 12]],
      links: [[3, 2], [2, 1], [1, 0]], carriers: [0],
    },
    { // 1: [4]→[3]→[2]→out, [1]→out
      ops: [[40, 36], [120, 12], [180, 12], [220, 12]],
      links: [[3, 2], [2, 1]], carriers: [0, 1],
    },
    { // 2: [4]→[3]→out, [4]→[2]→[1]→out (shared mod)
      ops: [[80, 36], [140, 36], [40, 12], [210, 12]],
      links: [[3, 2], [3, 1], [1, 0]], carriers: [0, 2],
    },
    { // 3: [4]→[3]→out, [2]→[1]→out (dual pairs)
      ops: [[80, 36], [140, 12], [40, 12], [210, 12]],
      links: [[3, 2], [1, 0]], carriers: [0, 2],
    },
    { // 4: [3]→[2]→out, [4]→[1]→out (classic EP)
      ops: [[80, 36], [200, 36], [140, 12], [40, 12]],
      links: [[2, 0], [3, 1]], carriers: [0, 1],
    },
    { // 5: [4]→[3]→out, [2]→out, [1]→out (3 carriers)
      ops: [[40, 36], [120, 36], [200, 36], [200, 12]],
      links: [[3, 2]], carriers: [0, 1, 2],
    },
    { // 6: [4]→[3]→out, [2]→out, [1]→out (fb on 1)
      ops: [[40, 36], [120, 36], [200, 36], [200, 12]],
      links: [[3, 2]], carriers: [0, 1, 2],
    },
    { // 7: all parallel (additive)
      ops: [[40, 24], [100, 24], [160, 24], [220, 24]],
      links: [], carriers: [0, 1, 2, 3],
    },
  ]

  const algo = $derived(ALGOS[Math.min(Math.max(0, Math.round(algorithm)), 7)])
</script>

<svg class="algo-graph" viewBox="0 0 {W} {H}">
  <!-- Connection lines -->
  {#each algo.links as [from, to]}
    {@const fx = algo.ops[from][0]}
    {@const fy = algo.ops[from][1]}
    {@const tx = algo.ops[to][0]}
    {@const ty = algo.ops[to][1]}
    <line x1={fx} y1={fy} x2={tx} y2={ty}
      stroke="rgba(237,232,220,0.35)" stroke-width="1.5" />
    <!-- Arrow head -->
    {@const dx = tx - fx}
    {@const dy = ty - fy}
    {@const len = Math.sqrt(dx * dx + dy * dy)}
    {@const nx = dx / len}
    {@const ny = dy / len}
    {@const ax = tx - nx * (OPR + 2)}
    {@const ay = ty - ny * (OPR + 2)}
    <polygon
      points="{ax},{ay} {ax - nx * 5 + ny * 3},{ay - ny * 5 - nx * 3} {ax - nx * 5 - ny * 3},{ay - ny * 5 + nx * 3}"
      fill="rgba(237,232,220,0.35)" />
  {/each}
  <!-- Output arrows from carriers -->
  {#each algo.carriers as ci}
    {@const cx = algo.ops[ci][0]}
    {@const cy = algo.ops[ci][1]}
    <line x1={cx} y1={cy + OPR + 1} x2={cx} y2={H - 1}
      stroke="rgba(180,200,140,0.5)" stroke-width="1.5" />
  {/each}
  <!-- Operator circles -->
  {#each algo.ops as [ox, oy], i}
    {@const isCarrier = algo.carriers.includes(i)}
    <circle cx={ox} cy={oy} r={OPR}
      fill={isCarrier ? 'rgba(180,200,140,0.25)' : 'rgba(237,232,220,0.08)'}
      stroke={isCarrier ? 'rgba(180,200,140,0.7)' : 'rgba(237,232,220,0.4)'}
      stroke-width="1.5" />
    <text x={ox} y={oy + 3.5} text-anchor="middle"
      fill={isCarrier ? 'rgba(180,200,140,0.9)' : 'rgba(237,232,220,0.6)'}
      font-size="9" font-family="monospace">{i + 1}</text>
  {/each}
  <!-- Algorithm label -->
  <text x={W - 4} y={10} text-anchor="end"
    fill="rgba(237,232,220,0.3)" font-size="8" font-family="monospace">ALG {Math.round(algorithm)}</text>
</svg>

<style>
  .algo-graph {
    width: 100%;
    height: 48px;
    display: block;
    margin-bottom: 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.2);
  }
</style>
