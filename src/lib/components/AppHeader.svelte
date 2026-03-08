<script lang="ts">
  import { song, playback, ui, project, projectRename, toggleSidebar } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'
  import Oscilloscope from './Oscilloscope.svelte'

  import PerfButtons from './PerfButtons.svelte'

  interface Props {
    onPlay: () => void
    onStop: () => void
    compact?: boolean
  }
  let { onPlay, onStop, compact = false }: Props = $props()

  function handleHelp() {
    toggleSidebar('help')
  }

  function handleSystem() {
    toggleSidebar('system')
  }

  // ── Inline project name edit ──
  let editingName = $state(false)
  let editNameValue = $state('')
  let nameInputEl: HTMLInputElement | undefined = $state()

  function startNameEdit() {
    editNameValue = song.name || ''
    editingName = true
    requestAnimationFrame(() => nameInputEl?.select())
  }
  function commitNameEdit() {
    editingName = false
    const name = editNameValue.trim() || 'Untitled'
    void projectRename(name)
  }
  // ── Save indicator ──
  let showSaved = $state(false)
  let savedTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    const ts = project.lastSavedAt
    if (ts > 0 && !project.dirty) {
      showSaved = true
      if (savedTimer) clearTimeout(savedTimer)
      savedTimer = setTimeout(() => { showSaved = false }, 1500)
    }
  })

  function cancelNameEdit() { editingName = false }
  function onNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitNameEdit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelNameEdit() }
  }

  // ── Inline BPM edit ──
  let editingBpm = $state(false)
  let editBpmValue = $state('')
  let bpmInputEl: HTMLInputElement | undefined = $state()

  function startBpmEdit() {
    editBpmValue = String(song.bpm)
    editingBpm = true
    requestAnimationFrame(() => bpmInputEl?.select())
  }
  function commitBpmEdit() {
    editingBpm = false
    const v = Math.round(Number(editBpmValue))
    if (!isNaN(v) && v >= 40 && v <= 240) song.bpm = v
  }
  function cancelBpmEdit() { editingBpm = false }
  function onBpmKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitBpmEdit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelBpmEdit() }
  }

  // ── Long-press auto-repeat for BPM ±buttons ──
  let bpmRepeatTimer: ReturnType<typeof setTimeout> | null = null
  let bpmRepeatInterval: ReturnType<typeof setInterval> | null = null

  function bpmStep(dir: -1 | 1) {
    song.bpm = Math.max(40, Math.min(240, song.bpm + dir))
  }

  function startBpmRepeat(dir: -1 | 1) {
    bpmStep(dir)
    bpmRepeatTimer = setTimeout(() => {
      bpmRepeatInterval = setInterval(() => bpmStep(dir), 80)
    }, 400)
  }

  function stopBpmRepeat() {
    if (bpmRepeatTimer) { clearTimeout(bpmRepeatTimer); bpmRepeatTimer = null }
    if (bpmRepeatInterval) { clearInterval(bpmRepeatInterval); bpmRepeatInterval = null }
  }

</script>

<div class="header-wrap" class:compact>
  <!-- Top bar: logo + oscilloscope background -->
  <header class="app-header">
    <Oscilloscope />
    <svg class="app-logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" fill="#a3a145"/>
      <rect x="14" y="4" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="4" y="14" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="14" y="14" width="8" height="8" fill="#a3a145"/>
      <rect x="24" y="4" width="4" height="18" rx="1" fill="#ede8dc" opacity="0.4"/>
    </svg>
    <span class="app-name">INBOIL</span>
    {#if compact}
      <button
        class="btn-help-mobile"
        class:active={ui.sidebar === 'help'}
        onpointerdown={() => toggleSidebar('help')}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
    {/if}
    {#if !compact}
      <button
        class="btn-help-desktop"
        class:active={ui.sidebar === 'help'}
        onpointerdown={handleHelp}
        aria-label="Help"
        data-tip="Show help" data-tip-ja="ヘルプを表示"
      >?</button>
    {/if}
    <button
      class="btn-system"
      class:active={ui.sidebar === 'system'}
      onpointerdown={handleSystem}
      aria-label="System settings"
      data-tip="System settings" data-tip-ja="システム設定"
    >&#x2699;</button>
  </header>

  <!-- Sub header: BPM, transport, perf controls, pattern -->
  <div class="sub-header">
    <div class="bpm-block">
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(-1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Decrease tempo (hold to scroll)" data-tip-ja="テンポを下げる (長押しでスクロール)">−</button>
      {#if editingBpm}
        <input
          bind:this={bpmInputEl}
          class="bpm-input"
          type="text"
          inputmode="numeric"
          maxlength="3"
          bind:value={editBpmValue}
          onblur={commitBpmEdit}
          onkeydown={onBpmKeydown}
        />
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="bpm-value" onclick={startBpmEdit} data-tip="Click to edit tempo" data-tip-ja="クリックでテンポを変更"><SplitFlap value={song.bpm} /></span>
      {/if}
      <button class="bpm-adj" onpointerdown={() => startBpmRepeat(1)} onpointerup={stopBpmRepeat} onpointerleave={stopBpmRepeat} data-tip="Increase tempo (hold to scroll)" data-tip-ja="テンポを上げる (長押しでスクロール)">+</button>
      <span class="bpm-label">BPM</span>
    </div>

    <div class="transport">
      <button
        class="btn-transport"
        class:active={playback.playing}
        onpointerdown={onPlay}
        aria-label="Play"
        data-tip="Play pattern" data-tip-ja="パターンを再生"
      >▶</button>
      <button
        class="btn-transport"
        onpointerdown={onStop}
        aria-label="Stop"
        data-tip="Stop playback" data-tip-ja="再生を停止"
      >■</button>
    </div>

    <div class="sep" aria-hidden="true"></div>

    <!-- View toggle: FX / EQ / MST -->
    <div class="view-toggle">
      <button
        class="btn-view"
        class:active={ui.phraseView === 'fx'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'fx' ? 'pattern' : 'fx'; ui.patternSheet = false }}
        data-tip="FX pad — drag nodes to control effects" data-tip-ja="FXパッド — ノードをドラッグしてエフェクト操作"
      >FX</button>
      <button
        class="btn-view"
        class:active={ui.phraseView === 'eq'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'eq' ? 'pattern' : 'eq'; ui.patternSheet = false }}
        data-tip="EQ / Filter view" data-tip-ja="EQ / フィルター画面"
      >EQ</button>
      <button
        class="btn-view"
        class:active={ui.phraseView === 'master'}
        onpointerdown={() => { ui.phraseView = ui.phraseView === 'master' ? 'pattern' : 'master'; ui.patternSheet = false }}
        data-tip="Master bus — compressor, ducker, FX returns" data-tip-ja="マスターバス — コンプ、ダッカー、FXリターン"
      >MST</button>
    </div>

    <div class="sep" aria-hidden="true"></div>

    <!-- Performance buttons (momentary press-hold) -->
    <div class="perf-btns">
      <PerfButtons variant="bar" />
    </div>

    <div class="proj-block">
      <div class="proj-display">
        {#if editingName}
          <input
            bind:this={nameInputEl}
            class="proj-name-input"
            type="text"
            maxlength="20"
            bind:value={editNameValue}
            onblur={commitNameEdit}
            onkeydown={onNameKeydown}
          />
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="proj-name" onclick={startNameEdit} data-tip="Click to rename project" data-tip-ja="クリックでプロジェクト名を変更">
            <SplitFlap value={song.name} width={10} />
            {#if project.dirty}
              <span class="save-dot dirty">●</span>
            {:else if showSaved}
              <span class="save-dot saved">✓</span>
            {/if}
          </span>
        {/if}
      </div>
    </div>
  </div>


</div>

<style>
  .header-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  /* ── Top bar (logo + oscilloscope) ── */
  .app-header {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 12px 0 12px;
    background: var(--color-fg);
    color: var(--color-bg);
    overflow: hidden;
  }
  .compact .app-header { height: 32px; }

  .app-logo {
    width: 18px;
    height: 18px;
    margin-right: 5px;
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }
  .compact .app-logo { width: 14px; height: 14px; margin-right: 4px; }

  .app-name {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
  }

  .btn-help-mobile {
    position: absolute;
    right: 42px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 13px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-help-mobile:active,
  .btn-help-mobile.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  .btn-help-desktop {
    position: absolute;
    right: 42px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 13px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-help-desktop:active,
  .btn-help-desktop.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  .btn-system {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 14px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-system:active,
  .btn-system.active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  /* ── Sub header (controls) ── */
  .sub-header {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 64px;
    padding: 0 12px 0 8px;
    background: var(--color-fg);
    color: var(--color-bg);
    border-top: 1px solid rgba(237,232,220,0.06);
  }
  .compact .sub-header { height: 52px; gap: 10px; }

  /* ── BPM ── */
  .bpm-block {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bpm-value {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: var(--color-bg);
    cursor: text;
  }
  .compact .bpm-value { font-size: 18px; }

  .bpm-adj {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.6);
    width: 24px;
    height: 24px;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .bpm-adj:active { background: rgba(237,232,220,0.15); }

  .bpm-input {
    font-family: var(--font-display);
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.9);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(237,232,220,0.25);
    border-radius: 2px;
    padding: 0 4px;
    width: 3.5ch;
    outline: none;
    text-align: center;
  }
  .compact .bpm-input { font-size: 18px; }

  .bpm-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.35);
    text-transform: uppercase;
  }

  /* ── Transport ── */
  .transport {
    display: flex;
    gap: 4px;
  }

  .btn-transport {
    border: 1px solid rgba(237,232,220,0.45);
    background: transparent;
    color: var(--color-bg);
    padding: 4px 10px;
    font-size: 11px;
    transition: background 60ms linear, color 60ms linear;
  }
  .btn-transport:active,
  .btn-transport.active {
    background: var(--color-bg);
    color: var(--color-fg);
  }

  /* ── Separator ── */
  .sep {
    width: 1px;
    height: 28px;
    background: rgba(237,232,220,0.12);
    flex-shrink: 0;
  }

  /* ── View toggle ── */
  .view-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-view {
    border: 1.5px solid rgba(237,232,220,0.35);
    background: rgba(237,232,220,0.04);
    color: rgba(237,232,220,0.55);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear, border-color 40ms linear;
    user-select: none;
  }
  .btn-view:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }
  .btn-view.active {
    background: rgba(237,232,220,0.14);
    color: rgba(237,232,220,0.90);
    border-color: rgba(237,232,220,0.50);
  }

  /* ── Performance buttons ── */
  .perf-btns {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* ── Pattern block ── */
  .proj-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
  }
  .proj-display {
    display: flex;
    align-items: center;
  }
  .proj-name {
    font-size: 24px;
    line-height: 1;
    color: rgba(237,232,220,0.5);
    transform: translateY(2px);
    cursor: text;
    position: relative;
  }
  .proj-name:hover { color: rgba(237,232,220,0.7); }
  .compact .proj-name { font-size: 18px; }
  .save-dot {
    position: absolute;
    top: -2px;
    right: -10px;
    font-size: 8px;
    line-height: 1;
  }
  .save-dot.dirty {
    color: var(--color-olive);
  }
  .save-dot.saved {
    color: rgba(237,232,220,0.4);
    animation: save-fade 1.5s ease-out forwards;
  }
  @keyframes save-fade {
    0% { opacity: 1; }
    60% { opacity: 1; }
    100% { opacity: 0; }
  }
  .proj-name-input {
    font-family: var(--font-data);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.9);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(237,232,220,0.25);
    border-radius: 2px;
    padding: 2px 6px;
    width: 140px;
    outline: none;
    text-transform: uppercase;
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .sub-header,
    .compact .sub-header {
      height: auto;
      padding: 0;
      gap: 0;
      flex-wrap: wrap;
    }

    /* Row 1: BPM + transport + knobs + pat */
    .bpm-block {
      padding: 4px 0 4px 8px;
    }
    .bpm-value { font-size: 14px; }
    .bpm-input { font-size: 14px; }
    .bpm-adj { width: 20px; height: 20px; font-size: 12px; }
    .bpm-label { display: none; }

    .sep { display: none; }

    /* Hide perf-btns on mobile (moved to PerfBubble) */
    .perf-btns { display: none; }

    /* Mobile transport */
    .transport {
      display: flex;
      gap: 3px;
      order: 10;
      align-items: center;
      margin-left: 10px;
    }
    .btn-transport {
      border: 1px solid rgba(237,232,220,0.45);
      background: transparent;
      color: var(--color-bg);
      padding: 0 12px;
      height: 28px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-transport:active,
    .btn-transport.active {
      background: var(--color-bg);
      color: var(--color-fg);
    }

    /* BPM + pat side by side */
    .proj-block {
      margin-left: auto;
      align-items: flex-end;
      gap: 2px;
      padding-right: 8px;
    }
    .proj-name { font-size: 14px; }

    /* Row 2: full-width tab bar */
    .view-toggle {
      order: 20;
      width: 100%;
      display: flex;
      gap: 0;
      border-top: 1px solid rgba(237,232,220,0.12);
    }
    .btn-view {
      flex: 1;
      padding: 6px 0;
      font-size: 9px;
      text-align: center;
      border: none;
      border-bottom: 2px solid transparent;
      color: rgba(237,232,220,0.35);
    }
    .btn-view:not(:last-child) { border-right: 1px solid rgba(237,232,220,0.08); }
    .btn-view.active {
      color: rgba(237,232,220,0.90);
      border-bottom-color: var(--color-olive);
      background: rgba(237,232,220,0.06);
    }
  }
</style>
