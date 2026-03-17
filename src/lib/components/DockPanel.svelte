<script lang="ts">
  import { song, ui, playback, selectPattern } from '../state.svelte.ts'
  import type { SceneNode } from '../types.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'

  import { sceneAddDecorator, sceneSetRoot } from '../sceneActions.ts'
  import { targetColor as autoTargetColor } from '../automationDraw.ts'

  import { PATTERN_COLORS } from '../constants.ts'
  import DockDecoratorEditor from './DockDecoratorEditor.svelte'
  import DockAutomationEditor from './DockAutomationEditor.svelte'
  import DockGenerativeEditor from './DockGenerativeEditor.svelte'
  import DockTrackEditor from './DockTrackEditor.svelte'
  import DockNavigator from './DockNavigator.svelte'
  import DockFxControls from './DockFxControls.svelte'
  import DockEqControls from './DockEqControls.svelte'
  import DockMasterControls from './DockMasterControls.svelte'

  // FX/EQ/Master sheets override decorator editor → show navigator instead
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  const sceneGenerativeNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'generative' && node.generative) ? node : null
  })

  // Selected pattern node in overlay mode (for inline automation editor)
  const overlaySelectedPatternNode = $derived.by(() => {
    if (!isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  // ── Scene Navigator (ADR 070) ──
  // Show pattern header (name + color) in both scene and sequencer views — only hidden during overlay sheets
  const showPatternHeader = $derived(!isOverlaySheet)
  // Navigator: show when no pattern sheet and no scene node selected (including overlay sheets)
  const showNavigator = $derived(!ui.patternSheet && !scenePatternNode)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

  // Find scene node for current pattern (for DECO tab when pattern sheet is open)
  // When the same pattern is used by multiple scene nodes, prioritize:
  // 1. Currently playing scene node  2. Selected scene node  3. First match
  const currentPatternSceneNode = $derived.by(() => {
    if (!ui.patternSheet) return null
    const patId = song.patterns[ui.currentPattern]?.id
    if (!patId) return null
    const matches = song.scene.nodes.filter(n => n.type === 'pattern' && n.patternId === patId)
    if (matches.length <= 1) return matches[0] ?? null
    const playing = matches.find(n => playback.sceneNodeId === n.id)
    if (playing) return playing
    const selected = matches.find(n => ui.selectedSceneNodes[n.id])
    return selected ?? matches[0]
  })
  // Find generative nodes connected to current pattern's scene node (incoming edges)
  const connectedGenerativeNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => n?.type === 'generative' && !!n.generative)
  })
  const decoCount = $derived(
    (currentPatternSceneNode?.decorators ?? []).length + connectedGenerativeNodes.length
  )

  const GLOBAL_PARAM_LABELS: Record<string, string> = {
    tempo: 'Tempo', masterVolume: 'Vol', swing: 'Swing',
    compThreshold: 'Comp THR', compRatio: 'Comp RAT', compMakeup: 'Comp MKP',
    compAttack: 'Comp ATK', compRelease: 'Comp REL',
    duckDepth: 'Duck DPT', duckRelease: 'Duck REL', retVerb: 'Ret VRB', retDelay: 'Ret DLY',
  }
  function autoTargetLabel(t: import('../types.ts').AutomationTarget): string {
    if (t.kind === 'global') return GLOBAL_PARAM_LABELS[t.param] ?? t.param
    if (t.kind === 'track') return `T${t.trackIndex + 1} ${t.param}`
    if (t.kind === 'fx') return t.param.replace(/([A-Z])/g, ' $1').trim()
    if (t.kind === 'eq') return `${t.band.replace('eq', '')} ${t.param}`
    if (t.kind === 'send') return `T${t.trackIndex + 1} ${t.param}`
    return 'Auto'
  }

  // Selected pattern: prefer scene node's pattern, fallback to ui.currentPattern
  const selectedPatternIndex = $derived.by(() => {
    if (scenePatternNode?.patternId) {
      return song.patterns.findIndex(p => p.id === scenePatternNode.patternId)
    }
    return ui.currentPattern
  })

  const selectedPattern = $derived(selectedPatternIndex >= 0 ? song.patterns[selectedPatternIndex] : null)

  function openPatternSheet() {
    if (selectedPatternIndex < 0) return
    selectPattern(selectedPatternIndex)
    ui.patternSheet = true
  }
</script>

<div class="dock-panel" class:split={isOverlaySheet}>
  {#if isOverlaySheet}
  <!-- Split layout: scene navigator (upper) + overlay controls (lower) -->
  <div class="dock-body dock-split">
    <div class="dock-upper">
      <div class="param-content">
        <!-- Scene Navigator (ADR 070) -->
        {#if showNavigator}
          <DockNavigator filterAutomation />
        {/if}
        <!-- Automation section in overlay mode (ADR 026) -->
        {#if overlaySelectedPatternNode}
          {@const oNode = overlaySelectedPatternNode}
          {@const allAutoDecorators = (oNode.decorators ?? []).map((d, i) => ({ dec: d, idx: i })).filter(x => x.dec.type === 'automation')}
          {@const autoDecorators = allAutoDecorators.filter(x => {
            const kind = x.dec.automationParams?.target.kind
            if (ui.phraseView === 'fx') return kind === 'fx' || kind === 'send'
            if (ui.phraseView === 'master') return kind === 'global'
            if (ui.phraseView === 'eq') return kind === 'eq'
            return true
          })}
          <div class="nav-auto-section">
            <div class="nav-auto-header">
              <span class="section-label">AUTOMATION</span>
              <button class="nav-auto-add" onpointerdown={() => {
                sceneAddDecorator(oNode.id, 'automation')
                const node = song.scene.nodes.find(n => n.id === oNode.id)
                if (node?.decorators) {
                  ui.editingAutomationInline = { nodeId: oNode.id, decoratorIndex: node.decorators.length - 1 }
                }
              }}
                data-tip="Add automation curve" data-tip-ja="オートメーションカーブを追加"
              >+ Draw</button>
            </div>
            {#if autoDecorators.length > 0}
              <div class="nav-auto-list">
                {#each autoDecorators as ad}
                  {@const ap = ad.dec.automationParams}
                  {@const isEditing = ui.editingAutomationInline?.nodeId === oNode.id && ui.editingAutomationInline?.decoratorIndex === ad.idx}
                  <button
                    class="nav-auto-item"
                    class:editing={isEditing}
                    onpointerdown={() => {
                      if (isEditing) {
                        ui.editingAutomationInline = null
                      } else {
                        ui.editingAutomationInline = { nodeId: oNode.id, decoratorIndex: ad.idx }
                      }
                    }}
                  >
                    <span class="nav-auto-dot" style="background: {autoTargetColor(ap?.target)}"></span>
                    <span class="nav-auto-label">{ap ? autoTargetLabel(ap.target) : 'Auto'}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          {#if ui.editingAutomationInline?.nodeId === oNode.id}
            <DockAutomationEditor
              nodeId={ui.editingAutomationInline.nodeId}
              decoratorIndex={ui.editingAutomationInline.decoratorIndex}
              viewContext={ui.phraseView}
            />
          {/if}
        {/if}
      </div>
    </div>
    <div class="dock-lower">
      <div class="param-content">
        {#if ui.phraseView === 'fx'}
          <DockFxControls />
        {:else if ui.phraseView === 'eq'}
          <DockEqControls />
        {:else if ui.phraseView === 'master'}
          <DockMasterControls />
        {/if}
      </div>
    </div>
  </div>
  {:else}
  <!-- Normal single-scroll layout -->
  <div class="dock-body">
        <div class="param-content">
          <!-- Pattern header (ADR 069/070) -->
          {#if showPatternHeader && selectedPattern}
            <span class="section-label">PATTERN</span>
            <div class="dec-pat-header">
              <span class="dec-pat-dot" style="background: {PATTERN_COLORS[selectedPattern?.color ?? 0]}"></span>
              <input
                class="dec-pat-input"
                value={selectedPattern?.name ?? ''}
                maxlength="8"
                placeholder="NAME"
                onpointerdown={e => e.stopPropagation()}
                onfocus={e => (e.target as HTMLInputElement).select()}
                onblur={e => { if (selectedPatternIndex >= 0) patternRename(selectedPatternIndex, (e.target as HTMLInputElement).value) }}
                onkeydown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
            </div>
            <div class="dec-color-bar">
              {#each PATTERN_COLORS as c, i}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span
                  class="dec-color-sw"
                  class:active={selectedPattern.color === i}
                  style="--sw: {c}"
                  onpointerdown={() => patternSetColor(selectedPatternIndex, i)}
                ></span>
              {/each}
            </div>
            {#if !ui.patternSheet}
              <div class="dec-action-row">
                <button class="btn-open-seq" onpointerdown={openPatternSheet}
                  data-tip="Open step sequencer" data-tip-ja="ステップシーケンサーを開く"
                >Open Sequencer ▸</button>
                {#if scenePatternNode && !scenePatternNode.root}
                  <button class="btn-set-root" onpointerdown={() => sceneSetRoot(scenePatternNode.id)}
                    data-tip="Set as scene root" data-tip-ja="ルートノードに設定"
                  >★ Root</button>
                {/if}
              </div>
            {/if}
            <div class="section-divider" aria-hidden="true"></div>
          {/if}

          <!-- Decorator editor (ADR 069) -->
          {#if scenePatternNode}
            <DockDecoratorEditor node={scenePatternNode} />
            {#if ui.editingAutomationInline?.nodeId === scenePatternNode.id}
              <DockAutomationEditor
                nodeId={ui.editingAutomationInline.nodeId}
                decoratorIndex={ui.editingAutomationInline.decoratorIndex}
              />
            {/if}
          {/if}

          <!-- Generative node editor (ADR 078) -->
          {#if sceneGenerativeNode}
            <DockGenerativeEditor node={sceneGenerativeNode} />
          {/if}

          <!-- Scene Navigator (ADR 070) -->
          {#if showNavigator}
            <DockNavigator />
          {/if}

          {#if showTrackParams}
            <!-- Tab bar (ADR 092) -->
            <div class="dock-tabs">
              <button
                class="dock-tab"
                class:active={ui.dockTab === 'tracks'}
                onpointerdown={() => ui.dockTab = 'tracks'}
              >TRACKS</button>
              <button
                class="dock-tab"
                class:active={ui.dockTab === 'scene'}
                onpointerdown={() => ui.dockTab = 'scene'}
              >SCENE{#if decoCount > 0}<span class="dock-tab-badge">{decoCount}</span>{/if}</button>
            </div>

            {#if ui.dockTab === 'tracks'}
              <DockTrackEditor />
            {:else if ui.dockTab === 'scene'}
              {#if currentPatternSceneNode}
                <DockDecoratorEditor node={currentPatternSceneNode} />
                {#if ui.editingAutomationInline?.nodeId === currentPatternSceneNode.id}
                  <DockAutomationEditor
                    nodeId={ui.editingAutomationInline.nodeId}
                    decoratorIndex={ui.editingAutomationInline.decoratorIndex}
                  />
                {/if}
                {#if connectedGenerativeNodes.length > 0}
                  <div class="section-divider" aria-hidden="true"></div>
                  {#each connectedGenerativeNodes as genNode}
                    <DockGenerativeEditor node={genNode} />
                  {/each}
                {/if}
              {:else}
                <div class="dec-empty">
                  Place this pattern in the scene graph to add decorators.
                </div>
              {/if}
            {/if}
          {/if}
        </div>
    </div>
  {/if}<!-- close isOverlaySheet if/else -->
</div>

<style>
  .dock-panel {
    /* ── Dock design tokens ── */
    --dk-cream: 237,232,220;
    --dk-text: rgba(var(--dk-cream), 0.85);
    --dk-text-mid: rgba(var(--dk-cream), 0.55);
    --dk-text-dim: rgba(var(--dk-cream), 0.4);
    --dk-border: rgba(var(--dk-cream), 0.15);
    --dk-border-mid: rgba(var(--dk-cream), 0.3);
    --dk-bg-hover: rgba(var(--dk-cream), 0.08);
    --dk-bg-faint: rgba(var(--dk-cream), 0.06);
    --dk-bg-active: rgba(var(--dk-cream), 0.12);
    --dk-fs-xs: 9px;
    --dk-fs-sm: 10px;
    --dk-fs-md: 11px;
    --dk-fs-lg: 12px;

    position: relative;
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(var(--dk-cream), 0.08);
    overflow: hidden;
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── Split layout (overlay sheets: scene top, controls bottom) ── */
  .dock-body.dock-split {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dock-upper {
    flex: 1 1 50%;
    min-height: 80px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-bottom: 1px solid var(--dk-border);
  }
  .dock-lower {
    flex: 1 1 50%;
    min-height: 80px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* ── Dock Tabs (ADR 092) ── */
  .dock-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 8px;
    border: 1px solid var(--dk-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .dock-tab {
    flex: 1;
    font-family: var(--font-data, inherit);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 4px 0;
    border: none;
    background: transparent;
    color: var(--dk-text-dim);
    cursor: pointer;
    transition: background 60ms, color 60ms;
    position: relative;
  }
  .dock-tab:not(:last-child) {
    border-right: 1px solid var(--dk-border);
  }
  .dock-tab:hover {
    background: var(--dk-bg-hover);
    color: var(--dk-text-mid);
  }
  .dock-tab.active {
    background: var(--dk-bg-active);
    color: var(--dk-text);
  }
  .dock-tab-badge {
    font-size: 8px;
    font-weight: 700;
    vertical-align: super;
    margin-left: 1px;
    color: var(--color-olive);
  }
  .dec-empty {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    padding: 12px 0;
    font-style: italic;
  }

  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 8px 0;
  }
  .section-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 2px;
  }

  /* ── Decorator pattern header ── */
  .dec-pat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    gap: 6px;
  }
  .dec-pat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dec-pat-input {
    font-size: var(--dk-fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text);
    background: var(--dk-bg-faint);
    border: 1px solid var(--dk-border);
    border-bottom: 1px solid var(--dk-border-mid);
    outline: none;
    padding: 2px 6px;
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    transition: border-color 60ms;
  }
  .dec-pat-input::placeholder {
    color: var(--dk-text-dim);
    font-style: italic;
  }
  .dec-pat-input:focus {
    border-color: var(--dk-border-mid);
    background: var(--dk-bg-hover);
  }
  .dec-color-bar {
    display: flex;
    gap: 2px;
    margin: 10px 0 10px;
  }
  .dec-color-sw {
    width: 100%;
    height: 6px;
    background: var(--sw);
    opacity: 0.4;
    cursor: pointer;
    transition: opacity 60ms, transform 60ms;
  }
  .dec-color-sw:first-child { border-radius: 2px 0 0 2px; }
  .dec-color-sw:last-child { border-radius: 0 2px 2px 0; }
  .dec-color-sw:hover {
    opacity: 0.7;
    transform: scaleY(1.5);
  }
  .dec-color-sw.active {
    opacity: 1;
    transform: scaleY(1.8);
  }
  .dec-action-row {
    display: flex;
    gap: 4px;
    margin: 6px 0 8px;
  }
  .btn-open-seq {
    flex: 1;
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
  }
  .btn-open-seq:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }
  .btn-set-root {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 8px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-set-root:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }

  /* ── Automation inline (overlay mode) ── */
  .nav-auto-section {
    margin-top: 4px;
  }
  .nav-auto-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .nav-auto-add {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 1px 6px;
    border: 1px solid rgba(237, 232, 220, 0.3);
    border-radius: 3px;
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .nav-auto-add:hover {
    background: var(--dk-bg-hover);
    color: var(--dk-text);
  }
  .nav-auto-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 4px;
  }
  .nav-auto-item {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 1px 5px;
    border: 1px solid rgba(237, 232, 220, 0.15);
    border-radius: 3px;
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .nav-auto-item:hover {
    background: var(--dk-bg-hover);
  }
  .nav-auto-item.editing {
    background: var(--dk-bg-active);
    color: rgba(237, 232, 220, 0.9);
    border-color: var(--dk-text-dim);
  }
  .nav-auto-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .nav-auto-label {
    white-space: nowrap;
  }
</style>
