<script lang="ts">
  import { song, ui, playback, selectPattern, lang } from '../state.svelte.ts'
  import type { SceneNode } from '../types.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'
  import { sceneSetRoot, sceneDeleteNode } from '../sceneActions.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import DockGenerativeEditor from './DockGenerativeEditor.svelte'
  import DockTrackEditor from './DockTrackEditor.svelte'
  import DockNavigator from './DockNavigator.svelte'
  import DockFxControls from './DockFxControls.svelte'
  import DockEqControls from './DockEqControls.svelte'
  import DockMasterControls from './DockMasterControls.svelte'

  // FX/EQ/Master overlay sheets use split layout
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  // Pattern header: always shown (except during overlay sheets)
  const showPatternHeader = $derived(!isOverlaySheet)
  const showNavigator = $derived(!ui.patternSheet)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

  const selectedPattern = $derived(song.patterns[ui.currentPattern] ?? null)

  // Selected scene pattern node (for Root/Remove actions)
  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  // Find scene node for current pattern (for SCENE tab generative nodes)
  const currentPatternSceneNode = $derived.by(() => {
    if (!ui.patternSheet) return null
    const patId = selectedPattern?.id
    if (!patId) return null
    const matches = song.scene.nodes.filter(n => n.type === 'pattern' && n.patternId === patId)
    if (matches.length <= 1) return matches[0] ?? null
    const playing = matches.find(n => playback.sceneNodeId === n.id)
    if (playing) return playing
    const selected = matches.find(n => ui.selectedSceneNodes[n.id])
    return selected ?? matches[0]
  })
  // Generative nodes connected to current pattern's scene node (incoming edges)
  const connectedGenerativeNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => n?.type === 'generative' && !!n.generative)
  })
  const sceneTabCount = $derived(connectedGenerativeNodes.length)

  function openPatternSheet() {
    if (!scenePatternNode?.patternId) return
    const idx = song.patterns.findIndex(p => p.id === scenePatternNode.patternId)
    if (idx < 0) return
    selectPattern(idx)
    ui.patternSheet = true
  }
</script>

<div class="dock-panel" class:split={isOverlaySheet}>
  {#if isOverlaySheet}
  <!-- Split layout: scene navigator (upper) + overlay controls (lower) -->
  <div class="dock-body dock-split">
    <div class="dock-upper">
      <div class="param-content">
        {#if showNavigator}
          <DockNavigator />
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
      <!-- Pattern header -->
      {#if showPatternHeader && selectedPattern}
        <span class="section-label">PATTERN</span>
        <div class="pat-header">
          <span class="pat-dot" style="background: {PATTERN_COLORS[selectedPattern.color ?? 0]}"></span>
          <input
            class="pat-input"
            value={selectedPattern.name ?? ''}
            maxlength="8"
            placeholder="NAME"
            onpointerdown={e => e.stopPropagation()}
            onfocus={e => (e.target as HTMLInputElement).select()}
            onblur={e => patternRename(ui.currentPattern, (e.target as HTMLInputElement).value)}
            onkeydown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
          <div class="color-row">
            {#each PATTERN_COLORS as color, ci}
              <button
                class="color-swatch"
                class:selected={selectedPattern.color === ci}
                style="background: {color}"
                aria-label="Color {ci}"
                onpointerdown={() => patternSetColor(ui.currentPattern, ci)}
              ></button>
            {/each}
          </div>
        </div>
        <!-- Scene node actions (when a pattern node is selected in scene view) -->
        {#if scenePatternNode}
          <div class="node-actions">
            <button class="btn-open-sheet" onpointerdown={openPatternSheet}
              data-tip="Open pattern in step sequencer" data-tip-ja="ステップシーケンサーで開く"
            >Edit</button>
            {#if !scenePatternNode.root}
              <button class="btn-set-root" onpointerdown={() => sceneSetRoot(scenePatternNode.id)}
                data-tip="Set as scene root" data-tip-ja="ルートノードに設定"
              >★ Root</button>
              <button class="btn-delete-node" onpointerdown={() => { sceneDeleteNode(scenePatternNode.id); ui.selectedSceneNodes = {} }}
                data-tip="Remove from scene" data-tip-ja="シーンから削除"
              >✕ Remove</button>
            {/if}
          </div>
        {/if}
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- Scene Navigator -->
      {#if showNavigator}
        <DockNavigator />
      {/if}

      {#if showTrackParams}
        <!-- Tab bar (ADR 092) -->
        <div class="dock-tabs" role="tablist" aria-label="Dock">
          <button
            class="dock-tab"
            role="tab"
            aria-selected={ui.dockTab === 'tracks'}
            class:active={ui.dockTab === 'tracks'}
            onpointerdown={() => ui.dockTab = 'tracks'}
          >TRACKS</button>
          <button
            class="dock-tab"
            role="tab"
            aria-selected={ui.dockTab === 'scene'}
            class:active={ui.dockTab === 'scene'}
            onpointerdown={() => ui.dockTab = 'scene'}
          >SCENE{#if sceneTabCount > 0}<span class="dock-tab-badge">{sceneTabCount}</span>{/if}</button>
        </div>

        {#if ui.dockTab === 'tracks'}
          <DockTrackEditor />
        {:else if ui.dockTab === 'scene'}
          {#if connectedGenerativeNodes.length > 0}
            {#each connectedGenerativeNodes as genNode}
              <DockGenerativeEditor node={genNode} />
            {/each}
          {:else}
            <div class="empty-hint">{lang.value === 'ja' ? 'ファンクションノード未接続' : 'No function nodes connected'}</div>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
  {/if}
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
    --dk-fs-xs: 10px;
    --dk-fs-sm: 11px;
    --dk-fs-md: 12px;
    --dk-fs-lg: 13px;

    position: relative;
    width: 340px;
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
    border-radius: 0;
    overflow: hidden;
  }
  .dock-tab {
    flex: 1;
    font-family: var(--font-data, inherit);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 6px 0;
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
    font-size: 9px;
    font-weight: 700;
    vertical-align: super;
    margin-left: 1px;
    color: var(--color-olive);
  }
  .empty-hint {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    padding: 12px 0;
    font-style: italic;
  }

  /* ── Content ── */
  .param-content {
    padding: 12px 16px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 8px 0;
  }
  .section-label {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 4px;
  }

  /* ── Pattern header ── */
  .pat-header {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    gap: 8px;
  }
  .pat-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pat-input {
    font-size: var(--dk-fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text);
    background: var(--dk-bg-faint);
    border: 1px solid var(--dk-border);
    border-bottom: 1px solid var(--dk-border-mid);
    outline: none;
    padding: 4px 8px;
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    transition: border-color 60ms;
  }
  .pat-input::placeholder {
    color: var(--dk-text-dim);
    font-style: italic;
  }
  .pat-input:focus {
    border-color: var(--dk-border-mid);
    background: var(--dk-bg-hover);
  }
  .color-row {
    display: flex;
    gap: 3px;
  }
  .color-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: opacity 60ms, transform 60ms;
    opacity: 0.5;
  }
  .color-swatch:hover {
    opacity: 0.8;
    transform: scale(1.15);
  }
  .color-swatch.selected {
    opacity: 1;
    border-color: var(--dk-text);
    transform: scale(1.2);
  }

  /* ── Node actions ── */
  .node-actions {
    display: flex;
    gap: 6px;
    margin: 8px 0 10px;
  }
  .btn-open-sheet {
    flex: 1;
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 7px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
  }
  .btn-open-sheet:hover {
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
    padding: 7px 10px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-set-root:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }
  .btn-delete-node {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 7px 10px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-delete-node:hover {
    color: var(--color-danger);
    background: var(--dk-bg-hover);
  }
</style>
