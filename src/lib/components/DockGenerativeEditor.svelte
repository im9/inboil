<script lang="ts">
  import type { SceneNode, TuringParams, QuantizerParams, TonnetzParams } from '../state.svelte.ts'
  import { song, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, sceneSetSeed, sceneSetTargetTrack, sceneApplyGenerativePreset, autoGenerateFromNode } from '../sceneActions.ts'
  import { SCALE_NAMES, GENERATIVE_PRESETS } from '../generative.ts'
  import Knob from './Knob.svelte'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  function chordQuality(chord: [number, number, number]): string {
    const i1 = chord[1] - chord[0], i2 = chord[2] - chord[1]
    if (i1 === 4 && i2 === 3) return 'maj'
    if (i1 === 3 && i2 === 4) return 'min'
    if (i1 === 3 && i2 === 3) return 'dim'
    if (i1 === 4 && i2 === 4) return 'aug'
    return ''
  }

  const { node }: { node: SceneNode } = $props()

  const gen = $derived(node.generative!)
  const nodeId = $derived(node.id)

  // Resolve target pattern's cells for track selector
  const targetPatCells = $derived.by(() => {
    // Follow outgoing edges to find the connected pattern node
    const visited = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      for (const edge of song.scene.edges.filter(e => e.from === id)) {
        const target = song.scene.nodes.find(n => n.id === edge.to)
        if (!target) continue
        if (target.type === 'pattern' && target.patternId) {
          const pat = song.patterns.find(p => p.id === target.patternId)
          return pat?.cells ?? []
        }
        queue.push(target.id)
      }
    }
    return []
  })
</script>

<div class="dec-section">
  <div class="dec-section-header">
    <span class="section-label">{gen.engine.toUpperCase()}</span>
  </div>
  {#if gen.engine === 'turing'}
    {@const tp = gen.params as TuringParams}
    <div class="gen-param-grid">
      <Knob
        value={(tp.length - 2) / 30}
        label="LEN"
        displayValue={String(tp.length)}
        size={36}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { length: Math.round(v * 30 + 2) })}
      />
      <Knob
        value={tp.lock}
        label="LOCK"
        displayValue={tp.lock.toFixed(2)}
        size={36}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { lock: v })}
      />
      <Knob
        value={tp.density}
        label="DENS"
        displayValue={tp.density.toFixed(2)}
        size={36}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { density: v })}
      />
    </div>
    <div class="gen-range-row">
      <span class="gen-range-label">RANGE</span>
      <span class="gen-range-val">{tp.range[0]}–{tp.range[1]}</span>
    </div>
    <div class="gen-mode-row" role="tablist" aria-label="Turing mode">
      {#each ['note', 'gate', 'velocity'] as m}
        <button
          class="btn-toggle gen-mode-btn"
          role="tab"
          aria-selected={tp.mode === m}
          class:active={tp.mode === m}
          onpointerdown={() => sceneUpdateGenerativeParams(nodeId, { mode: m as TuringParams['mode'] })}
        >{m.toUpperCase().slice(0, 3)}</button>
      {/each}
    </div>
  {:else if gen.engine === 'quantizer'}
    {@const qp = gen.params as QuantizerParams}
    <div class="gen-param-grid">
      <Knob
        value={qp.root / 11}
        label="ROOT"
        displayValue={NOTE_NAMES[qp.root]}
        size={36}
        steps={12}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { root: Math.round(v * 11) })}
      />
      <Knob
        value={qp.octaveRange[0] / 9}
        label="OCT LO"
        displayValue={String(qp.octaveRange[0])}
        size={36}
        steps={10}
        onchange={v => {
          const lo = Math.round(v * 9)
          sceneUpdateGenerativeParams(nodeId, { octaveRange: [lo, Math.max(lo, qp.octaveRange[1])] as [number, number] })
        }}
      />
      <Knob
        value={qp.octaveRange[1] / 9}
        label="OCT HI"
        displayValue={String(qp.octaveRange[1])}
        size={36}
        steps={10}
        onchange={v => {
          const hi = Math.round(v * 9)
          sceneUpdateGenerativeParams(nodeId, { octaveRange: [Math.min(qp.octaveRange[0], hi), hi] as [number, number] })
        }}
      />
    </div>
    <div class="gen-scale-row">
      <span class="gen-range-label">SCALE</span>
      <select class="gen-scale-select"
        onchange={e => sceneUpdateGenerativeParams(nodeId, { scale: (e.target as HTMLSelectElement).value })}
      >
        {#each SCALE_NAMES as s}
          <option value={s} selected={qp.scale === s}>{s}</option>
        {/each}
      </select>
    </div>
  {:else if gen.engine === 'tonnetz'}
    {@const tnp = gen.params as TonnetzParams}
    <div class="gen-param-grid">
      <Knob
        value={(tnp.stepsPerChord ?? 4) / 64}
        label="STEPS"
        displayValue={String(tnp.stepsPerChord ?? 4)}
        size={36}
        steps={64}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { stepsPerChord: Math.max(1, Math.round(v * 64)) })}
      />
    </div>
    <div class="gen-scale-row">
      <span class="gen-range-label">VOICING</span>
      <select class="gen-scale-select"
        onchange={e => sceneUpdateGenerativeParams(nodeId, { voicing: (e.target as HTMLSelectElement).value as TonnetzParams['voicing'] })}
      >
        {#each ['close', 'spread', 'drop2'] as v}
          <option value={v} selected={tnp.voicing === v}>{v}</option>
        {/each}
      </select>
    </div>
    <div class="gen-scale-row">
      <span class="gen-range-label">CHORD</span>
      <select class="tonnetz-op-select" style="width:44px"
        onchange={e => {
          const root = parseInt((e.target as HTMLSelectElement).value)
          const q = chordQuality(tnp.startChord)
          const third = q === 'min' ? 3 : 4
          const fifth = q === 'min' ? 7 : 7
          sceneUpdateGenerativeParams(nodeId, { startChord: [root, root + third, root + fifth] as [number, number, number] })
        }}
      >
        {#each NOTE_NAMES as name, i}
          {@const octave = Math.floor(tnp.startChord[0] / 12)}
          <option value={octave * 12 + i} selected={tnp.startChord[0] % 12 === i}>{name}</option>
        {/each}
      </select>
      <select class="tonnetz-op-select" style="width:44px"
        onchange={e => {
          const q = (e.target as HTMLSelectElement).value
          const root = tnp.startChord[0]
          const third = q === 'min' ? 3 : 4
          sceneUpdateGenerativeParams(nodeId, { startChord: [root, root + third, root + 7] as [number, number, number] })
        }}
      >
        {#each ['maj', 'min'] as q}
          <option value={q} selected={chordQuality(tnp.startChord) === q}>{q}</option>
        {/each}
      </select>
    </div>
    <div class="gen-scale-row">
      <span class="gen-range-label">OPS</span>
      <div class="tonnetz-seq-editor">
        {#each tnp.sequence ?? [] as op, i}
          <select class="tonnetz-op-select"
            onchange={e => {
              const newSeq = [...(tnp.sequence ?? [])]
              newSeq[i] = (e.target as HTMLSelectElement).value
              sceneUpdateGenerativeParams(nodeId, { sequence: newSeq } as any)
            }}
          >
            {#each ['P', 'L', 'R', 'PL', 'PR', 'LR', 'PLR'] as o}
              <option value={o} selected={op === o}>{o}</option>
            {/each}
          </select>
        {/each}
        <button class="btn-icon" onpointerdown={() => {
          sceneUpdateGenerativeParams(nodeId, { sequence: [...(tnp.sequence ?? []), 'P'] } as any)
        }}>+</button>
        {#if (tnp.sequence ?? []).length > 1}
          <button class="btn-icon" onpointerdown={() => {
            sceneUpdateGenerativeParams(nodeId, { sequence: (tnp.sequence ?? []).slice(0, -1) } as any)
          }}>−</button>
        {/if}
      </div>
    </div>
  {/if}
  <!-- Common: merge mode -->
  <div class="gen-merge-row" role="tablist" aria-label="Merge mode">
    <span class="gen-range-label">MERGE</span>
    {#each [['replace', 'REPLACE'], ['merge', 'FILL']] as [m, label]}
      <button
        class="btn-toggle gen-mode-btn"
        role="tab"
        aria-selected={gen.mergeMode === m}
        class:active={gen.mergeMode === m || (m === 'replace' && gen.mergeMode === 'layer')}
        onpointerdown={() => { pushUndo('Change merge mode'); gen.mergeMode = m as 'replace' | 'merge'; autoGenerateFromNode(nodeId) }}
      >{label}</button>
    {/each}
  </div>
  <!-- Target track selector -->
  {#if targetPatCells.length > 0}
    <div class="gen-scale-row">
      <span class="gen-range-label">TARGET</span>
      <select class="gen-scale-select"
        onchange={e => { sceneSetTargetTrack(nodeId, parseInt((e.target as HTMLSelectElement).value)); autoGenerateFromNode(nodeId) }}
      >
        {#each targetPatCells as cell}
          <option value={cell.trackId} selected={(gen.targetTrack ?? 0) === cell.trackId}>{cell.trackId + 1}: {cell.name}</option>
        {/each}
      </select>
    </div>
  {:else}
    <div class="gen-scale-row">
      <span class="gen-range-label">TARGET</span>
      <span class="gen-range-val" style="color: var(--dz-text-dim)">no target</span>
    </div>
  {/if}
  <!-- Seed control (ADR 078 Phase 4) -->
  <div class="gen-seed-row">
    <span class="gen-range-label">SEED</span>
    {#if gen.seed != null}
      <span class="gen-seed-val">{gen.seed}</span>
      <button class="btn-icon" title="Randomize seed" data-tip="Randomize seed" data-tip-ja="シードをランダム化"
        onpointerdown={() => { sceneSetSeed(nodeId, Math.floor(Math.random() * 100000)); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 3A5 5 0 1 1 1 6.5"/><path d="M1 1v2.5h2.5"/></svg></button>
      <button class="btn-icon" title="Remove seed" data-tip="Remove seed (non-deterministic)" data-tip-ja="シード解除"
        onpointerdown={() => { sceneSetSeed(nodeId, undefined); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
    {:else}
      <span class="gen-seed-val" style="color: var(--dz-text-dim)">off</span>
      <button class="btn-icon" title="Set random seed" data-tip="Set random seed" data-tip-ja="ランダムシードを設定"
        onpointerdown={() => { sceneSetSeed(nodeId, Math.floor(Math.random() * 100000)); autoGenerateFromNode(nodeId) }}
      ><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2v8M2 6h8"/></svg></button>
    {/if}
  </div>
  <!-- Presets (ADR 078 Phase 4) -->
  <div class="gen-scale-row">
    <span class="gen-range-label">PRESET</span>
    <select class="gen-scale-select"
      onchange={e => {
        const sel = (e.target as HTMLSelectElement)
        const presets = GENERATIVE_PRESETS.filter(p => p.engine === gen.engine)
        const idx = parseInt(sel.value)
        if (idx >= 0 && presets[idx]) { sceneApplyGenerativePreset(nodeId, presets[idx].params); autoGenerateFromNode(nodeId) }
        sel.value = '-1'
      }}
    >
      <option value="-1" selected>—</option>
      {#each GENERATIVE_PRESETS.filter(p => p.engine === gen.engine) as preset, i}
        <option value={i}>{preset.name}</option>
      {/each}
    </select>
  </div>

</div>
<div class="section-divider" aria-hidden="true"></div>

<style>
  .dec-section {
    margin-bottom: 4px;
  }
  .dec-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .section-label {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-text-dim);
    padding-bottom: 2px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dz-bg-active);
    margin: 8px 0;
  }
  .btn-toggle {
    border: 1px solid var(--dz-border-mid);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    cursor: pointer;
    min-width: 38px;
    height: 22px;
  }
  .btn-toggle.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-bright);
    border-color: var(--dz-text-dim);
  }
  .gen-param-grid {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-bottom: 8px;
  }
  .gen-range-row, .gen-merge-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .gen-range-label {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.6;
    min-width: 40px;
  }
  .gen-range-val {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
  }
  .gen-mode-row {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  .gen-mode-btn {
    font-size: var(--fs-md) !important;
    padding: 2px 6px !important;
  }
  .gen-scale-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .gen-scale-select {
    flex: 1;
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    background: transparent;
    border: 1px solid var(--dz-border);
    color: inherit;
    padding: 2px 4px;
  }
  .gen-seed-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .gen-seed-val {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    min-width: 32px;
  }
  .btn-icon {
    width: 22px;
    height: 22px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-icon:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .tonnetz-seq-editor {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tonnetz-op-select {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    background: transparent;
    border: 1px solid var(--dz-border);
    color: inherit;
    padding: 1px 2px;
    width: 36px;
  }
</style>
