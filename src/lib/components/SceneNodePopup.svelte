<script lang="ts">
  import { song, ui, primarySelectedNode } from '../state.svelte.ts'
  import { sceneUpdateNodeParams, sceneUpdateDecorator, sceneDetachDecorator } from '../sceneActions.ts'
  import { PAD_INSET } from '../constants.ts'
  import { decoratorLabel } from '../sceneGeometry.ts'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  // ── Standalone function node (existing behavior) ──
  const selectedFnNode = $derived.by(() => {
    const primary = primarySelectedNode()
    if (!primary || Object.keys(ui.selectedSceneNodes).length !== 1) return null
    const n = song.scene.nodes.find(n => n.id === primary)
    return (n && n.type !== 'pattern') ? n : null
  })

  // ── Pattern node with decorators ──
  const selectedPatNode = $derived.by(() => {
    const primary = primarySelectedNode()
    if (!primary || Object.keys(ui.selectedSceneNodes).length !== 1) return null
    const n = song.scene.nodes.find(n => n.id === primary)
    if (!n || n.type !== 'pattern') return null
    return (n.decorators && n.decorators.length > 0) ? n : null
  })

  const paramDisplay = $derived.by(() => {
    if (!selectedFnNode) return ''
    if (selectedFnNode.type === 'transpose') {
      if (selectedFnNode.params?.mode === 1) return NOTE_NAMES[selectedFnNode.params?.key ?? 0]
      return String(selectedFnNode.params?.semitones ?? 0)
    }
    if (selectedFnNode.type === 'tempo') return String(selectedFnNode.params?.bpm ?? 120)
    if (selectedFnNode.type === 'repeat') return String(selectedFnNode.params?.count ?? 2)
    return ''
  })

  // ── Standalone function node param controls ──
  function incParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 1) % 12
      else p.semitones = Math.min(12, (p.semitones ?? 0) + 1)
    }
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.min(300, (p.bpm ?? 120) + 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.min(16, (p.count ?? 2) + 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function decParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 11) % 12
      else p.semitones = Math.max(-12, (p.semitones ?? 0) - 1)
    }
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.max(60, (p.bpm ?? 120) - 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.max(1, (p.count ?? 2) - 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function toggleTransposeMode(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode || selectedFnNode.type !== 'transpose') return
    const p = { ...(selectedFnNode.params || {}) }
    p.mode = p.mode === 1 ? 0 : 1
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function toggleFxParam(key: string) {
    if (!selectedFnNode || selectedFnNode.type !== 'fx') return
    const p = { ...(selectedFnNode.params || {}) }
    p[key] = p[key] ? 0 : 1
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  // ── Decorator param controls ──
  function decDecParam(e: PointerEvent, nodeId: string, idx: number, dec: { type: string; params: Record<string, number> }) {
    e.stopPropagation()
    const p = { ...dec.params }
    if (dec.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 11) % 12
      else p.semitones = Math.max(-12, (p.semitones ?? 0) - 1)
    }
    else if (dec.type === 'tempo') p.bpm = Math.max(60, (p.bpm ?? 120) - 5)
    else if (dec.type === 'repeat') p.count = Math.max(1, (p.count ?? 2) - 1)
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function incDecParam(e: PointerEvent, nodeId: string, idx: number, dec: { type: string; params: Record<string, number> }) {
    e.stopPropagation()
    const p = { ...dec.params }
    if (dec.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 1) % 12
      else p.semitones = Math.min(12, (p.semitones ?? 0) + 1)
    }
    else if (dec.type === 'tempo') p.bpm = Math.min(300, (p.bpm ?? 120) + 5)
    else if (dec.type === 'repeat') p.count = Math.min(16, (p.count ?? 2) + 1)
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecTransposeMode(e: PointerEvent, nodeId: string, idx: number, dec: { type: string; params: Record<string, number> }) {
    e.stopPropagation()
    const p = { ...dec.params }
    p.mode = p.mode === 1 ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecFxParam(nodeId: string, idx: number, dec: { type: string; params: Record<string, number> }, key: string) {
    const p = { ...dec.params }
    p[key] = p[key] ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function detach(e: PointerEvent, nodeId: string, idx: number) {
    e.stopPropagation()
    sceneDetachDecorator(nodeId, idx)
  }

  function decParamDisplay(dec: { type: string; params: Record<string, number> }): string {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) return NOTE_NAMES[dec.params.key ?? 0]
      return String(dec.params.semitones ?? 0)
    }
    if (dec.type === 'tempo') return String(dec.params.bpm ?? 120)
    if (dec.type === 'repeat') return String(dec.params.count ?? 2)
    return ''
  }
</script>

<!-- Standalone function node popup (existing) -->
{#if selectedFnNode && selectedFnNode.type !== 'probability' && selectedFnNode.type !== 'fx'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="param-popup" style="
    left: calc({PAD_INSET}px + {selectedFnNode.x} * (100% - {PAD_INSET * 2}px) + 28px);
    top: calc({PAD_INSET}px + {selectedFnNode.y} * (100% - {PAD_INSET * 2}px));
  " onpointerdown={e => e.stopPropagation()}>
    {#if selectedFnNode.type === 'transpose'}
      <button
        class="mode-toggle"
        class:absolute={selectedFnNode.params?.mode === 1}
        onpointerdown={toggleTransposeMode}
        data-tip={selectedFnNode.params?.mode === 1 ? 'Switch to relative' : 'Switch to absolute key'}
        data-tip-ja={selectedFnNode.params?.mode === 1 ? '相対モードに切替' : '絶対キーに切替'}
      >{selectedFnNode.params?.mode === 1 ? 'ABS' : 'REL'}</button>
    {/if}
    <button class="param-btn" onpointerdown={decParam}>−</button>
    <span class="param-val">{paramDisplay}</span>
    <button class="param-btn" onpointerdown={incParam}>+</button>
  </div>
{/if}

{#if selectedFnNode && selectedFnNode.type === 'fx'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="param-popup fx-popup" style="
    left: calc({PAD_INSET}px + {selectedFnNode.x} * (100% - {PAD_INSET * 2}px) + 28px);
    top: calc({PAD_INSET}px + {selectedFnNode.y} * (100% - {PAD_INSET * 2}px));
  " onpointerdown={e => e.stopPropagation()}>
    {#each [['verb', 'VRB'], ['delay', 'DLY'], ['glitch', 'GLT'], ['granular', 'GRN']] as [key, label]}
      <button
        class="fx-toggle"
        class:active={selectedFnNode.params?.[key]}
        onpointerdown={e => { e.stopPropagation(); toggleFxParam(key) }}
      >{label}</button>
    {/each}
  </div>
{/if}

<!-- Decorator popup on pattern node (ADR 062 Phase 3) -->
{#if selectedPatNode}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dec-popup" style="
    left: calc({PAD_INSET}px + {selectedPatNode.x} * (100% - {PAD_INSET * 2}px) + 42px);
    top: calc({PAD_INSET}px + {selectedPatNode.y} * (100% - {PAD_INSET * 2}px) + 18px);
  " onpointerdown={e => e.stopPropagation()}>
    {#each selectedPatNode.decorators ?? [] as dec, i}
      <div class="dec-edit-row">
        <span class="dec-type">{decoratorLabel(dec)}</span>
        {#if dec.type === 'fx'}
          {#each [['verb', 'VRB'], ['delay', 'DLY'], ['glitch', 'GLT'], ['granular', 'GRN']] as [key, label]}
            <button
              class="fx-toggle sm"
              class:active={dec.params[key]}
              onpointerdown={e => { e.stopPropagation(); toggleDecFxParam(selectedPatNode.id, i, dec, key) }}
            >{label}</button>
          {/each}
        {:else}
          {#if dec.type === 'transpose'}
            <button
              class="mode-toggle sm"
              class:absolute={dec.params.mode === 1}
              onpointerdown={e => toggleDecTransposeMode(e, selectedPatNode.id, i, dec)}
            >{dec.params.mode === 1 ? 'ABS' : 'REL'}</button>
          {/if}
          <button class="param-btn sm" onpointerdown={e => decDecParam(e, selectedPatNode.id, i, dec)}>−</button>
          <span class="param-val sm">{decParamDisplay(dec)}</span>
          <button class="param-btn sm" onpointerdown={e => incDecParam(e, selectedPatNode.id, i, dec)}>+</button>
        {/if}
        <button class="detach-btn" onpointerdown={e => detach(e, selectedPatNode.id, i)}
          data-tip="Detach decorator" data-tip-ja="デコレーターを分離">×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .param-popup {
    position: absolute;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 4px;
    padding: 2px;
    z-index: 6;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
  }
  .param-btn {
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-data);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .param-btn:hover {
    background: rgba(30, 32, 40, 0.06);
  }
  .param-btn:active {
    background: rgba(30, 32, 40, 0.12);
  }
  .param-btn.sm {
    width: 18px;
    height: 18px;
    font-size: 12px;
  }
  .param-val {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    color: var(--color-fg);
    min-width: 28px;
    text-align: center;
    letter-spacing: 0.04em;
  }
  .param-val.sm {
    font-size: 9px;
    min-width: 22px;
  }
  .mode-toggle {
    border: none;
    border-radius: 3px;
    background: rgba(30, 32, 40, 0.06);
    color: rgba(30, 32, 40, 0.45);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 4px;
    cursor: pointer;
    margin-right: 2px;
  }
  .mode-toggle:hover {
    background: rgba(30, 32, 40, 0.1);
  }
  .mode-toggle.absolute {
    background: var(--color-fg);
    color: var(--color-bg);
  }
  .mode-toggle.sm {
    font-size: 6px;
    padding: 2px 3px;
  }
  .fx-popup {
    gap: 2px;
  }
  .fx-toggle {
    border: none;
    border-radius: 3px;
    background: rgba(30, 32, 40, 0.06);
    color: rgba(30, 32, 40, 0.35);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 5px;
    cursor: pointer;
  }
  .fx-toggle:hover {
    background: rgba(30, 32, 40, 0.1);
  }
  .fx-toggle.active {
    background: var(--color-fg);
    color: var(--color-bg);
  }
  .fx-toggle.sm {
    font-size: 6px;
    padding: 2px 3px;
  }

  /* ── Decorator popup (ADR 062) ── */
  .dec-popup {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 4px;
    padding: 3px;
    z-index: 6;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
    animation: dec-popup-in 100ms ease-out;
  }
  @keyframes dec-popup-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .dec-edit-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .dec-type {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.4);
    letter-spacing: 0.04em;
    min-width: 32px;
    white-space: nowrap;
  }
  .detach-btn {
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: rgba(30, 32, 40, 0.3);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
  }
  .detach-btn:hover {
    background: rgba(30, 32, 40, 0.08);
    color: rgba(30, 32, 40, 0.6);
  }

  @media (max-width: 639px) {
    .param-btn { width: 32px; height: 32px; font-size: 18px; }
    .param-btn.sm { width: 26px; height: 26px; font-size: 14px; }
    .param-val { font-size: 13px; min-width: 36px; }
    .param-val.sm { font-size: 11px; min-width: 28px; }
  }
</style>
