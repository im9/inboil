<script lang="ts">
  import { song, ui, primarySelectedNode } from '../state.svelte.ts'
  import { sceneUpdateNodeParams } from '../sceneActions.ts'
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

  // ── Decorator read-only display (ADR 069: editing moved to DockPanel) ──
  function focusDecorator(e: PointerEvent) {
    e.stopPropagation()
    // dock is always visible (no minimize)
  }
</script>

<!-- Standalone function node popup (existing) -->
{#if selectedFnNode && selectedFnNode.type !== 'probability' && selectedFnNode.type !== 'fx' && selectedFnNode.type !== 'automation'}
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

<!-- Decorator summary on pattern node (ADR 069: read-only, editing in DockPanel) -->
{#if selectedPatNode}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dec-popup" style="
    left: calc({PAD_INSET}px + {selectedPatNode.x} * (100% - {PAD_INSET * 2}px) + 42px);
    top: calc({PAD_INSET}px + {selectedPatNode.y} * (100% - {PAD_INSET * 2}px) + 18px);
  " onpointerdown={focusDecorator}>
    <div class="dec-label-row">
      {#each selectedPatNode.decorators ?? [] as dec}
        <span class="dec-tag-ro">{decoratorLabel(dec)}</span>
      {/each}
    </div>
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
  .param-val {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    color: var(--color-fg);
    min-width: 28px;
    text-align: center;
    letter-spacing: 0.04em;
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

  /* ── Decorator read-only popup (ADR 069) ── */
  .dec-popup {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 4px;
    padding: 3px 5px;
    z-index: 6;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
    animation: dec-popup-in 100ms ease-out;
    cursor: pointer;
  }
  @keyframes dec-popup-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .dec-label-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .dec-tag-ro {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.5);
    letter-spacing: 0.04em;
    background: rgba(30, 32, 40, 0.06);
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
  }

  @media (max-width: 639px) {
    .param-btn { width: 32px; height: 32px; font-size: 18px; }
    .param-val { font-size: 13px; min-width: 36px; }
  }
</style>
