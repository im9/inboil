<script lang="ts">
  import { onMount } from 'svelte'
  import { ui, lang, prefs, project, toggleLang, toggleScaleMode, togglePatternEditor, toggleShowGuide, factoryReset, projectNew, projectSaveAs, projectLoad, projectDelete, projectLoadFactory, listProjects, type StoredProject } from '../state.svelte.ts'

  const mode = $derived(ui.sidebar)
  const L = $derived(lang.value)

  // ── Open/close animation ──
  let closing = $state(false)
  let visibleMode = $state<'help' | 'system' | null>(null)
  let collapsed = $state(false)

  $effect(() => {
    if (mode) {
      closing = false
      visibleMode = mode
      collapsed = false
    } else if (visibleMode) {
      closing = true
    }
  })

  function onAnimEnd() {
    if (closing) {
      closing = false
      visibleMode = null
    }
  }

  let confirmReset = $state(false)

  function handleReset() {
    factoryReset()
    confirmReset = false
  }

  // ── Project management ──
  let projectList = $state<Pick<StoredProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>[]>([])
  let savingAs = $state(false)
  let saveAsName = $state('')
  let saveAsInput: HTMLInputElement | undefined = $state()
  let confirmDeleteId = $state<string | null>(null)

  async function refreshProjects() { projectList = await listProjects() }

  $effect(() => {
    if (visibleMode === 'system') void refreshProjects()
  })

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

  // ── Search filter ──
  let searchQuery = $state('')
  const filteredIndices = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    const results: number[] = []
    for (let i = 0; i < helpSections.length; i++) {
      const s = helpSections[i]
      if (s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)) {
        results.push(i)
      }
    }
    return results
  })

  // ── Hover guide ──
  let guideText = $state('')

  onMount(() => {
    function onOver(e: Event) {
      const el = (e.target as Element)?.closest?.('[data-tip]')
      if (!el) { guideText = ''; return }
      const tip = L === 'ja'
        ? (el.getAttribute('data-tip-ja') || el.getAttribute('data-tip'))
        : el.getAttribute('data-tip')
      guideText = tip || ''
    }
    document.addEventListener('mouseover', onOver)
    return () => document.removeEventListener('mouseover', onOver)
  })

  type HelpCategory = { label: string; labelEn: string }
  const categories: HelpCategory[] = [
    { label: 'はじめに', labelEn: 'GETTING STARTED' },
    { label: 'シーケンサー', labelEn: 'SEQUENCER' },
    { label: 'サウンド', labelEn: 'SOUND' },
    { label: 'ミキサー & エフェクト', labelEn: 'MIXER & FX' },
    { label: 'アレンジ', labelEn: 'ARRANGEMENT' },
    { label: 'パフォーマンス', labelEn: 'PERFORMANCE' },
  ]

  const helpSections = $derived([
    // ── 0: GETTING STARTED ──
    {
      category: 0,
      title: L === 'ja' ? 'クイックスタート' : 'QUICK START',
      body: L === 'ja'
        ? '▶ (SPACE) で再生 → ステップをタップ → ドックのノブで音作り\nRAND でランダム生成、Ctrl+Z で戻す'
        : '▶ (SPACE) to play → tap steps → turn dock knobs\nRAND to randomize, Ctrl+Z to undo',
    },
    {
      category: 0,
      title: L === 'ja' ? 'プロジェクト' : 'PROJECTS',
      body: L === 'ja'
        ? '自動保存 — 編集するたびに即時保存\nSYSTEM → NEW / SAVE AS で管理\nプロジェクト一覧からタップで切替、長押しで削除'
        : 'Auto-saved on every edit\nSYSTEM → NEW / SAVE AS to manage\nTap to switch, long-press to delete',
    },
    {
      category: 0,
      title: L === 'ja' ? 'ショートカット' : 'SHORTCUTS',
      body: 'Space — Play/Stop\nCtrl+Z / Ctrl+Shift+Z — Undo / Redo\nEscape — Close / Deselect\nDelete — Remove node/edge\nCtrl+C / V — Copy / Paste',
    },
    // ── 1: SEQUENCER ──
    {
      category: 1,
      title: L === 'ja' ? 'ステップシーケンサー' : 'STEP SEQUENCER',
      body: L === 'ja'
        ? 'SYSTEM → GRID で選択。タップでON/OFF、ドラッグで連続入力\nメロディトラックはピアノロール付き'
        : 'SYSTEM → GRID. Tap to toggle, drag to paint\nMelodic tracks show piano roll',
    },
    {
      category: 1,
      title: L === 'ja' ? 'トラッカー' : 'TRACKER',
      body: L === 'ja'
        ? 'SYSTEM → TRKR で選択。NOTE/VEL/DUR/SLD/CHN を直接編集\n矢印キーでナビゲーション'
        : 'SYSTEM → TRKR. Edit NOTE/VEL/DUR/SLD/CHN directly\nArrow keys to navigate',
    },
    {
      category: 1,
      title: L === 'ja' ? 'ベロシティ & 確率' : 'VELOCITY & CHANCE',
      body: L === 'ja'
        ? 'トラック下部のバーを3モードで切替:\nSTEP — トリガー ON/OFF\nVEL — 各ステップの音量 (上下ドラッグ)\nCHNC — 発音確率 0–100%\nステップ数: 数字タップで 2–64'
        : 'Switch 3 modes in the bar below each track:\nSTEP — toggle triggers\nVEL — per-step volume (drag up/down)\nCHNC — trigger probability 0–100%\nStep count: tap number for 2–64',
    },
    {
      category: 1,
      title: L === 'ja' ? 'ピアノロール' : 'PIANO ROLL',
      body: L === 'ja'
        ? 'メロディトラックで自動表示。タップでノート配置\nSLD — なめらかに音程を繋ぐ\nPoly音色 — 同じステップに複数ノートでコード\nスケールモードで音階制限'
        : 'Auto-shown for melodic tracks. Tap to place notes\nSLD — smooth pitch glide between notes\nPoly voices — tap multiple notes on same step for chords\nScale mode restricts to key notes',
    },
    {
      category: 1,
      title: L === 'ja' ? 'パターン' : 'PATTERNS',
      body: L === 'ja'
        ? 'PAT ◀▶ で切替 (00–19 は内蔵デモ)\nCPY コピー / PST ペースト / CLR クリア\n名前クリックでリネーム、カラードットで色設定'
        : 'PAT ◀▶ to switch (00–19 are built-in demos)\nCPY copy / PST paste / CLR clear\nClick name to rename, dot to set color',
    },
    // ── 2: SOUND ──
    {
      category: 2,
      title: L === 'ja' ? 'トラック & 楽器' : 'TRACKS & VOICES',
      body: L === 'ja'
        ? '最大16トラック (+で追加、REMOVEで削除)\nドックの DRUM/BASS/LEAD/SMPL から楽器変更\nM ミュート、S ソロ (複数可)'
        : 'Up to 16 tracks (+ to add, REMOVE to delete)\nDock tabs: DRUM/BASS/LEAD/SMPL\nM mute, S solo (additive)',
    },
    {
      category: 2,
      title: L === 'ja' ? 'プリセット & ステップ固有設定' : 'PRESETS & PER-STEP LOCK',
      body: L === 'ja'
        ? 'PRESETS — 内蔵の音色プリセットを選択\nLOCK ON → ステップ選択 → ノブ操作\nそのステップだけ音色が変わる。CLR で解除'
        : 'PRESETS — browse built-in sound presets\nLOCK ON → select step → turn knobs\nSound changes apply to that step only. CLR to clear',
    },
    {
      category: 2,
      title: L === 'ja' ? 'サンプラー' : 'SAMPLER',
      body: L === 'ja'
        ? 'LOAD ボタンまたはファイルをドラッグで読み込み\n開始/終了/ピッチ/減衰/逆再生を調整\nCHOP — サンプルを分割して再生\nBPM同期 — テンポに合わせて自動伸縮'
        : 'LOAD button or drag file to import audio\nAdjust start/end/pitch/decay/reverse\nCHOP — slice sample into segments\nBPM sync — auto-stretch to match tempo',
    },
    // ── 3: MIXER & FX ──
    {
      category: 3,
      title: L === 'ja' ? 'FX パッド' : 'FX PAD',
      body: L === 'ja'
        ? 'リバーブ/ディレイ/グリッチ/グラニュラーの4エフェクト\nノードをドラッグで調整、タップでON/OFF\nセンドバーで各トラックの送り量を設定'
        : '4 effects: reverb / delay / glitch / granular\nDrag nodes to adjust, tap to toggle\nSend bar sets per-track levels',
    },
    {
      category: 3,
      title: 'EQ',
      body: L === 'ja'
        ? 'LOW/MID/HIGH + フィルター (左LP / 右HP)\nノードをドラッグ、タップでON/OFF'
        : 'LOW/MID/HIGH + filter (left LP / right HP)\nDrag nodes, tap to toggle',
    },
    {
      category: 3,
      title: L === 'ja' ? 'マスター' : 'MASTER',
      body: L === 'ja'
        ? 'XYパッド: コンプ / サイドチェイン / FXリターン\nフェーダー: 音量 / メイクアップ / スウィング\nVUメーターでL/Rピーク確認'
        : 'XY pads: compressor / sidechain / FX return\nFaders: volume / makeup / swing\nVU meter for L/R peaks',
    },
    // ── 4: ARRANGEMENT ──
    {
      category: 4,
      title: L === 'ja' ? 'マトリクス' : 'MATRIX',
      body: L === 'ja'
        ? '左のパターンプール。タップで選択、ダブルタップでシート表示\nセルの明るさ = 密度、色 = パターンカラー'
        : 'Pattern pool on the left. Tap to select, double-tap to open\nBrightness = density, tint = pattern color',
    },
    {
      category: 4,
      title: L === 'ja' ? 'シーンビュー' : 'SCENE VIEW',
      body: L === 'ja'
        ? 'ノードグラフで曲構成。エッジで再生順を定義\nルートから開始、分岐ランダム、末端で停止\nノード: Pattern / Transpose / Tempo / Repeat / Prob / FX / Automation\nデコレーター: パターン付近にドラッグでアタッチ\nドック: ナビゲーター + デコレーター編集'
        : 'Node graph for arrangement. Edges define playback order\nStarts at root, random at forks, stops at terminals\nNodes: Pattern / Transpose / Tempo / Repeat / Prob / FX / Automation\nDecorators: drag near pattern to attach\nDock: navigator + decorator editing',
    },
    // ── 5: PERFORMANCE ──
    {
      category: 5,
      title: 'FILL / REV / BRK',
      body: L === 'ja'
        ? 'ボタン長押しでリアルタイム効果:\nFILL — ドラムの自動フィルイン\nREV — 逆再生\nBRK — リズムでブレイク\n離すと即復帰'
        : 'Hold buttons for real-time effects:\nFILL — auto drum fill\nREV — reverse playback\nBRK — rhythmic break\nRelease to restore',
    },
    {
      category: 5,
      title: L === 'ja' ? 'KEY / スケール' : 'KEY / SCALE',
      body: L === 'ja'
        ? 'チャーチモード: C Ionian, D Dorian, E Phrygian, F Lydian, G Mixolydian, A Aeolian, B Locrian\nスケールモード ON で音階制限'
        : 'Church modes: C Ion, D Dor, E Phr, F Lyd, G Mix, A Aeo, B Loc\nScale mode ON restricts to mode notes',
    },
    {
      category: 5,
      title: L === 'ja' ? 'キーボード演奏' : 'KEYBOARD PLAY',
      body: L === 'ja'
        ? 'VKBD ボタンで有効化。PCキーボードで演奏\nA~; で音階、Z/X でオクターブ、1~0 でベロシティ'
        : 'Enable with VKBD button. Play with PC keyboard\nA–; for notes, Z/X octave, 1–0 velocity',
    },
  ])
</script>

{#if visibleMode}
  <div class="sidebar" class:closing class:collapsed onanimationend={onAnimEnd}>
    <div class="sidebar-head">
      {#if visibleMode === 'help'}
        <button class="btn-collapse" onpointerdown={() => { collapsed = !collapsed }}>
          {collapsed ? '▴' : '▾'}
        </button>
      {/if}
      <span class="sidebar-title">{collapsed ? 'GUIDE' : visibleMode === 'help' ? 'HELP' : 'SYSTEM'}</span>
      {#if !collapsed}
        <div class="sidebar-head-right">
          {#if visibleMode === 'help'}
            <button class="btn-lang" onpointerdown={toggleLang}>
              {L === 'ja' ? 'EN' : 'JP'}
            </button>
          {/if}
          <button class="btn-close" onpointerdown={() => { ui.sidebar = null }}>&times;</button>
        </div>
      {/if}
    </div>

    {#if !collapsed}
      <div class="sidebar-body">
        {#if visibleMode === 'help'}
          <div class="search-bar">
            <input
              class="search-input"
              type="text"
              placeholder={L === 'ja' ? '検索...' : 'Search...'}
              bind:value={searchQuery}
            />
            {#if searchQuery}
              <button class="search-clear" onpointerdown={() => { searchQuery = '' }}>&times;</button>
            {/if}
          </div>
          {#each categories as cat, ci}
            {@const catSections = helpSections
              .map((s, i) => ({ ...s, idx: i }))
              .filter(s => s.category === ci && (!filteredIndices || filteredIndices.includes(s.idx)))}
            {#if catSections.length > 0}
              <div class="category-label">{L === 'ja' ? cat.label : cat.labelEn}</div>
              {#each catSections as section}
                <div class="help-section">
                  <div class="section-title">{section.title}</div>
                  <div class="section-body">{section.body}</div>
                </div>
              {/each}
            {/if}
          {/each}
        {:else}
          <!-- Project management -->
          <div class="setting-group proj-section">
            <span class="setting-label">PROJECT</span>
            <div class="proj-actions">
              <button class="btn-proj" onpointerdown={handleNew}
                data-tip="New project" data-tip-ja="新規プロジェクト">NEW</button>
              <button class="btn-proj" onpointerdown={handleSaveAs}
                data-tip="Save as new project" data-tip-ja="別名で保存">SAVE AS</button>
            </div>
            {#if confirmNew}
              <div class="proj-confirm">
                <span class="proj-confirm-text">{L === 'ja' ? '未保存の変更があります。破棄しますか？' : 'Discard unsaved changes?'}</span>
                <div class="proj-confirm-actions">
                  <button class="btn-proj danger" onpointerdown={doNew}>{L === 'ja' ? '破棄' : 'DISCARD'}</button>
                  <button class="btn-proj" onpointerdown={() => { confirmNew = false }}>{L === 'ja' ? 'キャンセル' : 'CANCEL'}</button>
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
                <button class="btn-proj" onpointerdown={() => void commitSaveAs()}>OK</button>
              </div>
            {/if}
            <div class="proj-list">
              <div class="proj-list-label">{L === 'ja' ? 'サンプル' : 'EXAMPLES'}</div>
              <div class="proj-item">
                <button class="proj-item-name factory" onpointerdown={projectLoadFactory}>
                  {L === 'ja' ? 'Factory Demo' : 'Factory Demo'}
                </button>
                <span class="proj-item-date">built-in</span>
              </div>
            </div>
            {#if projectList.length > 0}
              <div class="proj-list">
                <div class="proj-list-label">{L === 'ja' ? 'プロジェクト' : 'PROJECTS'}</div>
                {#each projectList as p}
                  <div class="proj-item" class:current={p.id === project.id}>
                    <button class="proj-item-name" onpointerdown={() => void handleLoad(p.id)}>
                      {p.name}
                    </button>
                    <span class="proj-item-date">{new Date(p.updatedAt).toLocaleDateString()}</span>
                    {#if confirmDeleteId === p.id}
                      <button class="proj-item-del confirm" onpointerdown={() => void handleDelete(p.id)}>
                        {L === 'ja' ? '削除' : 'DEL'}
                      </button>
                      <button class="proj-item-del" onpointerdown={() => { confirmDeleteId = null }}>
                        ✕
                      </button>
                    {:else}
                      <button class="proj-item-del" onpointerdown={() => { confirmDeleteId = p.id }}>
                        🗑
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="setting-group">
            <span class="setting-label">{L === 'ja' ? 'スケールモード' : 'SCALE MODE'}</span>
            <button
              class="btn-toggle"
              class:on={prefs.scaleMode}
              onpointerdown={toggleScaleMode}
            >
              {prefs.scaleMode ? 'ON' : 'OFF'}
            </button>
            <p class="setting-desc">{L === 'ja'
              ? 'ON の場合、ピアノロールでスケール外のノートが無効になります。'
              : 'When ON, out-of-scale notes are disabled in the piano roll.'}</p>
          </div>

          <div class="setting-group">
            <span class="setting-label">{L === 'ja' ? 'エディター' : 'EDITOR'}</span>
            <button class="btn-toggle" onpointerdown={togglePatternEditor}>
              {prefs.patternEditor === 'grid' ? 'GRID' : 'TRKR'}
            </button>
            <p class="setting-desc">{L === 'ja'
              ? 'パターンエディターの表示形式を切り替えます。'
              : 'Switch pattern editor between grid and tracker.'}</p>
          </div>

          <div class="setting-group">
            <span class="setting-label">{L === 'ja' ? 'ホバーガイド' : 'HOVER GUIDE'}</span>
            <button
              class="btn-toggle"
              class:on={prefs.showGuide}
              onpointerdown={toggleShowGuide}
            >
              {prefs.showGuide ? 'ON' : 'OFF'}
            </button>
            <p class="setting-desc">{L === 'ja'
              ? 'UI要素にカーソルを合わせた時にガイドを表示します。'
              : 'Show floating guide when hovering over UI elements.'}</p>
          </div>

          <div class="setting-group">
            <span class="setting-label">{L === 'ja' ? '言語' : 'LANGUAGE'}</span>
            <button
              class="btn-toggle"
              onpointerdown={toggleLang}
            >
              {L === 'ja' ? 'EN' : 'JP'}
            </button>
          </div>

          <div class="setting-group about">
            <span class="setting-label">ABOUT</span>
            <p class="about-text">inboil v0.1.0</p>
            <p class="about-text">&copy; 2026 origamiworks</p>
          </div>

        {/if}
      </div>
    {/if}

    {#if visibleMode === 'system'}
      <div class="sidebar-footer">
        <span class="setting-label">{L === 'ja' ? 'リセット' : 'RESET'}</span>
        {#if confirmReset}
          <p class="reset-warn">{L === 'ja'
            ? 'すべてのパターン・設定が初期化されます。'
            : 'All patterns and settings will be reset.'}</p>
          <div class="reset-actions">
            <button class="btn-reset-confirm" onpointerdown={handleReset}>
              {L === 'ja' ? '実行' : 'OK'}
            </button>
            <button class="btn-reset-cancel" onpointerdown={() => { confirmReset = false }}>
              {L === 'ja' ? 'キャンセル' : 'CANCEL'}
            </button>
          </div>
        {:else}
          <button class="btn-reset" onpointerdown={() => { confirmReset = true }}>
            {L === 'ja' ? 'ファクトリーリセット' : 'FACTORY RESET'}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if guideText && prefs.showGuide}
  <div class="guide-float" class:shifted={visibleMode && !collapsed}>
    <span class="guide-label">GUIDE</span>
    <p class="guide-text">{guideText}</p>
  </div>
{/if}

<style>
  .sidebar {
    position: fixed;
    right: 0;
    bottom: 0;
    top: 0;
    width: 280px;
    z-index: 110;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 16px rgba(0,0,0,0.3);
    overflow: hidden;
    animation: sidebar-in 50ms ease-out;
  }
  .sidebar.collapsed {
    top: auto;
  }
  .sidebar.collapsed .sidebar-head {
    border-bottom: none;
  }
  .sidebar.closing {
    animation: sidebar-out 50ms ease-in forwards;
  }
  @keyframes sidebar-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes sidebar-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(24px); }
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(237,232,220,0.1);
    flex-shrink: 0;
  }

  .sidebar-title {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
  }

  .sidebar-head-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-lang {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
  }
  .btn-lang:active {
    background: rgba(237,232,220,0.15);
  }

  .btn-close {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 16px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-close:active {
    background: rgba(237,232,220,0.15);
  }

  .btn-collapse {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 10px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-collapse:active {
    background: rgba(237,232,220,0.15);
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  /* ── Floating guide bar ── */
  :global(.guide-float) {
    position: fixed;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 480px;
    width: calc(100% - 32px);
    background: rgba(30,32,40,0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(237,232,220,0.1);
    border-radius: 6px;
    padding: 6px 12px;
    z-index: 120;
    display: flex;
    align-items: baseline;
    gap: 8px;
    animation: guide-in 80ms ease-out;
    pointer-events: none;
    transition: right 100ms;
  }
  :global(.guide-float.shifted) {
    left: auto;
    right: 296px;
    transform: none;
  }
  @keyframes guide-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  :global(.guide-float) .guide-label {
    font-size: 7px;
    letter-spacing: 0.1em;
    color: var(--color-olive);
    text-transform: uppercase;
    flex-shrink: 0;
  }
  :global(.guide-float) .guide-text {
    font-size: 10px;
    line-height: 1.4;
    color: rgba(237,232,220,0.7);
    margin: 0;
  }

  .sidebar-footer {
    flex-shrink: 0;
    padding: 12px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
    margin-top: auto;
  }

  /* ── Search ── */
  .search-bar {
    position: relative;
    padding: 6px 12px 4px;
  }
  .search-input {
    width: 100%;
    background: rgba(237,232,220,0.06);
    border: 1px solid rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.8);
    font-size: 10px;
    letter-spacing: 0.04em;
    padding: 6px 28px 6px 8px;
    outline: none;
    box-sizing: border-box;
  }
  .search-input::placeholder {
    color: rgba(237,232,220,0.25);
  }
  .search-input:focus {
    border-color: rgba(237,232,220,0.3);
  }
  .search-clear {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: rgba(237,232,220,0.4);
    font-size: 14px;
    padding: 0 4px;
    cursor: pointer;
  }

  /* ── Help sections (always visible) ── */
  .help-section {
    border-bottom: 1px solid rgba(237,232,220,0.06);
    padding: 0 12px 10px;
  }

  .section-title {
    color: rgba(237,232,220,0.8);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 0 4px;
  }

  .section-body {
    font-size: 11px;
    line-height: 1.6;
    color: rgba(237,232,220,0.55);
    white-space: pre-line;
  }

  .category-label {
    font-size: 8px;
    letter-spacing: 0.12em;
    color: rgba(237,232,220,0.3);
    text-transform: uppercase;
    padding: 12px 12px 4px;
    margin-top: 4px;
    position: sticky;
    top: 0;
    background: var(--color-fg);
    z-index: 1;
  }

  /* ── System settings ── */
  .setting-group {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .setting-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.4);
    text-transform: uppercase;
    display: block;
    margin-bottom: 8px;
  }
  .btn-reset {
    border: 1px solid var(--color-salmon);
    background: transparent;
    color: var(--color-salmon);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    width: 100%;
  }
  .btn-reset:active {
    background: var(--color-salmon);
    color: var(--color-bg);
  }
  .reset-warn {
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-salmon);
    margin: 0 0 8px;
  }
  .reset-actions {
    display: flex;
    gap: 8px;
  }
  .btn-reset-confirm {
    border: 1px solid var(--color-salmon);
    background: var(--color-salmon);
    color: var(--color-bg);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    flex: 1;
  }
  .btn-reset-cancel {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    flex: 1;
  }
  .btn-reset-cancel:active {
    background: rgba(237,232,220,0.15);
  }
  .about-text {
    font-size: 11px;
    color: rgba(237,232,220,0.4);
    margin: 0;
  }
  .btn-toggle {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 16px;
  }
  .btn-toggle.on {
    border-color: var(--color-olive);
    color: var(--color-olive);
  }
  .btn-toggle:active { opacity: 0.7; }
  .setting-desc {
    font-size: 10px;
    line-height: 1.5;
    color: rgba(237,232,220,0.35);
    margin: 6px 0 0;
  }

  /* ── Mobile: fullscreen overlay ── */
  @media (max-width: 639px) {
    .sidebar {
      inset: 0;
      width: 100%;
      z-index: 110;
    }
    .sidebar.collapsed {
      top: auto;
    }
    :global(.guide-float) {
      max-width: calc(100% - 16px);
      width: auto;
    }
    :global(.guide-float.shifted) {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
    }
  }

  /* ── Project section ── */
  .proj-section { border-bottom: 1px solid rgba(237,232,220,0.1); padding-bottom: 10px; }
  .proj-actions { display: flex; gap: 4px; margin-top: 4px; }
  .btn-proj {
    border: 1px solid rgba(237,232,220,0.25);
    background: transparent;
    color: rgba(237,232,220,0.7);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    cursor: pointer;
  }
  .btn-proj:hover { background: rgba(237,232,220,0.08); color: rgba(237,232,220,0.9); }
  .proj-save-as {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }
  .proj-name-input {
    flex: 1;
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.9);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(237,232,220,0.2);
    padding: 3px 6px;
    outline: none;
  }
  .proj-list { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; }
  .proj-list-label {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220,0.3);
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .proj-item-name.factory { color: rgba(237,232,220,0.45); font-style: italic; }
  .proj-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px;
    border-radius: 2px;
  }
  .proj-item.current { background: rgba(237,232,220,0.06); }
  .proj-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    color: rgba(237,232,220,0.6);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }
  .proj-item.current .proj-item-name { color: rgba(237,232,220,0.9); }
  .proj-item-name:hover { color: rgba(237,232,220,0.9); }
  .proj-item-date {
    font-family: var(--font-data);
    font-size: 7px;
    color: rgba(237,232,220,0.3);
    flex-shrink: 0;
  }
  .proj-item-del {
    background: none;
    border: none;
    color: rgba(237,232,220,0.25);
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
  }
  .proj-item-del:hover { color: rgba(237,232,220,0.6); }
  .proj-item-del.confirm { color: var(--color-salmon); font-family: var(--font-data); font-size: 8px; font-weight: 700; }
  .proj-confirm {
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(237,232,220,0.04);
    border: 1px solid rgba(237,232,220,0.12);
    border-radius: 2px;
  }
  .proj-confirm-text {
    font-family: var(--font-data);
    font-size: 8px;
    color: rgba(237,232,220,0.6);
    display: block;
    margin-bottom: 6px;
  }
  .proj-confirm-actions { display: flex; gap: 4px; }
  .btn-proj.danger { border-color: var(--color-salmon); color: var(--color-salmon); }
  .btn-proj.danger:hover { background: rgba(var(--color-salmon), 0.1); }
</style>
