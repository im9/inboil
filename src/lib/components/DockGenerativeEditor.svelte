<script lang="ts">
  import type { SceneNode, TuringParams, QuantizerParams, TonnetzParams } from '../state.svelte.ts'
  import { pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, sceneGenerateWrite, sceneToggleOutputMode, sceneFreeze, sceneSetSeed, sceneApplyGenerativePreset } from '../sceneActions.ts'
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
</script>

<div class="dec-section">
  <div class="dec-section-header">
    <span class="section-label">{gen.engine.toUpperCase()}</span>
    <button class="gen-mode-badge" onpointerdown={() => sceneToggleOutputMode(nodeId)}
      data-tip="Toggle write/live mode" data-tip-ja="書込/ライブモード切替"
    >{gen.outputMode === 'live' ? 'LIVE' : 'WRITE'}</button>
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
    <div class="gen-mode-row">
      {#each ['note', 'gate', 'velocity'] as m}
        <button
          class="btn-toggle gen-mode-btn"
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
        value={tnp.stepsPerChord / 16}
        label="STEPS"
        displayValue={String(tnp.stepsPerChord)}
        size={36}
        steps={16}
        onchange={v => sceneUpdateGenerativeParams(nodeId, { stepsPerChord: Math.max(1, Math.round(v * 16)) })}
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
      <span class="gen-range-label" style="font-size:9px; opacity:0.7">{NOTE_NAMES[tnp.startChord[0] % 12]}{chordQuality(tnp.startChord)}</span>
    </div>
    <div class="gen-scale-row">
      <span class="gen-range-label">OPS</span>
      <div class="tonnetz-seq-editor">
        {#each tnp.sequence as op, i}
          <select class="tonnetz-op-select"
            onchange={e => {
              const newSeq = [...tnp.sequence]
              newSeq[i] = (e.target as HTMLSelectElement).value
              sceneUpdateGenerativeParams(nodeId, { sequence: newSeq } as any)
            }}
          >
            {#each ['P', 'L', 'R', 'PL', 'PR', 'LR', 'PLR'] as o}
              <option value={o} selected={op === o}>{o}</option>
            {/each}
          </select>
        {/each}
        <button class="tonnetz-add-op" onpointerdown={() => {
          sceneUpdateGenerativeParams(nodeId, { sequence: [...tnp.sequence, 'P'] } as any)
        }}>+</button>
        {#if tnp.sequence.length > 1}
          <button class="tonnetz-add-op" onpointerdown={() => {
            sceneUpdateGenerativeParams(nodeId, { sequence: tnp.sequence.slice(0, -1) } as any)
          }}>−</button>
        {/if}
      </div>
    </div>
  {/if}
  <!-- Common: merge mode -->
  <div class="gen-merge-row">
    <span class="gen-range-label">MERGE</span>
    {#each ['replace', 'merge', 'layer'] as m}
      <button
        class="btn-toggle gen-mode-btn"
        class:active={gen.mergeMode === m}
        onpointerdown={() => { pushUndo('Change merge mode'); gen.mergeMode = m as 'replace' | 'merge' | 'layer' }}
      >{m.toUpperCase().slice(0, 3)}</button>
    {/each}
  </div>
  <!-- Seed control (ADR 078 Phase 4) -->
  <div class="gen-seed-row">
    <span class="gen-range-label">SEED</span>
    {#if gen.seed != null}
      <span class="gen-seed-val">{gen.seed}</span>
      <button class="gen-seed-btn" data-tip="Randomize seed" data-tip-ja="シードをランダム化"
        onpointerdown={() => sceneSetSeed(nodeId, Math.floor(Math.random() * 100000))}
      >⟳</button>
      <button class="gen-seed-btn" data-tip="Remove seed (non-deterministic)" data-tip-ja="シード解除"
        onpointerdown={() => sceneSetSeed(nodeId, undefined)}
      >✕</button>
    {:else}
      <span class="gen-seed-val" style="opacity:0.4">off</span>
      <button class="gen-seed-btn" data-tip="Set random seed" data-tip-ja="ランダムシードを設定"
        onpointerdown={() => sceneSetSeed(nodeId, Math.floor(Math.random() * 100000))}
      >+</button>
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
        if (idx >= 0 && presets[idx]) sceneApplyGenerativePreset(nodeId, presets[idx].params)
        sel.value = '-1'
      }}
    >
      <option value="-1" selected>—</option>
      {#each GENERATIVE_PRESETS.filter(p => p.engine === gen.engine) as preset, i}
        <option value={i}>{preset.name}</option>
      {/each}
    </select>
  </div>
  <!-- Action buttons -->
  {#if gen.outputMode === 'write'}
    <button class="btn-gen-run" onpointerdown={() => sceneGenerateWrite(nodeId)}
      data-tip="Generate notes into target pattern" data-tip-ja="ターゲットパターンにノートを生成"
    >Generate ▸</button>
  {:else}
    <button class="btn-gen-run freeze" onpointerdown={() => sceneFreeze(nodeId)}
      data-tip="Freeze live output to pattern" data-tip-ja="ライブ出力をパターンにフリーズ"
    >Freeze ▸</button>
  {/if}
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
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 2px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 8px 0;
  }
  .btn-toggle {
    border: 1px solid rgba(var(--dk-cream), 0.25);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    cursor: pointer;
    min-width: 38px;
    height: 22px;
  }
  .btn-toggle.active {
    background: var(--dk-bg-active);
    color: rgba(var(--dk-cream), 0.9);
    border-color: var(--dk-text-dim);
  }
  .gen-mode-badge {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.5;
    cursor: pointer;
    border: 1px solid rgba(108,119,68,0.3);
    background: transparent;
    padding: 1px 6px;
  }
  .gen-mode-badge:hover {
    background: rgba(108,119,68,0.15);
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
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.6;
    min-width: 40px;
  }
  .gen-range-val {
    font-family: var(--font-data);
    font-size: var(--dk-fs-sm);
  }
  .gen-mode-row {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  .gen-mode-btn {
    font-size: var(--dk-fs-xs) !important;
    padding: 2px 6px !important;
  }
  .btn-gen-run {
    width: 100%;
    padding: 6px;
    border: 1px solid var(--color-olive);
    background: rgba(108,119,68,0.1);
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    margin-top: 4px;
  }
  .btn-gen-run:hover {
    background: rgba(108,119,68,0.25);
  }
  .btn-gen-run:active {
    transform: scale(0.98);
  }
  .btn-gen-run.freeze {
    border-color: rgba(120, 120, 69, 0.5);
    color: rgba(120, 120, 69, 0.9);
    background: rgba(120, 120, 69, 0.08);
  }
  .btn-gen-run.freeze:hover {
    background: rgba(120, 120, 69, 0.2);
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
    font-size: var(--dk-fs-sm);
    background: transparent;
    border: 1px solid rgba(237, 232, 220, 0.2);
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
    font-size: var(--dk-fs-sm);
    min-width: 32px;
  }
  .gen-seed-btn {
    width: 20px;
    height: 20px;
    border: 1px solid rgba(237, 232, 220, 0.2);
    background: transparent;
    color: inherit;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
  }
  .gen-seed-btn:hover {
    background: rgba(237, 232, 220, 0.1);
  }
  .tonnetz-seq-editor {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tonnetz-op-select {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    background: transparent;
    border: 1px solid rgba(237, 232, 220, 0.2);
    color: inherit;
    padding: 1px 2px;
    width: 36px;
  }
  .tonnetz-add-op {
    width: 20px;
    height: 20px;
    border: 1px solid rgba(237, 232, 220, 0.2);
    background: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tonnetz-add-op:hover {
    background: rgba(237, 232, 220, 0.1);
  }
</style>
