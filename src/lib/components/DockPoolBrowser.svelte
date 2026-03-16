<script lang="ts">
  /**
   * Audio Pool browser — browse, audition, and assign samples from the
   * OPFS-based persistent sample library (ADR 104).
   */
  import { lang, ui, pool, refreshPool, poolImportFiles, poolDeleteEntry, poolAssignToTrack } from '../state.svelte.ts'
  import type { PoolEntry } from '../audioPool.ts'
  import { showToast } from '../toast.svelte.ts'

  const L = $derived(lang.value)

  // ── Folder filter ──
  let selectedFolder = $state<string | null>(null)  // null = ALL
  const filteredEntries = $derived(
    selectedFolder
      ? pool.entries.filter(e => e.folder === selectedFolder)
      : pool.entries
  )
  const sortedEntries = $derived(
    [...filteredEntries].sort((a, b) => a.name.localeCompare(b.name))
  )

  // ── Selection ──
  let selectedId = $state<string | null>(null)
  const selectedEntry = $derived(selectedId ? pool.entries.find(e => e.id === selectedId) ?? null : null)

  // ── Audition ──
  let auditioning = $state<string | null>(null)
  let auditCtx: AudioContext | null = null
  let auditSource: AudioBufferSourceNode | null = null

  async function audition(entry: PoolEntry) {
    // Stop any current audition
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

  // ── Assign to track ──
  async function assignToTrack() {
    if (!selectedEntry) return
    await poolAssignToTrack(selectedEntry, ui.selectedTrack)
    showToast(L === 'ja'
      ? `${selectedEntry.name} をトラックに割り当て`
      : `${selectedEntry.name} assigned to track`, 'info')
  }

  // ── File import ──
  let fileInput: HTMLInputElement
  let dragOver = $state(false)

  function handleFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter(f =>
      f.type.startsWith('audio/') || /\.(wav|mp3|ogg|webm|flac|aiff?)$/i.test(f.name)
    )
    if (audioFiles.length === 0) {
      showToast(L === 'ja' ? '対応するオーディオファイルがありません' : 'No supported audio files', 'warn')
      return
    }
    void poolImportFiles(audioFiles, selectedFolder ?? 'unsorted')
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragOver = false
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    dragOver = true
  }

  // ── Delete ──
  let confirmDeleteId = $state<string | null>(null)

  function handleDelete(id: string) {
    if (confirmDeleteId === id) {
      void poolDeleteEntry(id)
      confirmDeleteId = null
      if (selectedId === id) selectedId = null
    } else {
      confirmDeleteId = id
    }
  }

  // ── Format helpers ──
  function formatDuration(s: number): string {
    return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(1)}s`
  }
  function formatSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)}KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
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

  // ── Init ──
  $effect(() => {
    if (pool.entries.length === 0 && !pool.loading) void refreshPool()
  })
</script>

<div
  class="pool-browser"
  class:drag-over={dragOver}
  role="region"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={() => dragOver = false}
>
  <!-- Header -->
  <div class="pool-header">
    <span class="pool-title">POOL</span>
    <button class="pool-add-btn" onpointerdown={() => fileInput.click()}>+ ADD</button>
    <input
      bind:this={fileInput}
      type="file"
      accept="audio/*"
      multiple
      style="display:none"
      onchange={(e) => {
        const target = e.target as HTMLInputElement
        if (target.files) handleFiles(target.files)
        target.value = ''
      }}
    />
  </div>

  <!-- Folder tabs -->
  <div class="pool-folders">
    <button
      class="pool-folder-btn"
      class:active={selectedFolder === null}
      onpointerdown={() => selectedFolder = null}
    >ALL</button>
    {#each pool.folders as folder}
      <button
        class="pool-folder-btn"
        class:active={selectedFolder === folder}
        onpointerdown={() => selectedFolder = folder}
      >{folder.toUpperCase().slice(0, 6)}</button>
    {/each}
  </div>

  <!-- Sample list -->
  <div class="pool-list">
    {#if pool.loading}
      <div class="pool-empty">{L === 'ja' ? '読み込み中...' : 'Loading...'}</div>
    {:else if sortedEntries.length === 0}
      <div class="pool-empty">
        {L === 'ja'
          ? 'サンプルをドラッグ&ドロップまたは + ADD で追加'
          : 'Drag & drop samples or tap + ADD'}
      </div>
    {:else}
      {#each sortedEntries as entry (entry.id)}
        <div
          class="pool-row"
          class:selected={selectedId === entry.id}
          class:playing={auditioning === entry.id}
          role="button"
          tabindex="0"
          onpointerdown={() => { selectedId = entry.id; void audition(entry) }}
        >
          <span class="pool-row-play">{auditioning === entry.id ? '■' : '▸'}</span>
          <span class="pool-row-name">{entry.name}</span>
          <span class="pool-row-dur">{formatDuration(entry.duration)}</span>
          <canvas
            class="pool-row-wave"
            width="64"
            height="20"
            use:waveformAction={entry.waveform}
          ></canvas>
          <button
            class="pool-row-del"
            class:confirm={confirmDeleteId === entry.id}
            onpointerdown={(e) => { e.stopPropagation(); handleDelete(entry.id) }}
          >{confirmDeleteId === entry.id ? '✕' : '×'}</button>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer: assign + stats -->
  <div class="pool-footer">
    <button
      class="pool-assign-btn"
      disabled={!selectedEntry}
      onpointerdown={assignToTrack}
    >{L === 'ja' ? 'トラックに割り当て' : 'LOAD TO TRACK'}</button>
    <div class="pool-stats">
      {pool.stats.count} sample{pool.stats.count !== 1 ? 's' : ''} ({formatSize(pool.stats.totalSize)})
      {#if pool.stats.warning}
        <span class="pool-warn">⚠ {(pool.stats.usageRatio * 100).toFixed(0)}%</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .pool-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 4px 0;
    transition: background 120ms;
  }
  .pool-browser.drag-over {
    background: rgba(159,167,128,0.08);
  }

  /* ── Header ── */
  .pool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 6px;
  }
  .pool-title {
    font-size: var(--dk-fs-md, 11px);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.85);
  }
  .pool-add-btn {
    margin-left: auto;
    font-size: var(--dk-fs-xs, 9px);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    cursor: pointer;
    border-radius: 2px;
  }
  .pool-add-btn:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.8);
  }

  /* ── Folder tabs ── */
  .pool-folders {
    display: flex;
    gap: 0;
    padding: 0 10px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pool-folders::-webkit-scrollbar { display: none; }
  .pool-folder-btn {
    font-size: var(--dk-fs-xs, 9px);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.4);
    cursor: pointer;
  }
  .pool-folder-btn:not(:last-child) {
    border-right: none;
  }
  .pool-folder-btn:first-child { border-radius: 2px 0 0 2px; }
  .pool-folder-btn:last-child { border-radius: 0 2px 2px 0; }
  .pool-folder-btn.active {
    background: rgba(237,232,220,0.12);
    color: rgba(237,232,220,0.85);
  }

  /* ── Sample list ── */
  .pool-list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 4px;
  }
  .pool-empty {
    font-size: var(--dk-fs-sm, 10px);
    color: rgba(237,232,220,0.35);
    padding: 20px 10px;
    text-align: center;
    font-style: italic;
  }
  .pool-row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.65);
    cursor: pointer;
    border-radius: 2px;
    text-align: left;
  }
  .pool-row:hover {
    background: rgba(237,232,220,0.06);
  }
  .pool-row.selected {
    background: rgba(237,232,220,0.1);
    color: rgba(237,232,220,0.9);
  }
  .pool-row.playing {
    color: var(--color-olive, #9fa780);
  }
  .pool-row-play {
    font-size: 8px;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
    opacity: 0.5;
  }
  .pool-row.playing .pool-row-play {
    opacity: 1;
  }
  .pool-row-name {
    font-size: var(--dk-fs-sm, 10px);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }
  .pool-row-dur {
    font-size: var(--dk-fs-xs, 9px);
    color: rgba(237,232,220,0.35);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .pool-row-wave {
    flex-shrink: 0;
    width: 64px;
    height: 20px;
  }
  .pool-row-del {
    font-size: 10px;
    color: rgba(237,232,220,0.25);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 60ms;
  }
  .pool-row:hover .pool-row-del {
    opacity: 1;
  }
  .pool-row-del:hover {
    color: rgba(237,232,220,0.6);
  }
  .pool-row-del.confirm {
    color: #e85050;
    opacity: 1;
  }

  /* ── Footer ── */
  .pool-footer {
    padding: 6px 10px 4px;
    border-top: 1px solid rgba(237,232,220,0.1);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pool-assign-btn {
    font-size: var(--dk-fs-sm, 10px);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 0;
    border: 1px solid var(--color-olive, #9fa780);
    background: transparent;
    color: var(--color-olive, #9fa780);
    cursor: pointer;
    border-radius: 2px;
    width: 100%;
    text-align: center;
  }
  .pool-assign-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .pool-assign-btn:not(:disabled):hover {
    background: rgba(159,167,128,0.12);
  }
  .pool-stats {
    font-size: var(--dk-fs-xs, 9px);
    color: rgba(237,232,220,0.3);
    text-align: center;
  }
  .pool-warn {
    color: #e8a050;
    font-weight: 700;
  }
</style>
