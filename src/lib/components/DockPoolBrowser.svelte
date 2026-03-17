<script lang="ts">
  /**
   * Inline pool browser for the Sampler section.
   * Shows folder drill-down, audition, and one-tap assign.
   * Toggled by POOL button next to LOAD in DockTrackEditor.
   */
  import { pool, poolAssignToTrack, poolAssignPackToTrack, poolDeleteEntry, poolRenameEntry, poolMoveEntry } from '../state.svelte.ts'
  import type { PoolEntry } from '../audioPool.ts'
  import { showToast } from '../toast.svelte.ts'

  interface Props {
    trackId: number
    onclose?: () => void
  }
  const { trackId, onclose }: Props = $props()

  // ── Factory packs (ADR 106) ──
  interface PackInfo { id: string; name: string; category: string; zoneCount: number }
  let packs = $state<PackInfo[]>([])
  let loadingPack = $state<string | null>(null)

  $effect(() => {
    void import('../audioPool.ts').then(mod => mod.getFactoryPacks()).then(fp => {
      packs = fp.map(p => ({ id: p.id, name: p.name, category: p.category, zoneCount: p.zones.length }))
    }).catch(() => { /* factory not installed yet */ })
  })

  async function assignPack(pack: PackInfo) {
    if (loadingPack) return
    loadingPack = pack.id
    stopAudition()
    await poolAssignPackToTrack(pack.id, pack.name, trackId)
    loadingPack = null
    onclose?.()
  }

  // Packs matching search filter
  const filteredPacks = $derived.by(() => {
    if (!isSearching) return packs
    return packs.filter(p => {
      const hay = (p.name + ' ' + p.category).toLowerCase()
      return searchTerms.every(t => hay.includes(t))
    })
  })

  // ── Search ──
  let query = $state('')

  // ── Folder drill-down ──
  let currentPath = $state('')
  const allFolders = $derived([...new Set(pool.entries.map(e => e.folder))].sort())

  const childFolders = $derived.by(() => {
    const prefix = currentPath ? currentPath + '/' : ''
    const children = new Set<string>()
    for (const f of allFolders) {
      if (currentPath === '' || f === currentPath || f.startsWith(prefix)) {
        const rest = currentPath === '' ? f : f.slice(prefix.length)
        if (rest) {
          const seg = rest.split('/')[0]
          children.add(seg)
        }
      }
    }
    return [...children].sort()
  })

  // Search mode: when query is non-empty, ignore folder filter and search all entries
  const isSearching = $derived(query.trim().length > 0)
  const searchTerms = $derived(query.toLowerCase().trim().split(/\s+/).filter(Boolean))

  const filteredEntries = $derived.by(() => {
    let entries = pool.entries
    // Folder filter (only when not searching)
    if (!isSearching && currentPath !== '') {
      entries = entries.filter(e => e.folder === currentPath || e.folder.startsWith(currentPath + '/'))
    }
    // Text search (matches all terms against name and folder)
    if (isSearching) {
      entries = entries.filter(e => {
        const hay = (e.name + ' ' + e.folder).toLowerCase()
        return searchTerms.every(t => hay.includes(t))
      })
    }
    return entries
  })
  const sortedEntries = $derived(
    [...filteredEntries].sort((a, b) => a.name.localeCompare(b.name))
  )

  const breadcrumbs = $derived(currentPath ? currentPath.split('/') : [])

  // ── Audition ──
  let auditioning = $state<string | null>(null)
  let auditCtx: AudioContext | null = null
  let auditSource: AudioBufferSourceNode | null = null

  async function audition(entry: PoolEntry) {
    stopAudition()
    try {
      const { readSample } = await import('../audioPool.ts')
      const raw = await readSample(entry)
      if (!raw) return
      if (!auditCtx) auditCtx = new AudioContext()
      const buf = await auditCtx.decodeAudioData(raw.slice(0))
      auditSource = auditCtx.createBufferSource()
      auditSource.buffer = buf
      auditSource.connect(auditCtx.destination)
      auditSource.onended = () => { auditioning = null }
      auditSource.start()
      auditioning = entry.id
    } catch {
      showToast('Audition failed', 'error')
    }
  }

  function stopAudition() {
    if (auditSource) {
      try { auditSource.stop() } catch { /* already stopped */ }
      auditSource = null
    }
    auditioning = null
  }

  // ── Assign ──
  let assigning = $state(false)
  async function assign(entry: PoolEntry) {
    if (assigning) return
    assigning = true
    stopAudition()
    await poolAssignToTrack(entry, trackId)
    assigning = false
    onclose?.()
  }

  // ── Row actions (delete, rename, move) ──
  let actionId = $state<string | null>(null)
  let renameValue = $state('')
  let renamingId = $state<string | null>(null)
  let confirmDeleteId = $state<string | null>(null)
  let movingId = $state<string | null>(null)

  function toggleActions(id: string) {
    if (actionId === id) { actionId = null; renamingId = null; confirmDeleteId = null; movingId = null }
    else { actionId = id; renamingId = null; confirmDeleteId = null; movingId = null }
  }

  function startRename(entry: PoolEntry) {
    renameValue = entry.name
    renamingId = entry.id
  }

  async function commitRename() {
    if (!renamingId || !renameValue.trim()) return
    await poolRenameEntry(renamingId, renameValue.trim())
    renamingId = null
    actionId = null
  }

  function handleDelete(id: string) {
    if (confirmDeleteId === id) {
      void poolDeleteEntry(id)
      confirmDeleteId = null
      actionId = null
    } else {
      confirmDeleteId = id
    }
  }

  // ── Waveform mini canvas ──
  function waveformAction(canvas: HTMLCanvasElement, waveform: Float32Array) {
    function draw(wf: Float32Array) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(159,167,128,0.6)'
      const barW = w / wf.length
      for (let i = 0; i < wf.length; i++) {
        const barH = wf[i] * h
        ctx.fillRect(i * barW, (h - barH) / 2, Math.max(barW - 0.5, 0.5), barH || 1)
      }
    }
    draw(waveform)
    return { update(wf: Float32Array) { draw(wf) } }
  }

  function formatDuration(s: number): string {
    return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(1)}s`
  }

  // ── Init ──
</script>

<div class="pool-inline">
  <!-- Search -->
  <div class="pool-search">
    <input
      type="text"
      class="search-input"
      placeholder="Search..."
      bind:value={query}
    />
    {#if query}
      <button class="search-clear" onpointerdown={() => query = ''}>×</button>
    {/if}
  </div>

  <!-- Breadcrumbs + folders (hidden during search) -->
  <div class="pool-nav" class:hidden={isSearching}>
    {#if currentPath}
      <div class="pool-crumbs">
        <button class="crumb" onpointerdown={() => currentPath = ''}>ALL</button>
        {#each breadcrumbs as seg, i}
          <span class="crumb-sep">›</span>
          <button
            class="crumb"
            class:active={i === breadcrumbs.length - 1}
            onpointerdown={() => currentPath = breadcrumbs.slice(0, i + 1).join('/')}
          >{seg.toUpperCase()}</button>
        {/each}
      </div>
    {/if}
    <div class="pool-folders">
      {#if !currentPath}
        <button class="folder-btn active">ALL</button>
      {/if}
      {#each childFolders as folder}
        <button
          class="folder-btn"
          onpointerdown={() => currentPath = currentPath ? `${currentPath}/${folder}` : folder}
        >{folder.toUpperCase()}</button>
      {/each}
    </div>
  </div>

  <!-- Sample list (max-height with scroll) -->
  <div class="pool-list">
    {#if pool.loading}
      <div class="pool-msg">
        {#if pool.factoryProgress}
          Installing ({pool.factoryProgress.done}/{pool.factoryProgress.total})
        {:else}
          Loading...
        {/if}
      </div>
    {:else if sortedEntries.length === 0 && filteredPacks.length === 0}
      <div class="pool-msg">No samples</div>
    {:else}
      <!-- Factory packs (ADR 106) -->
      {#each filteredPacks as pack (pack.id)}
        <div
          class="pool-row pack-row"
          class:loading={loadingPack === pack.id}
          role="button"
          tabindex="0"
          ondblclick={() => void assignPack(pack)}
        >
          <span class="pack-icon">🎹</span>
          <button
            class="row-name"
            onpointerdown={() => void assignPack(pack)}
          >{pack.name}</button>
          <span class="pack-zones">{pack.zoneCount} zones</span>
        </div>
      {/each}
      {#each sortedEntries as entry (entry.id)}
        {@const isFactory = entry.folder.startsWith('factory')}
        <div
          class="pool-row"
          class:playing={auditioning === entry.id}
          role="button"
          tabindex="0"
          ondblclick={() => void assign(entry)}
        >
          <button
            class="row-play"
            onpointerdown={(e) => { e.stopPropagation(); auditioning === entry.id ? stopAudition() : void audition(entry) }}
          >{auditioning === entry.id ? '■' : '▸'}</button>
          <button
            class="row-name"
            onpointerdown={() => void assign(entry)}
          >{entry.name}</button>
          {#if isSearching}
            <span class="row-folder">{entry.folder.split('/').pop()}</span>
          {/if}
          <span class="row-dur">{formatDuration(entry.duration)}</span>
          <canvas
            class="row-wave"
            width="48"
            height="16"
            use:waveformAction={entry.waveform}
          ></canvas>
          {#if !isFactory}
            <button
              class="row-more"
              onpointerdown={(e) => { e.stopPropagation(); toggleActions(entry.id) }}
            >⋯</button>
          {/if}
        </div>
        {#if actionId === entry.id && !isFactory}
          <div class="row-actions">
            {#if renamingId === entry.id}
              <input
                class="rename-input"
                type="text"
                bind:value={renameValue}
                onkeydown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') { renamingId = null; actionId = null } }}
              />
              <button class="action-btn" onpointerdown={() => void commitRename()}>OK</button>
            {:else if movingId === entry.id}
              <span class="action-label">Move to:</span>
              {#each allFolders.filter(f => f !== entry.folder && !f.startsWith('factory')) as f}
                <button class="action-btn" onpointerdown={() => { void poolMoveEntry(entry.id, f); movingId = null; actionId = null }}>{f}</button>
              {/each}
              <button class="action-btn" onpointerdown={() => { movingId = null }}>Cancel</button>
            {:else}
              <button class="action-btn" onpointerdown={() => startRename(entry)}>Rename</button>
              <button class="action-btn" onpointerdown={() => { movingId = entry.id }}>Move</button>
              <button class="action-btn action-del" onpointerdown={() => handleDelete(entry.id)}>{confirmDeleteId === entry.id ? 'Confirm?' : 'Delete'}</button>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .pool-inline {
    border: 1px solid rgba(237,232,220,0.15);
    border-radius: 2px;
    margin-top: 4px;
  }

  /* ── Search ── */
  .pool-search {
    display: flex;
    align-items: center;
    padding: 4px 6px 0;
    gap: 2px;
  }
  .search-input {
    flex: 1;
    font-size: 10px;
    padding: 2px 6px;
    border: 1px solid rgba(237,232,220,0.15);
    border-radius: 2px;
    background: rgba(0,0,0,0.2);
    color: rgba(237,232,220,0.85);
    outline: none;
    font-family: inherit;
  }
  .search-input::placeholder {
    color: rgba(237,232,220,0.25);
  }
  .search-input:focus {
    border-color: rgba(237,232,220,0.35);
  }
  .search-clear {
    font-size: 12px;
    color: rgba(237,232,220,0.35);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 2px;
  }
  .search-clear:hover {
    color: rgba(237,232,220,0.7);
  }

  /* ── Nav ── */
  .pool-nav {
    padding: 4px 6px 2px;
  }
  .pool-crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-bottom: 3px;
  }
  .crumb {
    font-size: 9px;
    font-weight: 600;
    color: rgba(237,232,220,0.45);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 2px;
  }
  .crumb:hover { color: rgba(237,232,220,0.75); }
  .crumb.active { color: rgba(237,232,220,0.85); cursor: default; }
  .crumb-sep { font-size: 8px; color: rgba(237,232,220,0.25); }

  .pool-folders {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    row-gap: 2px;
  }
  .folder-btn {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.4);
    cursor: pointer;
  }
  .folder-btn:not(:last-child) { border-right: none; }
  .folder-btn:first-child { border-radius: 2px 0 0 2px; }
  .folder-btn:last-child { border-radius: 0 2px 2px 0; }
  .folder-btn.active {
    background: rgba(237,232,220,0.12);
    color: rgba(237,232,220,0.85);
  }

  /* ── List ── */
  .pool-list {
    max-height: 200px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 2px 2px;
  }
  .pool-msg {
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    padding: 10px 6px;
    text-align: center;
    font-style: italic;
  }
  .pool-row {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 4px;
    border-radius: 2px;
    cursor: pointer;
    color: rgba(237,232,220,0.65);
  }
  .pool-row:hover {
    background: rgba(237,232,220,0.06);
  }
  .pool-row.playing {
    color: var(--color-olive, #9fa780);
  }

  .row-play {
    font-size: 7px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    opacity: 0.5;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px;
  }
  .row-play:hover { opacity: 0.8; }
  .pool-row.playing .row-play { opacity: 1; }

  .row-name {
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }
  .row-name:hover {
    color: rgba(237,232,220,0.95);
  }

  .row-folder {
    font-size: 8px;
    color: rgba(237,232,220,0.25);
    flex-shrink: 0;
    padding: 0 3px;
    border: 1px solid rgba(237,232,220,0.1);
    border-radius: 2px;
  }
  .row-dur {
    font-size: 8px;
    color: rgba(237,232,220,0.3);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .row-more {
    font-size: 10px;
    color: rgba(237,232,220,0.2);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 60ms;
  }
  .pool-row:hover .row-more { opacity: 1; }
  .row-more:hover { color: rgba(237,232,220,0.6); }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 4px 20px;
    flex-wrap: wrap;
  }
  .action-label {
    font-size: 8px;
    color: rgba(237,232,220,0.35);
  }
  .action-btn {
    font-size: 8px;
    font-weight: 600;
    padding: 1px 6px;
    border: 1px solid rgba(237,232,220,0.15);
    border-radius: 2px;
    background: transparent;
    color: rgba(237,232,220,0.5);
    cursor: pointer;
  }
  .action-btn:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.8);
  }
  .action-del {
    color: rgba(232,80,80,0.6);
    border-color: rgba(232,80,80,0.2);
  }
  .action-del:hover {
    background: rgba(232,80,80,0.1);
    color: #e85050;
  }
  .rename-input {
    flex: 1;
    font-size: 9px;
    padding: 1px 4px;
    border: 1px solid rgba(237,232,220,0.25);
    border-radius: 2px;
    background: rgba(0,0,0,0.2);
    color: rgba(237,232,220,0.85);
    outline: none;
    font-family: inherit;
    min-width: 60px;
  }

  /* ── Pack rows (ADR 106) ── */
  .pack-row {
    border-bottom: 1px solid rgba(237,232,220,0.06);
  }
  .pack-row.loading {
    opacity: 0.5;
    pointer-events: none;
  }
  .pack-icon {
    font-size: 10px;
    flex-shrink: 0;
    width: 14px;
    text-align: center;
  }
  .pack-zones {
    font-size: 8px;
    color: rgba(237,232,220,0.3);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .hidden { display: none; }
  .row-wave {
    flex-shrink: 0;
    width: 48px;
    height: 16px;
  }
</style>
