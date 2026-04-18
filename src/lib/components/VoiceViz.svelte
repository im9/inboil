<script lang="ts">
  /** Voice-specific visualization for the PadsView canvas area (ADR 131 Phase 2).
   *  Shows envelope/waveform/algorithm diagrams based on voice type. */
  import type { VoiceId } from '../types.ts'

  const { voiceId, voiceParams = {} }: {
    voiceId: VoiceId | null
    voiceParams: Record<string, number>
  } = $props()

  // ── Voice classification ──
  const DRUM_IDS: ReadonlySet<string> = new Set([
    'Kick', 'Kick808', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal',
    'Tom', 'Rimshot', 'Cowbell', 'Shaker',
  ])
  const vizType = $derived.by((): 'drum' | 'fmdrum' | 'wt' | 'fm' | 'analog' | 'none' => {
    if (!voiceId) return 'none'
    if (DRUM_IDS.has(voiceId)) return 'drum'
    if (voiceId === 'FMDrum') return 'fmdrum'
    if (voiceId === 'WT') return 'wt'
    if (voiceId === 'FM') return 'fm'
    if (voiceId === 'Bass303' || voiceId === 'MoogLead' || voiceId === 'Analog') return 'analog'
    return 'none'
  })

  // ── Shared constants ──
  const W = 400, H = 120, PAD = 8

  // ── Drum: amplitude decay + pitch sweep ──
  const drumAmpPath = $derived.by(() => {
    if (vizType !== 'drum') return ''
    const decay = Math.max(0.01, voiceParams.decay ?? 0.35)
    const maxT = Math.max(decay * 3, 0.2)
    const usableW = W - PAD * 2
    const usableH = H - PAD * 2
    const pts: string[] = [`M${PAD},${PAD}`]
    const N = 80
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * maxT
      const amp = Math.exp(-t * 5 / decay)
      const x = PAD + (i / N) * usableW
      const y = PAD + (1 - amp) * usableH
      pts.push(`L${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(' ')
  })

  const drumPitchPath = $derived.by(() => {
    if (vizType !== 'drum') return ''
    const pitchStart = voiceParams.pitchStart ?? 340
    const pitchEnd = voiceParams.pitchEnd ?? 55
    const pitchDecay = Math.max(0.003, voiceParams.pitchDecay ?? 0.035)
    const decay = Math.max(0.01, voiceParams.decay ?? 0.35)
    const maxT = Math.max(decay * 3, 0.2)
    const usableW = W - PAD * 2
    const usableH = H - PAD * 2
    // Normalize pitch to 30–800 range
    const pMin = 30, pMax = 800
    const norm = (f: number) => (f - pMin) / (pMax - pMin)
    const pts: string[] = []
    const N = 80
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * maxT
      const pitch = pitchEnd + (pitchStart - pitchEnd) * Math.exp(-t * 5 / pitchDecay)
      const x = PAD + (i / N) * usableW
      const y = PAD + (1 - norm(pitch)) * usableH
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(' ')
  })

  // ── FMDrum: similar decay + sweep ──
  const MACHINE_NAMES = ['KICK', 'SNARE', 'METAL', 'PERC', 'TONE', 'CHORD'] as const
  const fmDrumMachine = $derived(MACHINE_NAMES[Math.round(voiceParams.machine ?? 0)] ?? 'KICK')

  const fmDrumAmpPath = $derived.by(() => {
    if (vizType !== 'fmdrum') return ''
    const decay = Math.max(0.01, voiceParams.decay ?? 0.3)
    const maxT = Math.max(decay * 3, 0.2)
    const usableW = W - PAD * 2
    const usableH = H - PAD * 2
    const pts: string[] = [`M${PAD},${PAD}`]
    const N = 80
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * maxT
      const amp = Math.exp(-t * 5 / decay)
      const x = PAD + (i / N) * usableW
      const y = PAD + (1 - amp) * usableH
      pts.push(`L${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(' ')
  })

  const fmDrumSweepPath = $derived.by(() => {
    if (vizType !== 'fmdrum') return ''
    const sweep = voiceParams.sweep ?? 0.5
    const contour = Math.max(0.01, voiceParams.contour ?? 0.3)
    const decay = Math.max(0.01, voiceParams.decay ?? 0.3)
    const maxT = Math.max(decay * 3, 0.2)
    const usableW = W - PAD * 2
    const usableH = H - PAD * 2
    const pts: string[] = []
    const N = 80
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * maxT
      // Sweep represents pitch env depth (0-1), contour = time
      const env = sweep * Math.exp(-t * 5 / contour)
      const x = PAD + (i / N) * usableW
      const y = PAD + (1 - env) * usableH
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(' ')
  })

  // ── WT: wavetable waveform + ADSR ──
  function sawWave(t: number): number { return 2 * t - 1 }
  function squareWave(t: number): number { return t < 0.5 ? 1 : -1 }
  function triWave(t: number): number { return t < 0.5 ? 4 * t - 1 : 3 - 4 * t }
  function sineWave(t: number): number { return Math.sin(2 * Math.PI * t) }
  function pulseWave(t: number): number { return t < 0.15 ? 1 : -0.2 }
  const WT_SHAPES = [sawWave, squareWave, triWave, sineWave, pulseWave]

  const wtWavePath = $derived.by(() => {
    if (vizType !== 'wt') return ''
    const pos = (voiceParams.oscAPos ?? 0) * (WT_SHAPES.length - 1)
    const idx = Math.floor(pos)
    const frac = pos - idx
    const idxNext = Math.min(idx + 1, WT_SHAPES.length - 1)
    const shapeA = WT_SHAPES[idx]
    const shapeB = WT_SHAPES[idxNext]
    const waveW = W - PAD * 2
    const waveH = 44
    const mid = PAD + waveH / 2
    const amp = (waveH - 4) / 2
    const N = 128
    const pts: string[] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const x = PAD + t * waveW
      const v = shapeA(t) + (shapeB(t) - shapeA(t)) * frac
      const y = mid - v * amp
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(' ')
  })

  const wtEnvPath = $derived.by(() => {
    if (vizType !== 'wt') return ''
    const a = Math.max(0.001, voiceParams.attack ?? 0.005)
    const d = Math.max(0.01, voiceParams.decay ?? 0.3)
    const s = Math.max(0, Math.min(1, voiceParams.sustain ?? 0.5))
    const r = Math.max(0.01, voiceParams.release ?? 0.3)
    const envTop = 56
    const envH = H - envTop - PAD
    const envW = W - PAD * 2
    const sustainHold = 0.15
    const total = a + d + sustainHold + r
    const scale = envW / total
    const x0 = PAD
    const x1 = x0 + a * scale
    const x2 = x1 + d * scale
    const x3 = x2 + sustainHold * scale
    const x4 = x3 + r * scale
    const yTop = envTop
    const ySus = envTop + (1 - s) * envH
    const yBot = envTop + envH
    return `M${x0},${yBot} L${x1},${yTop} L${x2},${ySus} L${x3},${ySus} L${x4},${yBot}`
  })

  const wtEnvFill = $derived(wtEnvPath ? wtEnvPath + ' Z' : '')

  // ── FM: algorithm diagram ──
  type Pos = [number, number]
  type Algo = { ops: Pos[]; links: [number, number][]; carriers: number[] }

  const FM_ALGOS: Algo[] = [
    { ops: [[80, 30], [160, 30], [240, 30], [320, 30]],
      links: [[3, 2], [2, 1], [1, 0]], carriers: [0] },
    { ops: [[80, 80], [180, 30], [260, 30], [340, 30]],
      links: [[3, 2], [2, 1]], carriers: [0, 1] },
    { ops: [[120, 80], [220, 80], [60, 30], [340, 30]],
      links: [[3, 2], [3, 1], [1, 0]], carriers: [0, 2] },
    { ops: [[120, 80], [220, 30], [60, 30], [340, 30]],
      links: [[3, 2], [1, 0]], carriers: [0, 2] },
    { ops: [[120, 80], [300, 80], [200, 30], [60, 30]],
      links: [[2, 0], [3, 1]], carriers: [0, 1] },
    { ops: [[60, 80], [160, 80], [300, 80], [300, 30]],
      links: [[3, 2]], carriers: [0, 1, 2] },
    { ops: [[60, 80], [160, 80], [300, 80], [300, 30]],
      links: [[3, 2]], carriers: [0, 1, 2] },
    { ops: [[60, 60], [160, 60], [260, 60], [360, 60]],
      links: [], carriers: [0, 1, 2, 3] },
  ]
  const OPR = 14

  const fmAlgo = $derived(FM_ALGOS[Math.min(Math.max(0, Math.round(voiceParams.algorithm ?? 0)), 7)])
  const fmOpLevels = $derived([
    voiceParams.op1Level ?? 1.0,
    voiceParams.op2Level ?? 0.7,
    voiceParams.op3Level ?? 0.5,
    voiceParams.op4Level ?? 0.3,
  ])

  // ── Analog: ADSR envelope ──
  const analogEnvPath = $derived.by(() => {
    if (vizType !== 'analog') return ''
    // Different param names for different voices
    const a = Math.max(0.001, voiceParams.attack ?? voiceParams.ampAttack ?? 0.005)
    const d = Math.max(0.01, voiceParams.decay ?? voiceParams.ampDecay ?? 0.3)
    const s = Math.max(0, Math.min(1, voiceParams.sustain ?? voiceParams.ampSustain ?? 0.5))
    const r = Math.max(0.01, voiceParams.release ?? voiceParams.ampRelease ?? 0.3)
    const usableW = W - PAD * 2
    const usableH = H - PAD * 2
    const sustainHold = 0.15
    const total = a + d + sustainHold + r
    const scale = usableW / total
    const x0 = PAD
    const x1 = x0 + a * scale
    const x2 = x1 + d * scale
    const x3 = x2 + sustainHold * scale
    const x4 = x3 + r * scale
    const yTop = PAD
    const ySus = PAD + (1 - s) * usableH
    const yBot = PAD + usableH
    return `M${x0},${yBot} L${x1},${yTop} L${x2},${ySus} L${x3},${ySus} L${x4},${yBot}`
  })

  const analogEnvFill = $derived(analogEnvPath ? analogEnvPath + ' Z' : '')
</script>

<div class="voice-viz">
  {#if vizType === 'drum'}
    <svg class="viz-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
      <!-- Labels -->
      <text x={W - PAD} y={PAD + 10} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">AMP + PITCH</text>
      <!-- Amplitude decay -->
      <path d={drumAmpPath} fill="none" stroke="rgba(120,120,69,0.50)" stroke-width="2" stroke-linejoin="round" />
      <!-- Pitch sweep -->
      <path d={drumPitchPath} fill="none" stroke="rgba(68,114,180,0.45)" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="4 3" />
      <!-- Legend -->
      <line x1={PAD} y1={H - PAD} x2={PAD + 16} y2={H - PAD} stroke="rgba(120,120,69,0.50)" stroke-width="2" />
      <text x={PAD + 20} y={H - PAD + 1} fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.04em" dominant-baseline="middle">AMP</text>
      <line x1={PAD + 52} y1={H - PAD} x2={PAD + 68} y2={H - PAD} stroke="rgba(68,114,180,0.45)" stroke-width="1.5" stroke-dasharray="4 3" />
      <text x={PAD + 72} y={H - PAD + 1} fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.04em" dominant-baseline="middle">PITCH</text>
    </svg>

  {:else if vizType === 'fmdrum'}
    <svg class="viz-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
      <!-- Machine label -->
      <text x={W - PAD} y={PAD + 10} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">{fmDrumMachine}</text>
      <!-- Amplitude decay -->
      <path d={fmDrumAmpPath} fill="none" stroke="rgba(120,120,69,0.50)" stroke-width="2" stroke-linejoin="round" />
      <!-- Pitch sweep -->
      <path d={fmDrumSweepPath} fill="none" stroke="rgba(68,114,180,0.45)" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="4 3" />
      <!-- Legend -->
      <line x1={PAD} y1={H - PAD} x2={PAD + 16} y2={H - PAD} stroke="rgba(120,120,69,0.50)" stroke-width="2" />
      <text x={PAD + 20} y={H - PAD + 1} fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.04em" dominant-baseline="middle">AMP</text>
      <line x1={PAD + 52} y1={H - PAD} x2={PAD + 68} y2={H - PAD} stroke="rgba(68,114,180,0.45)" stroke-width="1.5" stroke-dasharray="4 3" />
      <text x={PAD + 72} y={H - PAD + 1} fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.04em" dominant-baseline="middle">SWEEP</text>
    </svg>

  {:else if vizType === 'wt'}
    <svg class="viz-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
      <!-- Waveform center line -->
      <line x1={PAD} y1={PAD + 22} x2={W - PAD} y2={PAD + 22}
        stroke="var(--lz-border)" stroke-width="1" />
      <!-- Wavetable waveform -->
      <path d={wtWavePath} fill="none" stroke="rgba(120,120,69,0.60)" stroke-width="1.5" stroke-linejoin="round" />
      <!-- Separator -->
      <line x1={PAD} y1={52} x2={W - PAD} y2={52} stroke="var(--lz-border-subtle)" stroke-width="1" />
      <!-- ADSR envelope -->
      <path d={wtEnvFill} fill="rgba(120,120,69,0.10)" />
      <path d={wtEnvPath} fill="none" stroke="rgba(120,120,69,0.55)" stroke-width="1.5" stroke-linejoin="round" />
      <!-- Labels -->
      <text x={W - PAD} y={PAD + 10} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">WAVE</text>
      <text x={W - PAD} y={64} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">ADSR</text>
    </svg>

  {:else if vizType === 'fm'}
    <svg class="viz-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
      <!-- Algorithm label -->
      <text x={W - PAD} y={PAD + 10} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">ALG {Math.round(voiceParams.algorithm ?? 0)}</text>
      <!-- Connection lines -->
      {#each fmAlgo.links as [from, to]}
        {@const fx = fmAlgo.ops[from][0]}
        {@const fy = fmAlgo.ops[from][1]}
        {@const tx = fmAlgo.ops[to][0]}
        {@const ty = fmAlgo.ops[to][1]}
        {@const dx = tx - fx}
        {@const dy = ty - fy}
        {@const len = Math.sqrt(dx * dx + dy * dy)}
        {@const nx = dx / len}
        {@const ny = dy / len}
        {@const ax = tx - nx * (OPR + 3)}
        {@const ay = ty - ny * (OPR + 3)}
        <line x1={fx} y1={fy} x2={tx} y2={ty}
          stroke="var(--lz-text-hint)" stroke-width="1.5" />
        <polygon
          points="{ax},{ay} {ax - nx * 6 + ny * 4},{ay - ny * 6 - nx * 4} {ax - nx * 6 - ny * 4},{ay - ny * 6 + nx * 4}"
          fill="var(--lz-text-hint)" />
      {/each}
      <!-- Output arrows from carriers -->
      {#each fmAlgo.carriers as ci}
        {@const cx = fmAlgo.ops[ci][0]}
        {@const cy = fmAlgo.ops[ci][1]}
        <line x1={cx} y1={cy + OPR + 2} x2={cx} y2={H - PAD}
          stroke="rgba(120,120,69,0.40)" stroke-width="1.5" />
      {/each}
      <!-- Operator circles -->
      {#each fmAlgo.ops as [ox, oy], i}
        {@const isCarrier = fmAlgo.carriers.includes(i)}
        {@const level = fmOpLevels[i]}
        <circle cx={ox} cy={oy} r={OPR}
          fill={isCarrier ? 'rgba(120,120,69,0.12)' : 'var(--lz-bg-hover)'}
          stroke={isCarrier ? 'rgba(120,120,69,0.50)' : 'var(--lz-text-hint)'}
          stroke-width="1.5" />
        <!-- Level fill indicator -->
        {#if level > 0}
          <clipPath id="op-clip-{i}">
            <rect x={ox - OPR} y={oy + OPR - level * OPR * 2} width={OPR * 2} height={level * OPR * 2} />
          </clipPath>
          <circle cx={ox} cy={oy} r={OPR - 1.5}
            fill={isCarrier ? 'rgba(120,120,69,0.20)' : 'var(--lz-bg-active)'}
            clip-path="url(#op-clip-{i})" />
        {/if}
        <text x={ox} y={oy + 4} text-anchor="middle"
          fill={isCarrier ? 'rgba(120,120,69,0.70)' : 'var(--lz-text-mid)'}
          font-size="11" font-weight="700" font-family="var(--font-data)">{i + 1}</text>
      {/each}
    </svg>

  {:else if vizType === 'analog'}
    <svg class="viz-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
      <!-- Label -->
      <text x={W - PAD} y={PAD + 10} text-anchor="end"
        fill="var(--lz-text-hint)" font-size="8" font-weight="700"
        font-family="var(--font-data)" letter-spacing="0.06em">ADSR</text>
      <!-- ADSR envelope -->
      <path d={analogEnvFill} fill="rgba(120,120,69,0.10)" />
      <path d={analogEnvPath} fill="none" stroke="rgba(120,120,69,0.55)" stroke-width="2" stroke-linejoin="round" />
    </svg>

  {:else}
    <div class="viz-empty"></div>
  {/if}
</div>

<style>
  .voice-viz {
    flex: 1;
    min-height: 80px;
    display: flex;
    align-items: stretch;
    background: var(--color-surface);
    border-bottom: 1px solid var(--lz-border-subtle);
  }

  .viz-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .viz-empty {
    flex: 1;
  }
</style>
