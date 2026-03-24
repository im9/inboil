<script lang="ts">
  import { lang, song, project, projectNew, projectSaveAs, projectLoad, projectDelete, projectLoadFactory, projectRename, listProjects, exportProjectJSON, importProjectJSON, type StoredProject } from '../state.svelte.ts'
  import { exportAndDownloadMidi } from '../midiExport.ts'

  const L = $derived(lang.value)

  let projectList = $state<Pick<StoredProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>[]>([])
  let savingAs = $state(false)
  let saveAsName = $state('')
  let saveAsInput: HTMLInputElement | undefined = $state()
  let confirmDeleteId = $state<string | null>(null)

  async function refreshProjects() { projectList = await listProjects() }

  $effect(() => { void refreshProjects() })

  let renameName = $state('')
  let renameInput: HTMLInputElement | undefined = $state()
  let renamingProject = $state(false)

  function startRename() {
    renameName = song.name || ''
    renamingProject = true
    requestAnimationFrame(() => renameInput?.select())
  }
  function commitRename() {
    renamingProject = false
    const name = renameName.trim() || 'Untitled'
    void projectRename(name).then(() => refreshProjects())
  }

  // ── Import project ──
  let fileInput: HTMLInputElement | undefined = $state()
  let importError = $state('')

  function handleImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    importError = ''
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await importProjectJSON(reader.result as string)
        await refreshProjects()
      } catch (err) {
        importError = (err as Error).message
      }
    }
    reader.readAsText(file)
    if (fileInput) fileInput.value = ''
  }

  let confirmNew = $state(false)

  function handleNew() {
    if (project.dirty) { confirmNew = true; return }
    doNew()
  }
  function doNew() { confirmNew = false; projectNew(); void refreshProjects() }

  function handleSaveAs() {
    savingAs = true
    saveAsName = ''
    requestAnimationFrame(() => saveAsInput?.focus())
  }

  async function commitSaveAs() {
    savingAs = false
    const name = saveAsName.trim() || 'Untitled'
    await projectSaveAs(name)
    project.dirty = false
    await refreshProjects()
  }

  async function handleLoad(id: string) {
    await projectLoad(id)
    await refreshProjects()
  }

  async function handleDelete(id: string) {
    await projectDelete(id)
    confirmDeleteId = null
    await refreshProjects()
  }
</script>

<!-- ── PROJECT tab ── -->
<div class="proj-primary">
  <button class="btn-proj-primary" onpointerdown={handleNew}
    data-tip="New project" data-tip-ja="新規プロジェクト">
    NEW PROJECT
  </button>
  <button class="btn-proj-primary outline" onpointerdown={handleSaveAs}
    data-tip="Save as new project" data-tip-ja="別名で保存">
    SAVE AS
  </button>
</div>

<div class="proj-rename">
  <span class="proj-rename-label">{L === 'ja' ? 'プロジェクト名' : 'PROJECT NAME'}</span>
  {#if renamingProject}
    <div class="proj-rename-row">
      <input
        bind:this={renameInput}
        class="proj-name-input"
        type="text"
        maxlength="20"
        bind:value={renameName}
        onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { renamingProject = false } }}
      />
      <button class="btn-proj-primary" onpointerdown={commitRename}>OK</button>
    </div>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="proj-rename-value" onclick={startRename}
      data-tip="Click to rename" data-tip-ja="クリックで名前変更">
      {song.name || 'Untitled'}
    </span>
  {/if}
</div>
{#if confirmNew}
  <div class="proj-confirm">
    <span class="proj-confirm-text">{L === 'ja' ? '未保存の変更があります。破棄しますか？' : 'Discard unsaved changes?'}</span>
    <div class="proj-confirm-actions">
      <button class="btn-proj-primary danger" onpointerdown={doNew}>DISCARD</button>
      <button class="btn-proj-primary outline" onpointerdown={() => { confirmNew = false }}>CANCEL</button>
    </div>
  </div>
{/if}
{#if savingAs}
  <div class="proj-save-as">
    <input
      bind:this={saveAsInput}
      class="proj-name-input"
      type="text"
      maxlength="20"
      placeholder={L === 'ja' ? 'プロジェクト名...' : 'Project name...'}
      bind:value={saveAsName}
      onkeydown={(e) => { if (e.key === 'Enter') void commitSaveAs(); if (e.key === 'Escape') savingAs = false }}
    />
    <button class="btn-proj-primary" onpointerdown={() => void commitSaveAs()}>OK</button>
  </div>
{/if}

<!-- Project list -->
<div class="proj-list">
  <div class="proj-list-label">{L === 'ja' ? 'デモ' : 'DEMO'}</div>
  <div class="proj-item">
    <button class="proj-item-name factory" onpointerdown={projectLoadFactory}>
      Factory Demo
    </button>
    <span class="proj-item-date">built-in</span>
  </div>
</div>
{#if projectList.length > 0}
  <div class="proj-list">
    <div class="proj-list-label">{L === 'ja' ? 'プロジェクト' : 'PROJECTS'} <span class="local-badge" data-tip="Saved locally in this browser" data-tip-ja="このブラウザにローカル保存">(local)</span></div>
    {#each projectList as p}
      <div class="proj-item" class:current={p.id === project.id}>
        <button class="proj-item-name" onpointerdown={() => void handleLoad(p.id)}>
          {p.name}
        </button>
        <span class="proj-item-date">{new Date(p.updatedAt).toLocaleDateString()}</span>
        {#if confirmDeleteId === p.id}
          <button class="proj-item-del confirm" onpointerdown={() => void handleDelete(p.id)}>
            DEL
          </button>
          <button class="proj-item-del" onpointerdown={() => { confirmDeleteId = null }}>
            ✕
          </button>
        {:else}
          <button class="proj-item-del" onpointerdown={() => { confirmDeleteId = p.id }}>
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- File: Export / Import (ADR 020 §J, ADR 030) -->
<div class="export-section">
  <span class="proj-list-label">{L === 'ja' ? 'ファイル' : 'FILE'}</span>
  <span class="export-sub-label">{L === 'ja' ? 'プロジェクト' : 'PROJECT'}</span>
  <div class="export-buttons">
    <button class="btn-export" onpointerdown={exportProjectJSON}
      data-tip="Export project as JSON" data-tip-ja="プロジェクトをJSONファイルとしてエクスポート"
    >EXPORT</button>
    <button class="btn-export" onpointerdown={() => fileInput?.click()}
      data-tip="Import project from JSON file" data-tip-ja="JSONファイルからプロジェクトを読み込み"
    >IMPORT</button>
  </div>
  {#if importError}
    <div class="import-error">{importError}</div>
  {/if}
  <input bind:this={fileInput} type="file" accept=".json,.inboil.json" onchange={handleImportFile} style="display:none" />
  <span class="export-sub-label" style="margin-top: 10px">{L === 'ja' ? 'パターン' : 'PATTERN'}</span>
  <div class="export-buttons">
    <button class="btn-export" onpointerdown={exportAndDownloadMidi}
      data-tip="Export current pattern as MIDI file" data-tip-ja="現在のパターンをMIDIファイルとしてエクスポート"
    >EXPORT MIDI</button>
  </div>
</div>

<style>
  .proj-primary {
    display: flex;
    gap: 6px;
    padding: 12px 16px 8px;
  }
  .btn-proj-primary {
    flex: 1;
    border: 1.5px solid var(--dz-transport-border);
    background: var(--dz-bg-active);
    color: var(--dz-text-bright);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 8px;
    cursor: pointer;
    transition: background 40ms linear, color 40ms linear;
  }
  .btn-proj-primary:hover {
    background: var(--dz-bg-press);
    color: var(--dz-text-bright);
  }
  .btn-proj-primary:active {
    background: var(--dz-border-mid);
  }
  .btn-proj-primary.outline {
    background: transparent;
    border-color: var(--dz-border-strong);
    color: var(--dz-text);
  }
  .btn-proj-primary.outline:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-bright);
  }
  .btn-proj-primary.danger {
    border-color: var(--color-salmon);
    background: transparent;
    color: var(--color-salmon);
  }
  .btn-proj-primary.danger:hover {
    background: var(--dz-divider);
  }
  .proj-rename {
    padding: 4px 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .proj-rename-label {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dz-text-dim);
    text-transform: uppercase;
  }
  .proj-rename-value {
    font-size: var(--fs-base);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text);
    cursor: pointer;
    text-transform: uppercase;
  }
  .proj-rename-value:hover {
    color: var(--dz-text-bright);
  }
  .proj-rename-row {
    display: flex;
    gap: 6px;
  }
  .proj-save-as {
    display: flex;
    gap: 6px;
    padding: 0 16px 8px;
  }
  .proj-name-input {
    flex: 1;
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dz-text-bright);
    background: var(--dz-divider);
    border: 1.5px solid var(--dz-border-mid);
    padding: 8px 10px;
    outline: none;
  }
  .proj-name-input:focus {
    border-color: var(--dz-transport-border);
  }
  .proj-confirm {
    margin: 0 16px 8px;
    padding: 10px 12px;
    background: var(--dz-divider);
    border: 1px solid var(--dz-bg-active);
  }
  .proj-confirm-text {
    font-size: var(--fs-lg);
    color: var(--dz-text);
    display: block;
    margin-bottom: 8px;
  }
  .proj-confirm-actions { display: flex; gap: 6px; }
  .proj-list {
    padding: 4px 16px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .proj-list-label {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dz-transport-border);
    text-transform: uppercase;
    padding: 8px 0 4px;
  }
  .local-badge {
    font-weight: 400;
    opacity: 0.7;
    text-transform: lowercase;
  }
  .proj-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 8px;
    border-radius: 0;
    transition: background 40ms linear;
  }
  .proj-item:hover { background: var(--dz-divider); }
  .proj-item.current { background: var(--dz-bg-hover); }
  .proj-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    color: var(--dz-text);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.02em;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }
  .proj-item.current .proj-item-name { color: var(--dz-text-bright); }
  .proj-item-name:hover { color: var(--dz-text-bright); }
  .proj-item-name.factory { color: var(--dz-transport-border); font-style: italic; }
  .proj-item-date {
    font-size: var(--fs-sm);
    color: var(--dz-text-dim);
    flex-shrink: 0;
  }
  .proj-item-del {
    background: none;
    border: none;
    color: var(--dz-border);
    font-size: var(--fs-lg);
    cursor: pointer;
    padding: 2px 4px;
    flex-shrink: 0;
    transition: color 40ms linear;
  }
  .proj-item-del:hover { color: var(--dz-text-mid); }
  .proj-item-del.confirm {
    color: var(--color-salmon);
    font-size: var(--fs-md);
    font-weight: 700;
  }
  .export-section {
    padding: 8px 16px;
    border-top: 1px solid var(--dz-bg-hover);
  }
  .export-buttons {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .btn-export {
    flex: 1;
    padding: 6px 8px;
    font-size: var(--fs-md);
    font-weight: 600;
    letter-spacing: 0.05em;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    background: var(--dz-divider);
    color: var(--dz-text);
    cursor: pointer;
    transition: background 0.1s;
  }
  .btn-export:active {
    background: var(--dz-bg-press);
  }
  .export-sub-label {
    display: block;
    font-size: var(--fs-sm);
    letter-spacing: 0.08em;
    color: var(--dz-border-strong);
    text-transform: uppercase;
    margin: 6px 0 4px;
  }
  .import-error {
    font-size: var(--fs-md);
    color: var(--color-salmon);
    padding: 4px 0 0;
  }
</style>
