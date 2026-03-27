<script lang="ts">
  import type { TonnetzParams, TonnetzAnchor } from '../state.svelte.ts'
  import { song, ui, playback, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, autoGenerateFromNode } from '../sceneActions.ts'
  import { applyTonnetzOp } from '../generative.ts'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const { onclose }: { onclose: () => void } = $props()

  const nodeId = $derived(ui.tonnetzNodeId)
  const node = $derived(nodeId ? song.scene.nodes.find(n => n.id === nodeId) : null)
  const params = $derived(node?.generative?.params as TonnetzParams | undefined)

  // ── Lattice geometry ──

  const COL_COUNT = 7
  const ROW_COUNT = 5
  const TRI_W = 60
  const TRI_H = 52
  const PAD = 30

  function noteAt(row: number, col: number, centerNote: number): number {
    const cr = Math.floor(ROW_COUNT / 2)
    const cc = Math.floor(COL_COUNT / 2)
    return ((centerNote + (col - cc) * 7 + (row - cr) * 4) % 12 + 12) % 12
  }

  function vtx(row: number, col: number): { x: number; y: number } {
    return {
      x: PAD + col * TRI_W + (row % 2 === 1 ? TRI_W / 2 : 0),
      y: PAD + row * TRI_H,
    }
  }

  interface TriInfo {
    notes: [number, number, number]
    cx: number; cy: number
    path: string
    isMajor: boolean
    label: string
  }

  function makeTri(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number },
    na: number, nb: number, nc: number): TriInfo {
    const sorted = [na, nb, nc].sort((a, b) => a - b)
    const i1 = (sorted[1] - sorted[0] + 12) % 12
    const i2 = (sorted[2] - sorted[1] + 12) % 12
    const isMaj = (i1 === 4 && i2 === 3) || (i1 === 3 && i2 === 5)
    return {
      notes: sorted as [number, number, number],
      cx: (p1.x + p2.x + p3.x) / 3,
      cy: (p1.y + p2.y + p3.y) / 3,
      path: `M${p1.x},${p1.y}L${p2.x},${p2.y}L${p3.x},${p3.y}Z`,
      isMajor: isMaj,
      label: NOTE_NAMES[sorted[0]] + (isMaj ? '' : 'm'),
    }
  }

  function buildTriangles(centerNote: number): TriInfo[] {
    const tris: TriInfo[] = []
    for (let r = 0; r < ROW_COUNT - 1; r++) {
      for (let c = 0; c < COL_COUNT - 1; c++) {
        const a = vtx(r, c), b = vtx(r, c + 1), d = vtx(r + 1, c), e = vtx(r + 1, c + 1)
        const bp = r % 2 === 0 ? d : e
        tris.push(makeTri(a, b, bp,
          noteAt(r, c, centerNote), noteAt(r, c + 1, centerNote),
          noteAt(r + 1, r % 2 === 0 ? c : c + 1, centerNote)))
        const tp = r % 2 === 0 ? b : a
        tris.push(makeTri(d, e, tp,
          noteAt(r + 1, c, centerNote), noteAt(r + 1, c + 1, centerNote),
          noteAt(r, r % 2 === 0 ? c + 1 : c, centerNote)))
      }
    }
    return tris
  }

  const centerNote = $derived(params?.startChord[0] ?? 60)
  const triangles = $derived(buildTriangles(centerNote % 12))
  const svgW = $derived(PAD * 2 + (COL_COUNT - 1) * TRI_W + TRI_W / 2)
  const svgH = $derived(PAD * 2 + (ROW_COUNT - 1) * TRI_H)

  // ── Walk path computation ──
  // Compute the chord (as pitch classes) at each transform boundary

  function computeWalkPath(p: TonnetzParams, maxSteps: number): { pcs: [number, number, number]; step: number }[] {
    const spt = p.stepsPerTransform ?? 1
    let chord = [...p.startChord] as [number, number, number]
    const anchorMap = new Map<number, [number, number, number]>()
    if (p.anchors) for (const a of p.anchors) anchorMap.set(a.step, [...a.chord] as [number, number, number])

    const path: { pcs: [number, number, number]; step: number }[] = []
    let seqIdx = 0
    for (let step = 0; step < maxSteps; step++) {
      if (anchorMap.has(step)) {
        chord = anchorMap.get(step)!
      } else if (step > 0 && step % spt === 0) {
        const op = p.sequence[seqIdx % p.sequence.length]
        if (op) chord = applyTonnetzOp(chord, op) as [number, number, number]
        seqIdx++
      }
      if (step % spt === 0) {
        path.push({ pcs: chord.map(n => n % 12).sort((a, b) => a - b) as [number, number, number], step })
      }
    }
    return path
  }

  // Get current playback step for this node
  const currentStep = $derived.by(() => {
    if (!playback.playing || !node?.generative || !nodeId) return -1
    const edge = song.scene.edges.find(e => e.from === nodeId)
    if (!edge) return -1
    const patNode = song.scene.nodes.find(n => n.id === edge.to && n.type === 'pattern')
    if (!patNode?.patternId) return -1
    const pat = song.patterns.find(p => p.id === patNode.patternId)
    if (!pat) return -1
    const trackIdx = node.generative.targetTrack ?? 0
    return playback.playheads[trackIdx] ?? 0
  })

  // Total steps from target cell
  const totalSteps = $derived.by(() => {
    if (!node?.generative || !nodeId) return 16
    const edge = song.scene.edges.find(e => e.from === nodeId)
    if (!edge) return 16
    const patNode = song.scene.nodes.find(n => n.id === edge.to && n.type === 'pattern')
    if (!patNode?.patternId) return 16
    const pat = song.patterns.find(p => p.id === patNode.patternId)
    if (!pat) return 16
    const trackIdx = node.generative.targetTrack ?? 0
    return pat.cells[trackIdx]?.steps ?? 16
  })

  const walkPath = $derived(params ? computeWalkPath(params, totalSteps) : [])

  // Current chord boundary index based on playback step
  const currentWalkIdx = $derived(() => {
    if (currentStep < 0 || !params) return -1
    const spt = params.stepsPerTransform ?? 1
    return Math.floor(currentStep / spt)
  })

  // Find triangle matching pitch class set
  function findTri(pcs: [number, number, number]): TriInfo | undefined {
    return triangles.find(t => t.notes[0] === pcs[0] && t.notes[1] === pcs[1] && t.notes[2] === pcs[2])
  }

  // Walk trail: lines connecting consecutive chord positions on the lattice
  const walkTrailPoints = $derived.by(() => {
    const points: { x: number; y: number }[] = []
    for (const wp of walkPath) {
      const tri = findTri(wp.pcs)
      if (tri) points.push({ x: tri.cx, y: tri.cy })
    }
    return points
  })

  // Pitch classes of the chord at current playback position
  const playingPCs = $derived.by(() => {
    const idx = currentWalkIdx()
    if (idx < 0 || idx >= walkPath.length) return null
    return walkPath[idx].pcs
  })

  const startPCs = $derived(params ? params.startChord.map(n => n % 12).sort((a, b) => a - b) : [])

  function triState(tri: TriInfo): 'current' | 'playing' | 'walk' | '' {
    const pp = playingPCs
    if (pp && tri.notes[0] === pp[0] && tri.notes[1] === pp[1] && tri.notes[2] === pp[2]) return 'playing'
    if (tri.notes[0] === startPCs[0] && tri.notes[1] === startPCs[1] && tri.notes[2] === startPCs[2]) return 'current'
    if (walkPath.some(wp => wp.pcs[0] === tri.notes[0] && wp.pcs[1] === tri.notes[1] && wp.pcs[2] === tri.notes[2])) return 'walk'
    return ''
  }

  // ── Drag to define sequence ──
  let dragPath: TriInfo[] = $state([])
  let isDragging = $state(false)

  function startDrag(tri: TriInfo) {
    isDragging = true
    dragPath = [tri]
  }

  function continueDrag(tri: TriInfo) {
    if (!isDragging) return
    if (dragPath.length > 0 && dragPath[dragPath.length - 1] === tri) return
    dragPath = [...dragPath, tri]
  }

  function endDrag() {
    if (!isDragging || !params || !nodeId) { isDragging = false; dragPath = []; return }
    isDragging = false
    if (dragPath.length < 2) { dragPath = []; return }

    // Convert drag path to sequence of transforms
    // For each pair of adjacent triangles, find which transform connects them
    const ops: string[] = []
    let chord = [...params.startChord] as [number, number, number]
    // Set startChord to first dragged triangle
    const first = dragPath[0]
    const oct = Math.floor(params.startChord[0] / 12)
    const newStart: [number, number, number] = [
      oct * 12 + first.notes[0],
      oct * 12 + first.notes[1],
      oct * 12 + first.notes[2],
    ]
    if (newStart[1] < newStart[0]) newStart[1] += 12
    if (newStart[2] < newStart[1]) newStart[2] += 12
    chord = newStart

    for (let i = 1; i < dragPath.length; i++) {
      const target = dragPath[i].notes
      // Try each single transform to see which produces the target
      let found = ''
      for (const op of ['P', 'L', 'R', 'PL', 'PR', 'LR', 'PLR']) {
        const result = applyTonnetzOp(chord, op) as [number, number, number]
        const rpc = result.map(n => n % 12).sort((a, b) => a - b)
        if (rpc[0] === target[0] && rpc[1] === target[1] && rpc[2] === target[2]) {
          found = op
          chord = result
          break
        }
      }
      if (found) ops.push(found)
      // If no single transform matches, skip (non-adjacent triangles)
    }

    if (ops.length > 0) {
      pushUndo('Set Tonnetz path')
      sceneUpdateGenerativeParams(nodeId, { startChord: newStart, sequence: ops })
      autoGenerateFromNode(nodeId)
    }
    dragPath = []
  }

  // ── Anchor management ──
  function addAnchor(tri: TriInfo) {
    if (!params || !nodeId) return
    const oct = Math.floor(params.startChord[0] / 12)
    const chord: [number, number, number] = [
      oct * 12 + tri.notes[0], oct * 12 + tri.notes[1], oct * 12 + tri.notes[2],
    ]
    if (chord[1] < chord[0]) chord[1] += 12
    if (chord[2] < chord[1]) chord[2] += 12
    // Place anchor at next available position (after last anchor or at midpoint)
    const existingSteps = (params.anchors ?? []).map(a => a.step)
    const lastStep = existingSteps.length > 0 ? Math.max(...existingSteps) : 0
    const spt = params.stepsPerTransform ?? 1
    const newStep = lastStep + spt * 4 // 4 chords after last anchor
    const anchors: TonnetzAnchor[] = [...(params.anchors ?? []), { step: newStep, chord }]
    pushUndo('Add Tonnetz anchor')
    sceneUpdateGenerativeParams(nodeId, { anchors })
    autoGenerateFromNode(nodeId)
  }

  function removeAnchor(idx: number) {
    if (!params || !nodeId || !params.anchors) return
    const anchors = params.anchors.filter((_, i) => i !== idx)
    pushUndo('Remove Tonnetz anchor')
    sceneUpdateGenerativeParams(nodeId, { anchors: anchors.length > 0 ? anchors : undefined } as any)
    autoGenerateFromNode(nodeId)
  }

  // ── Sequence editing ──
  function addOp(op: string) {
    if (!params || !nodeId) return
    pushUndo('Edit Tonnetz sequence')
    sceneUpdateGenerativeParams(nodeId, { sequence: [...params.sequence, op] })
    autoGenerateFromNode(nodeId)
  }

  function removeLastOp() {
    if (!params || !nodeId || params.sequence.length <= 1) return
    pushUndo('Edit Tonnetz sequence')
    sceneUpdateGenerativeParams(nodeId, { sequence: params.sequence.slice(0, -1) })
    autoGenerateFromNode(nodeId)
  }

  function setOp(idx: number, op: string) {
    if (!params || !nodeId) return
    const seq = [...params.sequence]
    seq[idx] = op
    pushUndo('Edit Tonnetz sequence')
    sceneUpdateGenerativeParams(nodeId, { sequence: seq })
    autoGenerateFromNode(nodeId)
  }
</script>

{#if params && nodeId}
<div class="tonnetz-sheet">
  <div class="tonnetz-header">
    <span class="tonnetz-title">TONNETZ</span>
    <span class="tonnetz-chord-name">{NOTE_NAMES[params.startChord[0] % 12]}{(params.startChord[1] - params.startChord[0]) === 3 ? 'm' : ''}</span>
    <button class="tonnetz-close" onpointerdown={onclose}>×</button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tonnetz-lattice" onpointerup={endDrag} onpointerleave={endDrag}>
    <svg width={svgW} height={svgH} viewBox="0 0 {svgW} {svgH}">
      <!-- Walk trail lines -->
      {#if walkTrailPoints.length > 1}
        <polyline
          points={walkTrailPoints.map(p => `${p.x},${p.y}`).join(' ')}
          class="walk-trail"
        />
      {/if}
      <!-- Drag preview lines -->
      {#if dragPath.length > 1}
        <polyline
          points={dragPath.map(t => `${t.cx},${t.cy}`).join(' ')}
          class="drag-trail"
        />
      {/if}
      <!-- Triangles -->
      {#each triangles as tri}
        {@const state = triState(tri)}
        <path
          d={tri.path}
          class="tri"
          class:major={tri.isMajor}
          class:minor={!tri.isMajor}
          class:current={state === 'current'}
          class:playing={state === 'playing'}
          class:walk={state === 'walk'}
          role="button" tabindex="-1"
          onpointerdown={() => {
            if (isDragging) return
            startDrag(tri)
          }}
          onpointerenter={() => continueDrag(tri)}
          oncontextmenu={e => { e.preventDefault(); addAnchor(tri) }}
          onpointerup={() => {
            if (dragPath.length < 2) {
              // Single tap: set startChord
              isDragging = false
              dragPath = []
              const oct = Math.floor((params?.startChord[0] ?? 60) / 12)
              const chord: [number, number, number] = [
                oct * 12 + tri.notes[0], oct * 12 + tri.notes[1], oct * 12 + tri.notes[2],
              ]
              if (chord[1] < chord[0]) chord[1] += 12
              if (chord[2] < chord[1]) chord[2] += 12
              pushUndo('Set Tonnetz start chord')
              sceneUpdateGenerativeParams(nodeId, { startChord: chord })
              autoGenerateFromNode(nodeId)
            }
            // Multi-drag: endDrag handles it
          }}
        />
        <text x={tri.cx} y={tri.cy + 4} class="tri-label" class:current={state === 'current'} class:playing={state === 'playing'}>{tri.label}</text>
      {/each}
    </svg>
  </div>

  <!-- Playback chord trail -->
  {#if currentStep >= 0}
    <div class="chord-trail">
      {#each walkPath.slice(Math.max(0, currentWalkIdx() - 6), currentWalkIdx() + 1) as wp, i}
        {@const tri = findTri(wp.pcs)}
        {#if tri}
          <span class="trail-chord" class:now={i === Math.min(6, currentWalkIdx())}>{tri.label}</span>
          {#if i < Math.min(6, currentWalkIdx())}<span class="trail-arrow">→</span>{/if}
        {/if}
      {/each}
    </div>
  {/if}

  <div class="tonnetz-controls">
    <div class="tonnetz-row">
      <span class="ctl-label">SEQ</span>
      <div class="seq-pills">
        {#each params.sequence as op, idx}
          <select class="seq-pill-select"
            onchange={e => setOp(idx, (e.target as HTMLSelectElement).value)}
          >
            {#each ['', 'P', 'L', 'R', 'PL', 'PR', 'LR', 'PLR'] as o}
              <option value={o} selected={op === o}>{o || '·'}</option>
            {/each}
          </select>
        {/each}
        <button class="pill-btn" onpointerdown={() => addOp('P')}>+</button>
        {#if params.sequence.length > 1}
          <button class="pill-btn" onpointerdown={removeLastOp}>−</button>
        {/if}
      </div>
    </div>
    <div class="tonnetz-row">
      <span class="ctl-label">RATE</span>
      <input class="ctl-num" type="number" min="1" max="64"
        value={params.stepsPerTransform ?? 1}
        onchange={e => {
          const v = Math.max(1, Math.min(64, parseInt((e.target as HTMLInputElement).value) || 1))
          sceneUpdateGenerativeParams(nodeId, { stepsPerTransform: v })
          autoGenerateFromNode(nodeId)
        }}
      />
      <span class="ctl-label">VOICE</span>
      <select class="ctl-select"
        onchange={e => { sceneUpdateGenerativeParams(nodeId, { voicing: (e.target as HTMLSelectElement).value as TonnetzParams['voicing'] }); autoGenerateFromNode(nodeId) }}
      >
        {#each ['close', 'spread', 'drop2'] as v}
          <option value={v} selected={params.voicing === v}>{v}</option>
        {/each}
      </select>
      <span class="ctl-label">RHYTHM</span>
      <select class="ctl-select"
        onchange={e => { sceneUpdateGenerativeParams(nodeId, { rhythm: (e.target as HTMLSelectElement).value === 'all' ? undefined : (e.target as HTMLSelectElement).value } as any); autoGenerateFromNode(nodeId) }}
      >
        {#each ['all', 'legato', 'offbeat', 'onbeat', 'syncopated'] as r}
          <option value={r} selected={(params.rhythm ?? 'all') === r}>{r}</option>
        {/each}
      </select>
    </div>
    <!-- Anchors -->
    {#if params.anchors?.length}
      <div class="tonnetz-row">
        <span class="ctl-label">ANCHORS</span>
        <div class="anchor-list">
          {#each params.anchors as anchor, i}
            {@const n = NOTE_NAMES[anchor.chord[0] % 12]}
            {@const q = (anchor.chord[1] - anchor.chord[0]) === 3 ? 'm' : ''}
            <span class="anchor-badge">
              @{anchor.step} {n}{q}
              <button class="anchor-rm" onpointerdown={() => removeAnchor(i)}>×</button>
            </span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="tonnetz-row hint">
      <span>tap = set start · drag = draw path · right-click = add anchor</span>
    </div>
  </div>
</div>
{/if}

<style>
  .tonnetz-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
  }
  .tonnetz-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--lz-border);
  }
  .tonnetz-title {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .tonnetz-chord-name {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    color: var(--color-olive);
  }
  .tonnetz-close {
    width: 24px; height: 24px;
    border: 1px solid var(--color-fg);
    background: transparent; color: inherit;
    font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    margin-left: auto;
  }
  .tonnetz-lattice {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    touch-action: none;
  }
  .tri {
    stroke: var(--color-fg);
    stroke-width: 0.5;
    cursor: pointer;
    transition: fill 80ms;
  }
  .tri.major { fill: rgba(237, 232, 220, 0.06); }
  .tri.minor { fill: rgba(30, 32, 40, 0.06); }
  .tri.current { fill: var(--color-olive); stroke-width: 1.5; }
  .tri.playing { fill: var(--color-blue); stroke-width: 1.5; }
  .tri.walk { fill: rgba(138, 148, 50, 0.15); }
  .tri:hover { fill: rgba(237, 232, 220, 0.2); }
  .tri.current:hover { fill: var(--color-olive); }
  .tri.playing:hover { fill: var(--color-blue); }
  .tri-label {
    font-family: var(--font-data);
    font-size: 9px; font-weight: 700;
    fill: var(--color-fg);
    text-anchor: middle;
    pointer-events: none; user-select: none;
  }
  .tri-label.current, .tri-label.playing { fill: var(--color-bg); }
  .walk-trail {
    fill: none;
    stroke: var(--color-olive);
    stroke-width: 2;
    stroke-opacity: 0.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .drag-trail {
    fill: none;
    stroke: var(--color-blue);
    stroke-width: 2.5;
    stroke-dasharray: 4 3;
    stroke-linecap: round;
  }
  .chord-trail {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    font-family: var(--font-data);
    font-size: var(--fs-md);
    overflow-x: auto;
    border-top: 1px solid var(--lz-border);
  }
  .trail-chord {
    font-weight: 700;
    opacity: 0.5;
  }
  .trail-chord.now {
    opacity: 1;
    color: var(--color-blue);
  }
  .trail-arrow { opacity: 0.3; }

  .tonnetz-controls {
    padding: 8px 12px;
    border-top: 1px solid var(--lz-border);
    display: flex; flex-direction: column; gap: 6px;
  }
  .tonnetz-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .tonnetz-row.hint {
    opacity: 0.4;
    font-family: var(--font-data);
    font-size: 8px;
  }
  .ctl-label {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    letter-spacing: 0.06em; opacity: 0.6;
  }
  .seq-pills { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
  .seq-pill-select {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    padding: 2px 4px;
    border: 1px solid var(--color-olive);
    color: var(--color-olive);
    background: transparent;
    width: 36px;
  }
  .pill-btn {
    width: 20px; height: 20px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    font-size: var(--fs-lg); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .pill-btn:hover { background: var(--lz-bg-hover); }
  .ctl-num {
    font-family: var(--font-data); font-size: var(--fs-lg);
    width: 36px; padding: 2px 4px; text-align: center;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
  }
  .ctl-num::-webkit-inner-spin-button { opacity: 0; width: 0; }
  .ctl-select {
    font-family: var(--font-data); font-size: var(--fs-lg);
    padding: 2px 4px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
  }
  .anchor-list { display: flex; gap: 4px; flex-wrap: wrap; }
  .anchor-badge {
    font-family: var(--font-data); font-size: var(--fs-md);
    padding: 1px 6px;
    border: 1px solid var(--color-salmon);
    color: var(--color-salmon);
    display: flex; align-items: center; gap: 4px;
  }
  .anchor-rm {
    background: none; border: none; color: inherit;
    font-size: 10px; cursor: pointer; padding: 0; line-height: 1;
  }
</style>
