<script lang="ts">
  import type { SceneNode, SceneDecorator } from '../state.svelte.ts'
  import { song, ui, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateDecorator, sceneRemoveDecorator, sceneAddDecorator } from '../sceneActions.ts'
  import { decoratorLabel } from '../sceneGeometry.ts'
  import { FX_FLAVOURS, BPM_MIN, BPM_MAX } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import Knob from './Knob.svelte'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const DECORATOR_TYPES: { type: SceneDecorator['type']; label: string }[] = [
    { type: 'transpose', label: 'Transpose' },
    { type: 'tempo', label: 'Tempo' },
    { type: 'repeat', label: 'Repeat' },
    { type: 'fx', label: 'FX' },
    { type: 'automation', label: 'Automation' },
  ]

  const { node }: { node: SceneNode } = $props()

  let addMenuOpen = $state(false)

  function decKnobValue(dec: SceneDecorator): number {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) return (dec.params.key ?? 0) / 11
      return ((dec.params.semitones ?? 0) + 12) / 24
    }
    if (dec.type === 'tempo') return ((dec.params.bpm ?? 120) - BPM_MIN) / (BPM_MAX - BPM_MIN)
    if (dec.type === 'repeat') return ((dec.params.count ?? 2) - 1) / 15
    return 0
  }

  function decKnobDisplay(dec: SceneDecorator): string {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) return NOTE_NAMES[dec.params.key ?? 0]
      const s = dec.params.semitones ?? 0
      return `${s >= 0 ? '+' : ''}${s}`
    }
    if (dec.type === 'tempo') return `${dec.params.bpm ?? 120}`
    if (dec.type === 'repeat') return `${dec.params.count ?? 2}`
    return ''
  }

  function handleDecKnobChange(nodeId: string, idx: number, dec: SceneDecorator, v: number) {
    const p = { ...dec.params }
    if (dec.type === 'transpose') {
      if (p.mode === 1) p.key = Math.round(v * 11)
      else p.semitones = Math.round(v * 24 - 12)
    } else if (dec.type === 'tempo') {
      p.bpm = Math.round((v * (BPM_MAX - BPM_MIN) + BPM_MIN) / 5) * 5
    } else if (dec.type === 'repeat') {
      p.count = Math.round(v * 15) + 1
    }
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecMode(nodeId: string, idx: number, dec: SceneDecorator) {
    const p = { ...dec.params }
    p.mode = p.mode === 1 ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecFx(nodeId: string, idx: number, dec: SceneDecorator, key: string) {
    const p = { ...dec.params }
    p[key] = p[key] ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function cycleDecFlavour(nodeId: string, idx: number, dec: SceneDecorator, fxKey: string) {
    const options = FX_FLAVOURS[fxKey as keyof typeof FX_FLAVOURS]
    if (!options) return
    const current = dec.flavourOverrides?.[fxKey as keyof typeof dec.flavourOverrides]
    const ids = options.map((o: { id: string }) => o.id)
    const curIdx = current ? ids.indexOf(current) : -1
    const nextIdx = curIdx + 1
    pushUndo('Change FX flavour')
    const n = song.scene.nodes.find(n => n.id === nodeId)
    if (!n?.decorators?.[idx]) return
    if (nextIdx >= ids.length) {
      if (dec.flavourOverrides) {
        const fo = { ...dec.flavourOverrides }
        delete fo[fxKey as keyof typeof fo]
        n.decorators[idx].flavourOverrides = Object.keys(fo).length ? fo : undefined
      }
    } else {
      n.decorators[idx].flavourOverrides = { ...dec.flavourOverrides, [fxKey]: ids[nextIdx] }
    }
  }
</script>

<div class="dec-section">
  <div class="dec-section-header">
    <span class="section-label">DECORATORS</span>
    <div class="dec-add-wrapper">
      <button class="btn-dec-add" onpointerdown={() => addMenuOpen = !addMenuOpen}
        data-tip="Add decorator" data-tip-ja="デコレーターを追加"
      >+ Add {addMenuOpen ? '▾' : '▸'}</button>
      {#if addMenuOpen}
        <div class="dec-add-menu">
          {#each DECORATOR_TYPES as dt}
            <button class="dec-add-item" onpointerdown={() => {
              sceneAddDecorator(node.id, dt.type)
              addMenuOpen = false
            }}>{dt.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {#each node.decorators ?? [] as dec, i}
    <div class="dec-card">
      <div class="dec-card-header">
        <span class="dec-card-type">{dec.type.toUpperCase()}</span>
        <button class="dec-card-detach" onpointerdown={() => sceneRemoveDecorator(node.id, i)}
          data-tip="Remove decorator" data-tip-ja="デコレーターを削除"
        >×</button>
      </div>
      {#if dec.type === 'transpose'}
        <div class="dec-card-body">
          <button
            class="btn-toggle dec-mode"
            class:active={dec.params.mode === 1}
            aria-pressed={dec.params.mode === 1}
            onpointerdown={() => toggleDecMode(node.id, i, dec)}
            data-tip={dec.params.mode === 1 ? 'Switch to relative' : 'Switch to absolute key'}
            data-tip-ja={dec.params.mode === 1 ? '相対モードに切替' : '絶対キーに切替'}
          >{dec.params.mode === 1 ? 'ABS' : 'REL'}</button>
          <Knob
            value={decKnobValue(dec)}
            label={dec.params.mode === 1 ? 'KEY' : 'SEMI'}
            size={32}
            steps={dec.params.mode === 1 ? 12 : 25}
            displayValue={decKnobDisplay(dec)}
            onchange={v => handleDecKnobChange(node.id, i, dec, v)}
          />
        </div>
      {:else if dec.type === 'tempo'}
        <div class="dec-card-body">
          <Knob
            value={decKnobValue(dec)}
            label="BPM"
            size={32}
            steps={49}
            displayValue={decKnobDisplay(dec)}
            onchange={v => handleDecKnobChange(node.id, i, dec, v)}
          />
        </div>
      {:else if dec.type === 'repeat'}
        <div class="dec-card-body">
          <Knob
            value={decKnobValue(dec)}
            label="COUNT"
            size={32}
            steps={16}
            displayValue={decKnobDisplay(dec)}
            onchange={v => handleDecKnobChange(node.id, i, dec, v)}
          />
        </div>
      {:else if dec.type === 'fx'}
        <div class="dec-card-body dec-fx-grid">
          {#each [['verb', 'VRB'], ['delay', 'DLY'], ['glitch', 'GLT'], ['granular', 'GRN']] as [key, label]}
            <button
              class="btn-toggle"
              class:active={dec.params[key]}
              aria-pressed={!!dec.params[key]}
              onpointerdown={() => toggleDecFx(node.id, i, dec, key)}
            >{label}</button>
            <button
              class="btn-flavour"
              class:has-override={!!dec.flavourOverrides?.[key as FxFlavourKey]}
              onpointerdown={() => cycleDecFlavour(node.id, i, dec, key)}
              data-tip="Cycle flavour override (tap to change)" data-tip-ja="フレーバーを切替 (タップで変更)"
            >{dec.flavourOverrides?.[key as FxFlavourKey]?.toUpperCase() ?? '—'}</button>
          {/each}
        </div>
      {:else if dec.type === 'automation'}
        <div class="dec-card-body">
          <span class="dec-auto-label">{decoratorLabel(dec)}</span>
          <button class="btn-dec-edit" onpointerdown={() => { ui.editingAutomationInline = { nodeId: node.id, decoratorIndex: i } }}
            data-tip="Edit automation curve" data-tip-ja="オートメーションカーブを編集"
          >Edit curve</button>
        </div>
      {/if}
    </div>
  {/each}
  {#if !node.decorators?.length}
    <div class="dec-empty">No decorators</div>
  {/if}
</div>
<div class="section-divider" aria-hidden="true"></div>

<style>
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
  .dec-section {
    margin-bottom: 4px;
  }
  .dec-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .dec-add-wrapper {
    position: relative;
  }
  .btn-dec-add {
    border: 1px solid rgba(108,119,68,0.5);
    background: transparent;
    color: var(--color-olive);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    cursor: pointer;
  }
  .btn-dec-add:hover {
    background: rgba(108,119,68,0.15);
  }
  .dec-add-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 2px;
    background: var(--color-fg);
    border: 1px solid var(--dk-border-mid);
    z-index: 10;
    min-width: 100px;
    animation: dec-menu-in 80ms ease-out;
  }
  .dec-add-item {
    display: block;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dk-bg-faint);
    background: transparent;
    color: var(--dk-text);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 5px 8px;
    text-align: left;
    cursor: pointer;
  }
  .dec-add-item:hover {
    background: var(--dk-bg-hover);
  }
  .dec-add-item:last-child {
    border-bottom: none;
  }
  .dec-card {
    border: 1px solid var(--dk-border);
    margin-bottom: 4px;
    padding: 4px 6px;
    animation: dec-card-in 120ms cubic-bezier(0.2, 0, 0, 1.3);
  }
  @keyframes dec-card-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .dec-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .dec-card-type {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dk-text-mid);
  }
  .dec-card-detach {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--dk-text-dim);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: color 60ms, background 60ms;
  }
  .dec-card-detach:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }
  .dec-card-body {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dec-fx-grid {
    display: grid !important;
    grid-template-columns: auto 1fr;
    gap: 3px 4px;
    align-items: center;
  }
  .btn-flavour {
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-muted);
    font-size: var(--dk-fs-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
    text-align: center;
    min-width: 0;
  }
  .btn-flavour.has-override {
    color: var(--color-olive);
    border-color: var(--color-olive);
    background: rgba(108,119,68,0.12);
  }
  .dec-mode {
    font-size: var(--dk-fs-xs) !important;
    padding: 2px 6px !important;
    min-width: 30px !important;
    height: 18px !important;
  }
  .dec-auto-label {
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text-mid);
  }
  .btn-dec-edit {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 60ms, border-color 60ms;
  }
  .btn-dec-edit:hover {
    color: var(--dk-text);
    border-color: rgba(var(--dk-cream), 0.5);
  }
  .dec-empty {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    font-style: italic;
    padding: 4px 0;
  }
  @keyframes dec-menu-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 639px) {
    .dec-card {
      padding: 6px 8px;
      margin-bottom: 6px;
    }
    .dec-card-header {
      margin-bottom: 6px;
    }
    .dec-card-type {
      font-size: var(--dk-fs-sm);
    }
    .dec-card-detach {
      width: 28px;
      height: 28px;
      font-size: 16px;
    }
    .dec-card-body {
      gap: 10px;
    }
    .dec-mode {
      font-size: var(--dk-fs-sm) !important;
      padding: 4px 10px !important;
      min-width: 40px !important;
      height: 28px !important;
    }
    .dec-fx-grid {
      gap: 4px 6px;
    }
    .dec-fx-grid .btn-toggle {
      padding: 6px 10px;
      font-size: var(--dk-fs-sm);
      min-width: 44px;
      height: 28px;
    }
    .btn-flavour {
      font-size: var(--dk-fs-sm);
      padding: 4px 6px;
    }
    .btn-dec-add {
      font-size: var(--dk-fs-sm);
      padding: 4px 12px;
    }
    .dec-add-item {
      padding: 8px 10px;
      font-size: var(--dk-fs-md);
    }
    .btn-dec-edit {
      font-size: var(--dk-fs-sm);
      padding: 4px 12px;
    }
    .dec-auto-label {
      font-size: var(--dk-fs-md);
    }
  }
</style>
