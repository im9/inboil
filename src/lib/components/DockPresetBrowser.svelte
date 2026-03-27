<script lang="ts">
  import { activeCell, ui } from '../state.svelte.ts'
  import { applyPreset, resetToDefaults } from '../stepActions.ts'
  import { hasPresets, getPresets, getPresetCategories, CATEGORY_LABELS, loadUserPresetsIntoCache, isUserPresetsLoaded, addUserPresetToCache, removeUserPresetFromCache, renameUserPresetInCache, type UserPreset } from '../presets.ts'

  const { onopen }: {
    onopen?: () => void
  } = $props()

  const cell = $derived(ui.selectedTrack >= 0 ? activeCell(ui.selectedTrack) : null)
  const showPresets = $derived(cell ? hasPresets(cell.voiceId) : false)
  const currentPreset = $derived(cell?.presetName ?? '')

  let presetCategory = $state<string | null>(null)
  let presetOpen = $state(false)
  $effect(() => { cell?.voiceId; presetCategory = null })

  // Close when parent requests (e.g. voice picker opened)
  export function close() { presetOpen = false }

  // ── Recently used presets (session only, per voice) ──
  const recentPresetsMap = new Map<string, string[]>()
  let recentVersion = $state(0)
  const recentPresets = $derived.by(() => {
    recentVersion
    const vid = cell?.voiceId
    if (!vid) return [] as { name: string; params: Record<string, number> }[]
    const names = recentPresetsMap.get(vid) ?? []
    const all = getPresets(vid, null)
    return names
      .map(n => all.find(p => p.name === n))
      .filter((p): p is NonNullable<typeof p> => p != null)
  })

  function trackRecent(voiceId: string, presetName: string) {
    const list = recentPresetsMap.get(voiceId) ?? []
    const filtered = list.filter(n => n !== presetName)
    filtered.unshift(presetName)
    if (filtered.length > 4) filtered.pop()
    recentPresetsMap.set(voiceId, filtered)
    recentVersion++
  }

  function selectPreset(preset: { name: string; params: Record<string, number> }) {
    applyPreset(ui.selectedTrack, preset.params, preset.name)
    if (cell?.voiceId) trackRecent(cell.voiceId, preset.name)
    presetOpen = false
  }

  // ── User preset save/delete ──
  let saveMode = $state(false)
  let saveName = $state('')
  let saveInput = $state<HTMLInputElement>(null!)
  let userPresetVersion = $state(0)

  $effect(() => {
    if (!isUserPresetsLoaded()) void loadUserPresetsIntoCache().then(() => { userPresetVersion++ }).catch(e => console.warn('[presets] load failed:', e))
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  const presetListAll = $derived.by(() => {
    userPresetVersion
    return cell ? getPresets(cell.voiceId, presetCategory) : []
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  const presetCatsAll = $derived.by(() => {
    userPresetVersion
    return cell ? getPresetCategories(cell.voiceId) : []
  })

  function startSavePreset() {
    saveMode = true
    saveName = ''
    requestAnimationFrame(() => saveInput?.focus())
  }

  let saving = false
  async function commitSavePreset() {
    if (saving) return
    const name = saveName.trim()
    const voiceId = cell?.voiceId
    const params = cell ? { ...cell.voiceParams } : null
    saveMode = false
    if (!name || !voiceId || !params) return
    saving = true
    try {
      const { saveUserPreset } = await import('../storage.ts')
      const id = await saveUserPreset(voiceId, name, params)
      addUserPresetToCache(voiceId, name, params, id)
      userPresetVersion++
      if (cell) cell.presetName = name
    } finally {
      saving = false
    }
  }

  function cancelSavePreset() {
    if (saving) return
    saveMode = false
  }

  async function handleDeletePreset(preset: UserPreset) {
    const { deleteUserPreset } = await import('../storage.ts')
    await deleteUserPreset(preset.id)
    removeUserPresetFromCache(preset.voiceId, preset.id)
    userPresetVersion++
    if (cell?.presetName === preset.name) {
      cell.presetName = undefined
    }
  }

  function isUserPreset(preset: unknown): preset is UserPreset {
    return typeof preset === 'object' && preset !== null && 'isUser' in preset
  }

  // ── User preset rename (double-tap) ──
  let renamingId = $state<number | null>(null)
  let renameName = $state('')
  let renameInput = $state<HTMLInputElement>(null!)
  let lastTapId = $state<number | null>(null)
  let lastTapTime = $state(0)

  function handlePresetTap(preset: UserPreset) {
    const now = Date.now()
    if (lastTapId === preset.id && now - lastTapTime < 400) {
      lastTapId = null
      renamingId = preset.id
      renameName = preset.name
      requestAnimationFrame(() => renameInput?.focus())
    } else {
      lastTapId = preset.id
      lastTapTime = now
      selectPreset(preset)
    }
  }

  let renaming = false
  async function commitRename(preset: UserPreset) {
    if (renaming) return
    const name = renameName.trim()
    const id = renamingId
    renamingId = null
    if (!name || !id || name === preset.name) return
    renaming = true
    try {
      const { renameUserPreset } = await import('../storage.ts')
      await renameUserPreset(id, name)
      renameUserPresetInCache(preset.voiceId, id, name)
      userPresetVersion++
      if (cell?.presetName === preset.name) {
        cell.presetName = name.slice(0, 16)
      }
    } finally {
      renaming = false
    }
  }

  function cancelRename() {
    if (renaming) return
    renamingId = null
  }
</script>

{#if showPresets}
  <div class="preset-section">
    <div class="preset-header">
      <button class="voice-current" onpointerdown={() => { presetOpen = !presetOpen; if (presetOpen) onopen?.() }}
        data-tip="Browse presets" data-tip-ja="プリセットを選択"
      >
        <span class="voice-current-name">{currentPreset || 'PRESETS'}</span>
        <span class="voice-current-arrow">{presetOpen ? '▾' : '▸'}</span>
      </button>
      <button class="btn-init-preset" onpointerdown={() => { resetToDefaults(ui.selectedTrack); presetOpen = false }}
        data-tip="Reset to default parameters" data-tip-ja="デフォルトパラメータに戻す"
      >INIT</button>
      <button class="btn-save-preset" onpointerdown={startSavePreset}
        data-tip="Save current sound as preset" data-tip-ja="現在の音色をプリセットとして保存"
      >SAVE</button>
    </div>
    {#if presetOpen}
      {#if saveMode}
        <div class="preset-save-row">
          <input
            bind:this={saveInput}
            class="preset-save-input"
            type="text"
            maxlength="16"
            placeholder="Preset name"
            bind:value={saveName}
            onkeydown={(e) => { if (e.key === 'Enter') commitSavePreset(); if (e.key === 'Escape') cancelSavePreset() }}
            onblur={cancelSavePreset}
          />
        </div>
      {/if}
      {#if presetCatsAll.length > 0}
      <div class="picker-cats">
        <button class="cat-btn" class:active={presetCategory === null}
          onpointerdown={() => presetCategory = null}>ALL</button>
        {#each presetCatsAll as cat}
          <button class="cat-btn" class:active={presetCategory === cat}
            onpointerdown={() => presetCategory = cat}>{CATEGORY_LABELS[cat] ?? cat.toUpperCase()}</button>
        {/each}
      </div>
      {/if}
      {#if recentPresets.length > 0}
      <div class="picker-recent">
        <span class="picker-recent-label">RECENT</span>
        {#each recentPresets as preset}
          <button class="picker-recent-btn" class:selected={currentPreset === preset.name}
            onpointerdown={() => selectPreset(preset)}
          >{preset.name}</button>
        {/each}
      </div>
      {/if}
      <div class="picker-list">
        {#each presetListAll as preset}
          {#if isUserPreset(preset) && renamingId === preset.id}
            <div class="picker-item renaming">
              {#if preset.category}<span class="picker-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
              <input
                bind:this={renameInput}
                class="preset-rename-input"
                type="text"
                maxlength="16"
                bind:value={renameName}
                onkeydown={(e) => { if (e.key === 'Enter') commitRename(preset); if (e.key === 'Escape') cancelRename() }}
                onblur={() => cancelRename()}
              />
            </div>
          {:else}
            <button class="picker-item" class:selected={currentPreset === preset.name}
              onpointerdown={() => isUserPreset(preset) ? handlePresetTap(preset) : selectPreset(preset)}
            >
              {#if preset.category}<span class="picker-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
              <span class="picker-name">{preset.name}</span>
              {#if isUserPreset(preset)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="preset-del" onpointerdown={(e) => { e.stopPropagation(); handleDeletePreset(preset) }}
                  data-tip="Delete preset" data-tip-ja="プリセットを削除"
                >✕</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .preset-section {
    margin-bottom: 8px;
  }
  .preset-header {
    display: flex;
    gap: 4px;
    align-items: stretch;
    margin-bottom: 4px;
  }
  .voice-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-strong);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 10px;
    cursor: pointer;
    transition: border-color 80ms;
  }
  .voice-current:hover {
    border-color: var(--dz-border-strong);
  }
  .voice-current-name {
    text-transform: uppercase;
  }
  .voice-current-arrow {
    font-size: var(--fs-sm);
    opacity: 0.4;
  }
  .picker-cats {
    display: flex;
    gap: 2px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .cat-btn {
    flex: 1;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-dim);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 5px;
    cursor: pointer;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-recent {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 2px;
    flex-wrap: wrap;
  }
  .picker-recent-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-border-mid);
    margin-right: 2px;
  }
  .picker-recent-btn {
    border: 1px solid var(--dz-bg-active);
    background: var(--dz-divider);
    color: var(--dz-text-mid);
    font-size: var(--fs-md);
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90px;
  }
  .picker-recent-btn:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .picker-recent-btn.selected {
    background: var(--olive-bg);
    color: var(--dz-text-bright);
    border-color: var(--olive-border-strong);
  }
  .picker-list {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-top: 4px;
    border: 1px solid var(--dz-border-subtle);
  }
  .picker-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dz-divider);
    background: transparent;
    color: var(--dz-text);
    font-size: var(--fs-base);
    padding: 5px 6px;
    text-align: left;
    cursor: pointer;
  }
  .picker-item:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-bright);
  }
  .picker-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-item.selected {
    background: var(--olive-bg);
    color: var(--dz-text-bright);
  }
  .picker-item.selected .picker-cat-tag {
    color: var(--color-olive);
  }
  .picker-cat-tag {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dz-text-dim);
    min-width: 28px;
    flex-shrink: 0;
  }
  .picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn-init-preset {
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 6px 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 60ms, color 60ms;
  }
  .btn-init-preset:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .btn-init-preset:active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .btn-save-preset {
    border: 1px solid var(--olive-border-strong);
    background: transparent;
    color: var(--color-olive);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 6px 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 60ms, color 60ms;
  }
  .btn-save-preset:hover {
    background: var(--olive-bg);
  }
  .btn-save-preset:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-save-row {
    margin-top: 4px;
  }
  .preset-save-input {
    width: 100%;
    font-family: var(--font-data);
    font-size: var(--fs-base);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--dz-text-bright);
    background: var(--dz-bg-hover);
    border: 1px solid var(--color-olive);
    padding: 4px 6px;
    outline: none;
    box-sizing: border-box;
  }
  .preset-del {
    font-size: var(--fs-min);
    color: var(--dz-border-strong);
    flex-shrink: 0;
    padding: 2px 4px;
    cursor: pointer;
    transition: color 60ms;
  }
  .preset-del:hover {
    color: var(--color-danger);
  }
  .picker-item.renaming {
    background: var(--dz-bg-hover);
  }
  .preset-rename-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-data);
    font-size: var(--fs-base);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--dz-text-bright);
    background: var(--dz-bg-hover);
    border: 1px solid var(--color-olive);
    padding: 2px 4px;
    outline: none;
    box-sizing: border-box;
  }
</style>
