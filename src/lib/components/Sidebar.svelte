<script lang="ts">
  import { onMount } from 'svelte'
  import { ui, lang, prefs, project, song, session, midiIn, toggleLang, toggleScaleMode, togglePatternEditor, toggleShowGuide, factoryReset, projectNew, projectSaveAs, projectLoad, projectDelete, projectLoadFactory, projectRename, listProjects, exportProjectJSON, importProjectJSON, type StoredProject } from '../state.svelte.ts'
  import { exportAndDownloadMidi } from '../midiExport.ts'
  import { initMidi, startListening, stopListening } from '../midi.ts'
  import { startHost, joinAsGuest, disconnect } from '../multiDevice/connection.ts'
  import { resetDeltaSync } from '../multiDevice/deltaSync.ts'
  import { generateQrSvg } from '../qr.ts'

  const qrSvg = $derived(session.role === 'host' && session.roomCode
    ? generateQrSvg(session.roomCode)
    : '')

  const mode = $derived(ui.sidebar)
  const L = $derived(lang.value)

  const docsBase = location.hostname === 'localhost'
    ? 'http://localhost:4321'
    : 'https://inboil-site.pages.dev'

  // ── Open/close animation ──
  let closing = $state(false)
  let visibleMode = $state<'help' | 'system' | null>(null)
  $effect(() => {
    if (mode) {
      closing = false
      visibleMode = mode
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

  // ── Multi-device jam (ADR 019) ──
  let joinCode = $state('')
  let joinName = $state('')
  let joinError = $state('')
  let joining = $state(false)

  async function handleStartHost() {
    try {
      await startHost()
    } catch {
      joinError = L === 'ja' ? '接続に失敗しました' : 'Connection failed'
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    const name = joinName.trim() || 'Guest'
    if (code.length !== 4) {
      joinError = L === 'ja' ? '4文字のルームコードを入力' : 'Enter 4-character room code'
      return
    }
    joining = true
    joinError = ''
    try {
      await joinAsGuest(code, name)
    } catch {
      joinError = L === 'ja' ? '接続に失敗しました' : 'Connection failed'
    }
    joining = false
  }

  function handleDisconnect() {
    disconnect()
    resetDeltaSync()
    joinCode = ''
    joinError = ''
  }

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
    // Reset input so the same file can be re-imported
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
    { label: 'マルチデバイス', labelEn: 'MULTI-DEVICE' },
  ]

  const helpSections = $derived([
    // ── 0: GETTING STARTED ──
    {
      category: 0,
      title: L === 'ja' ? 'クイックスタート' : 'QUICK START',
      docsUrl: '/docs/getting-started/first-beat/',
      body: L === 'ja'
        ? '▶ (SPACE) で再生 → ステップをタップ → ドックのノブで音作り\nRAND でランダム生成、Ctrl+Z で戻す'
        : '▶ (SPACE) to play → tap steps → turn dock knobs\nRAND to randomize, Ctrl+Z to undo',
    },
    {
      category: 0,
      title: L === 'ja' ? 'プロジェクト' : 'PROJECTS',
      docsUrl: '/docs/reference/faq/',
      body: L === 'ja'
        ? '⚠ プロジェクトはこのブラウザにローカル保存されます。バックアップにはエクスポートを使用してください\n自動保存 — 編集するたびに即時保存\nSYSTEM → NEW / SAVE AS で管理\nプロジェクト一覧からタップで切替、長押しで削除\nREC ● — WAV録音 (サブヘッダー)\nEXPORT/IMPORT — JSON / MIDI エクスポート'
        : '⚠ Projects are saved locally in this browser. Use Export to back up.\nAuto-saved on every edit\nSYSTEM → NEW / SAVE AS to manage\nTap to switch, long-press to delete\nREC ● — WAV recording (sub-header)\nEXPORT/IMPORT — JSON / MIDI export',
    },
    {
      category: 0,
      title: L === 'ja' ? 'ショートカット' : 'SHORTCUTS',
      docsUrl: '/docs/reference/shortcuts/',
      body: 'Space — Play/Stop\nCtrl+Z / Ctrl+Shift+Z — Undo / Redo\nEscape — Close / Deselect\nDelete — Remove node/edge\nCtrl+C / V — Copy / Paste',
    },
    // ── 1: SEQUENCER ──
    {
      category: 1,
      title: L === 'ja' ? 'ステップシーケンサー' : 'STEP SEQUENCER',
      docsUrl: '/docs/sequencer/grid-mode/',
      body: L === 'ja'
        ? 'SYSTEM → GRID で選択。タップでON/OFF、ドラッグで連続入力\nメロディトラックはピアノロール付き'
        : 'SYSTEM → GRID. Tap to toggle, drag to paint\nMelodic tracks show piano roll',
    },
    {
      category: 1,
      title: L === 'ja' ? 'トラッカー' : 'TRACKER',
      docsUrl: '/docs/sequencer/tracker-mode/',
      body: L === 'ja'
        ? 'SYSTEM → TRKR で選択。NOTE/VEL/DUR/SLD/CHN を直接編集\n矢印キーでナビゲーション'
        : 'SYSTEM → TRKR. Edit NOTE/VEL/DUR/SLD/CHN directly\nArrow keys to navigate',
    },
    {
      category: 1,
      title: L === 'ja' ? 'ベロシティ & 確率' : 'VELOCITY & CHANCE',
      docsUrl: '/docs/sequencer/velocity-chance/',
      body: L === 'ja'
        ? 'トラック下部のバーを3モードで切替:\nSTEP — トリガー ON/OFF\nVEL — 各ステップの音量 (上下ドラッグ)\nCHNC — 発音確率 0–100%\nステップ数: 数字タップで 2–64'
        : 'Switch 3 modes in the bar below each track:\nSTEP — toggle triggers\nVEL — per-step volume (drag up/down)\nCHNC — trigger probability 0–100%\nStep count: tap number for 2–64',
    },
    {
      category: 1,
      title: L === 'ja' ? 'ピアノロール' : 'PIANO ROLL',
      docsUrl: '/docs/sequencer/piano-roll/',
      body: L === 'ja'
        ? 'メロディトラックで自動表示。タップでノート配置\nSLD — なめらかに音程を繋ぐ\nPoly音色 — 同じステップに複数ノートでコード\nスケールモードで音階制限\nChord Brush — triad/7th/sus2/sus4 をワンタップで配置'
        : 'Auto-shown for melodic tracks. Tap to place notes\nSLD — smooth pitch glide between notes\nPoly voices — tap multiple notes on same step for chords\nScale mode restricts to key notes\nChord Brush — place triad/7th/sus2/sus4 in one tap',
    },
    {
      category: 1,
      title: L === 'ja' ? 'パターン' : 'PATTERNS',
      docsUrl: '/docs/sequencer/grid-mode/',
      body: L === 'ja'
        ? 'PAT ◀▶ で切替 (00–19 は内蔵デモ)\nCPY コピー / PST ペースト / CLR クリア\n名前クリックでリネーム、カラードットで色設定'
        : 'PAT ◀▶ to switch (00–19 are built-in demos)\nCPY copy / PST paste / CLR clear\nClick name to rename, dot to set color',
    },
    // ── 2: SOUND ──
    {
      category: 2,
      title: L === 'ja' ? 'トラック & 楽器' : 'TRACKS & VOICES',
      docsUrl: '/docs/sound/voices/',
      body: L === 'ja'
        ? '最大16トラック (+で追加、REMOVEで削除)\nドックの DRUM/BASS/LEAD/SMPL から楽器変更\nM ミュート、S ソロ (複数可)\nInsert FX — トラック毎にverb/delay/glitchを追加'
        : 'Up to 16 tracks (+ to add, REMOVE to delete)\nDock tabs: DRUM/BASS/LEAD/SMPL\nM mute, S solo (additive)\nInsert FX — per-track verb/delay/glitch',
    },
    {
      category: 2,
      title: L === 'ja' ? 'プリセット & ステップ固有設定' : 'PRESETS & PER-STEP LOCK',
      docsUrl: '/docs/getting-started/adding-sounds/',
      body: L === 'ja'
        ? 'PRESETS — 内蔵の音色プリセットを選択\nLOCK ON → ステップ選択 → ノブ操作\nそのステップだけ音色が変わる。CLR で解除'
        : 'PRESETS — browse built-in sound presets\nLOCK ON → select step → turn knobs\nSound changes apply to that step only. CLR to clear',
    },
    {
      category: 2,
      title: L === 'ja' ? 'サンプラー' : 'SAMPLER',
      docsUrl: '/docs/sound/sampler/',
      body: L === 'ja'
        ? 'LOAD ボタンまたはファイルをドラッグで読み込み\n開始/終了/ピッチ/減衰/逆再生を調整\nCHOP — サンプルを分割して再生\nBPM同期 — テンポに合わせて自動伸縮'
        : 'LOAD button or drag file to import audio\nAdjust start/end/pitch/decay/reverse\nCHOP — slice sample into segments\nBPM sync — auto-stretch to match tempo',
    },
    // ── 3: MIXER & FX ──
    {
      category: 3,
      title: L === 'ja' ? 'FX パッド' : 'FX PAD',
      docsUrl: '/docs/sound/fx/',
      body: L === 'ja'
        ? 'リバーブ/ディレイ/グリッチ/グラニュラーの4エフェクト\nノードをドラッグで調整、タップでON/OFF\nセンドバーで各トラックの送り量を設定\n各FXに3種のフレーバー (例: reverb → room/hall/shimmer)'
        : '4 effects: reverb / delay / glitch / granular\nDrag nodes to adjust, tap to toggle\nSend bar sets per-track levels\n3 flavours per FX (e.g. reverb: room/hall/shimmer)',
    },
    {
      category: 3,
      title: 'EQ',
      docsUrl: '/docs/sound/fx/',
      body: L === 'ja'
        ? 'LOW/MID/HIGH + フィルター (左LP / 右HP)\nノードをドラッグ、タップでON/OFF'
        : 'LOW/MID/HIGH + filter (left LP / right HP)\nDrag nodes, tap to toggle',
    },
    {
      category: 3,
      title: L === 'ja' ? 'マスター' : 'MASTER',
      docsUrl: '/docs/sound/fx/',
      body: L === 'ja'
        ? 'XYパッド: コンプ / サイドチェイン / FXリターン\nフェーダー: 音量 / メイクアップ / スウィング\nVUメーターでL/Rピーク確認'
        : 'XY pads: compressor / sidechain / FX return\nFaders: volume / makeup / swing\nVU meter for L/R peaks',
    },
    // ── 4: ARRANGEMENT ──
    {
      category: 4,
      title: L === 'ja' ? 'マトリクス' : 'MATRIX',
      docsUrl: '/docs/scene/nodes/',
      body: L === 'ja'
        ? '左のパターンプール。タップで選択、ダブルタップでシート表示\nセルの明るさ = 密度、色 = パターンカラー'
        : 'Pattern pool on the left. Tap to select, double-tap to open\nBrightness = density, tint = pattern color',
    },
    {
      category: 4,
      title: L === 'ja' ? 'シーンビュー' : 'SCENE VIEW',
      docsUrl: '/docs/scene/nodes/',
      body: L === 'ja'
        ? 'ノードグラフで曲構成。エッジで再生順を定義\nルートから開始、分岐ランダム、末端で停止\nノード: Pattern (マトリクスからドラッグ) / Generative (右クリック)\nGenerative: Turing Machine / Quantizer / Tonnetz\nデコレーター (Transpose/Tempo/Repeat/FX/Automation): ドックの Add から追加'
        : 'Node graph for arrangement. Edges define playback order\nStarts at root, random at forks, stops at terminals\nNodes: Pattern (drag from matrix) / Generative (right-click)\nGenerative: Turing Machine / Quantizer / Tonnetz\nDecorators (Transpose/Tempo/Repeat/FX/Automation): add from Dock',
    },
    // ── 5: PERFORMANCE ──
    {
      category: 5,
      title: 'FILL / REV / BRK',
      docsUrl: '/docs/getting-started/first-beat/',
      body: L === 'ja'
        ? 'ボタン長押しでリアルタイム効果:\nFILL — ドラムの自動フィルイン\nREV — 逆再生\nBRK — リズムでブレイク\n離すと即復帰'
        : 'Hold buttons for real-time effects:\nFILL — auto drum fill\nREV — reverse playback\nBRK — rhythmic break\nRelease to restore',
    },
    {
      category: 5,
      title: L === 'ja' ? 'KEY / スケール' : 'KEY / SCALE',
      docsUrl: '/docs/sequencer/piano-roll/',
      body: L === 'ja'
        ? 'チャーチモード: C Ionian, D Dorian, E Phrygian, F Lydian, G Mixolydian, A Aeolian, B Locrian\nスケールモード ON で音階制限'
        : 'Church modes: C Ion, D Dor, E Phr, F Lyd, G Mix, A Aeo, B Loc\nScale mode ON restricts to mode notes',
    },
    {
      category: 5,
      title: L === 'ja' ? 'キーボード演奏' : 'KEYBOARD PLAY',
      docsUrl: '/docs/reference/shortcuts/',
      body: L === 'ja'
        ? 'VKBD ボタンで有効化。PCキーボードで演奏\nA~; で音階、Z/X でオクターブ、1~0 でベロシティ\nUSB/BLE MIDIキーボード対応 (SYSTEM → MIDI)'
        : 'Enable with VKBD button. Play with PC keyboard\nA–; for notes, Z/X octave, 1–0 velocity\nUSB/BLE MIDI keyboard supported (SYSTEM → MIDI)',
    },
    // ── 6: MULTI-DEVICE ──
    {
      category: 6,
      title: L === 'ja' ? 'ジャムセッション' : 'JAM SESSION',
      docsUrl: '/docs/reference/multi-device/',
      body: L === 'ja'
        ? 'スマホをコントローラーにして2台でジャム！\nSYSTEM → JAM SESSION → HOST でルームコード発行\n相手はゲストとしてコードを入力して参加\nWebRTC P2P接続 — 同じWiFiなら超低遅延'
        : 'Turn your phone into a controller for a 2-device jam!\nSYSTEM → JAM SESSION → HOST to get a room code\nOther device joins as GUEST with the code\nWebRTC P2P — ultra-low latency on same WiFi',
    },
    {
      category: 6,
      title: L === 'ja' ? 'ホスト & ゲスト' : 'HOST & GUEST',
      docsUrl: '/docs/reference/multi-device/',
      body: L === 'ja'
        ? 'ホスト (PC) — オーディオ再生、全状態を管理\nゲスト (スマホ) — コントローラーとして操作\nゲストの操作: ステップ ON/OFF、ミュート、パターン切替、FILL/REV/BRK、パラメータ変更\nゲスト画面にはリアルタイムで状態がミラーリング'
        : 'Host (PC) — plays audio, manages all state\nGuest (phone) — acts as a controller\nGuest controls: step toggle, mute, pattern switch, FILL/REV/BRK, param tweaks\nGuest screen mirrors state in real time',
    },
  ])
</script>

{#if visibleMode}
  <div class="sidebar" class:closing onanimationend={onAnimEnd}>
    <div class="sidebar-head">
      <span class="sidebar-title">{visibleMode === 'help' ? 'HELP' : 'SYSTEM'}</span>
      <div class="sidebar-head-right">
        {#if visibleMode === 'help'}
          <button class="btn-lang" onpointerdown={toggleLang}>
            {L === 'ja' ? 'EN' : 'JP'}
          </button>
        {/if}
        <button class="btn-close" onpointerdown={() => { ui.sidebar = null }}>&times;</button>
      </div>
    </div>
    {#if visibleMode === 'system'}
      <div class="system-tabs">
        <button class="system-tab" class:active={ui.systemTab === 'project'} onpointerdown={() => { ui.systemTab = 'project' }}>PROJECT</button>
        <button class="system-tab" class:active={ui.systemTab === 'settings'} onpointerdown={() => { ui.systemTab = 'settings' }}>SETTINGS</button>
      </div>
    {/if}

      <div class="sidebar-body">
        {#if visibleMode === 'help'}
          <a class="full-docs-link" href="{docsBase}{L === 'ja' ? '/ja/docs/' : '/docs/'}" target="_blank" rel="noopener">
            {L === 'ja' ? 'チュートリアル & ドキュメント' : 'Full Tutorial & Docs'} &rarr;
          </a>
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
                  <div class="section-title">{section.title}
                    {#if section.docsUrl}
                      <a class="docs-link" href="{docsBase}{L === 'ja' ? '/ja' : ''}{section.docsUrl}" target="_blank" rel="noopener">Docs &rarr;</a>
                    {/if}
                  </div>
                  <div class="section-body">{section.body}</div>
                </div>
              {/each}
            {/if}
          {/each}
        {:else}
          {#if ui.systemTab === 'project'}
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

          {:else}
            <!-- ── SETTINGS tab ── -->
            <div class="settings-section">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-label">{L === 'ja' ? 'パターン入力' : 'PATTERN INPUT'}</span>
                  <span class="setting-row-desc">{L === 'ja'
                    ? (prefs.patternEditor === 'grid' ? 'グリッド — タップでリズム入力' : 'トラッカー — 数値で精密入力')
                    : (prefs.patternEditor === 'grid' ? 'Grid — tap to edit rhythm' : 'Tracker — precise numeric entry')}</span>
                </div>
                <button class="btn-toggle" onpointerdown={togglePatternEditor}>
                  {prefs.patternEditor === 'grid' ? 'GRID' : 'TRKR'}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-label">{L === 'ja' ? 'スケール制限' : 'SCALE LOCK'}</span>
                  <span class="setting-row-desc">{L === 'ja'
                    ? 'ピアノロールでキー外のノートを無効化'
                    : 'Disable out-of-key notes in piano roll'}</span>
                </div>
                <button class="btn-toggle" class:on={prefs.scaleMode} onpointerdown={toggleScaleMode}>
                  {prefs.scaleMode ? 'ON' : 'OFF'}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-label">{L === 'ja' ? 'ホバーガイド' : 'HOVER GUIDE'}</span>
                  <span class="setting-row-desc">{L === 'ja'
                    ? 'UIにカーソルを合わせると説明を表示'
                    : 'Show tooltip when hovering UI elements'}</span>
                </div>
                <button class="btn-toggle" class:on={prefs.showGuide} onpointerdown={toggleShowGuide}>
                  {prefs.showGuide ? 'ON' : 'OFF'}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-label">{L === 'ja' ? '表示言語' : 'LANGUAGE'}</span>
                  <span class="setting-row-desc">{L === 'ja' ? '日本語 ↔ English' : 'English ↔ 日本語'}</span>
                </div>
                <button class="btn-toggle" onpointerdown={toggleLang}>
                  {L === 'ja' ? 'EN' : 'JP'}
                </button>
              </div>
            </div>

            <!-- MIDI Input (ADR 081) -->
            {#if midiIn.available}
            <div class="settings-section">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-label">{L === 'ja' ? 'MIDI入力' : 'MIDI INPUT'}</span>
                  <span class="setting-row-desc">{L === 'ja'
                    ? '外部MIDIキーボードで演奏'
                    : 'Play with external MIDI keyboard'}</span>
                </div>
                <button class="btn-toggle" class:on={midiIn.enabled} onpointerdown={async () => {
                  midiIn.enabled = !midiIn.enabled
                  if (midiIn.enabled) { await initMidi(); startListening() } else stopListening()
                }}>
                  {midiIn.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {#if midiIn.enabled}
                <div class="setting-row">
                  <div class="setting-row-text">
                    <span class="setting-row-label">{L === 'ja' ? 'デバイス' : 'DEVICE'}</span>
                  </div>
                  <select class="midi-select" bind:value={midiIn.activeDeviceId}>
                    <option value="">{L === 'ja' ? 'すべて' : 'All'}</option>
                    {#each midiIn.devices.filter(d => d.connected) as dev}
                      <option value={dev.id}>{dev.name}</option>
                    {/each}
                  </select>
                </div>
                <div class="setting-row">
                  <div class="setting-row-text">
                    <span class="setting-row-label">{L === 'ja' ? 'チャンネル' : 'CHANNEL'}</span>
                  </div>
                  <select class="midi-select" bind:value={midiIn.channel}>
                    <option value={0}>Omni</option>
                    {#each Array.from({ length: 16 }, (_, i) => i + 1) as ch}
                      <option value={ch}>{ch}</option>
                    {/each}
                  </select>
                </div>
                {#if midiIn.devices.length > 0}
                  <div class="midi-devices">
                    {#each midiIn.devices as dev}
                      <div class="midi-device" class:offline={!dev.connected}>
                        <span class="midi-dot" class:on={dev.connected}></span>
                        <span class="midi-device-name">{dev.name}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
            {/if}

            <!-- Multi-device jam (ADR 019) -->
            <div class="settings-section">
              <span class="setting-label">{L === 'ja' ? 'ジャムセッション' : 'JAM SESSION'}</span>
              {#if session.role === 'solo'}
                <div class="setting-row">
                  <div class="setting-row-text">
                    <span class="setting-row-label">{L === 'ja' ? 'ホストとして開始' : 'START AS HOST'}</span>
                    <span class="setting-row-desc">{L === 'ja'
                      ? 'ルームコードを発行して他デバイスを招待'
                      : 'Generate room code to invite other devices'}</span>
                  </div>
                  <button class="btn-toggle" onpointerdown={handleStartHost}>HOST</button>
                </div>
                <div class="setting-row jam-join-row">
                  <div class="setting-row-text">
                    <span class="setting-row-label">{L === 'ja' ? 'ゲストとして参加' : 'JOIN AS GUEST'}</span>
                  </div>
                </div>
                <div class="jam-join-form">
                  <input
                    class="jam-input"
                    type="text"
                    maxlength="4"
                    placeholder={L === 'ja' ? 'コード' : 'CODE'}
                    bind:value={joinCode}
                    onkeydown={(e) => { if (e.key === 'Enter') void handleJoin() }}
                  />
                  <input
                    class="jam-input jam-name"
                    type="text"
                    maxlength="12"
                    placeholder={L === 'ja' ? '名前' : 'Name'}
                    bind:value={joinName}
                    onkeydown={(e) => { if (e.key === 'Enter') void handleJoin() }}
                  />
                  <button class="btn-toggle" disabled={joining} onpointerdown={() => void handleJoin()}>JOIN</button>
                </div>
                {#if joinError}
                  <p class="jam-error">{joinError}</p>
                {/if}

              {:else if session.role === 'host'}
                <div class="jam-active">
                  <div class="jam-status">
                    <span class="jam-status-label">{L === 'ja' ? 'ホスト中' : 'HOSTING'}</span>
                    <span class="jam-room-code">{session.roomCode}</span>
                  </div>
                  {#if qrSvg}
                    <div class="jam-qr">{@html qrSvg}</div>
                  {/if}
                  <div class="jam-peers">
                    <span class="setting-row-desc">{L === 'ja'
                      ? `${session.peers.length} 台接続中`
                      : `${session.peers.length} device${session.peers.length !== 1 ? 's' : ''} connected`}</span>
                    {#each session.peers as peer}
                      <div class="jam-peer">{peer.name}</div>
                    {/each}
                  </div>
                  <button class="btn-toggle danger" onpointerdown={handleDisconnect}>
                    {L === 'ja' ? '終了' : 'END'}
                  </button>
                </div>

              {:else}
                <div class="jam-active">
                  <div class="jam-status">
                    <span class="jam-status-label">{L === 'ja' ? 'ゲスト' : 'GUEST'}</span>
                    <span class="jam-room-code">{session.roomCode}</span>
                    <span class="jam-connected" class:on={session.connected}>
                      {session.connected
                        ? (L === 'ja' ? '接続中' : 'Connected')
                        : (L === 'ja' ? '接続待ち...' : 'Connecting...')}
                    </span>
                  </div>
                  <button class="btn-toggle danger" onpointerdown={handleDisconnect}>
                    {L === 'ja' ? '切断' : 'LEAVE'}
                  </button>
                </div>
              {/if}
            </div>

            <div class="setting-group about">
              <p class="about-text">inboil v0.1.0 &mdash; &copy; 2026 origamiworks</p>
            </div>

          {/if}
        {/if}
      </div>

    {#if visibleMode === 'system' && ui.systemTab === 'settings'}
      <div class="sidebar-footer">
        <a
          class="donate-link-app"
          href="https://ko-fi.com/inboil"
          target="_blank"
          rel="noopener"
        >&#9825; {L === 'ja' ? 'このプロジェクトを応援' : 'SUPPORT THIS PROJECT'}</a>
        <a
          class="footer-link"
          href="https://github.com/im9"
          target="_blank"
          rel="noopener"
        >GitHub</a>
        <span class="setting-label">{L === 'ja' ? 'リセット' : 'RESET'}</span>
        {#if confirmReset}
          <p class="reset-warn">{L === 'ja'
            ? 'すべてのパターン・設定が初期化されます。'
            : 'All patterns and settings will be reset.'}</p>
          <div class="reset-actions">
            <button class="btn-reset-confirm" onpointerdown={handleReset}>
              OK
            </button>
            <button class="btn-reset-cancel" onpointerdown={() => { confirmReset = false }}>
              CANCEL
            </button>
          </div>
        {:else}
          <button class="btn-reset" onpointerdown={() => { confirmReset = true }}>
            FACTORY RESET
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if guideText && prefs.showGuide}
  <div class="guide-float" class:shifted={!!visibleMode}>
    <span class="guide-label">GUIDE</span>
    <p class="guide-text">{guideText}</p>
  </div>
{/if}

<style>
  .sidebar {
    position: fixed;
    right: 0;
    bottom: 0;
    top: 104px;
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


  /* ── System tabs ── */
  .system-tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(237,232,220,0.1);
  }
  .system-tab {
    flex: 1;
    padding: 8px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: center;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(237,232,220,0.35);
    cursor: pointer;
    transition: color 40ms linear, border-color 40ms linear;
  }
  .system-tab:hover {
    color: rgba(237,232,220,0.55);
  }
  .system-tab.active {
    color: rgba(237,232,220,0.9);
    border-bottom-color: var(--color-olive);
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
    /* no shift — guide is narrower than the gap and has higher z-index */
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

  .donate-link-app {
    display: block;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--olive);
    text-decoration: none;
    letter-spacing: 0.04em;
    padding-bottom: 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .donate-link-app:hover {
    text-decoration: underline;
    filter: brightness(1.2);
  }
  .footer-link {
    display: block;
    font-size: 10px;
    font-family: var(--font-mono);
    color: rgba(237,232,220,0.4);
    text-decoration: none;
    letter-spacing: 0.04em;
    padding-bottom: 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .footer-link:hover {
    color: rgba(237,232,220,0.7);
  }

  /* ── Search ── */
  .full-docs-link {
    display: block;
    padding: 8px 12px;
    font-size: 11px;
    color: var(--color-blue, #4472B4);
    text-decoration: none;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    transition: background 0.15s;
  }
  .full-docs-link:hover {
    background: rgba(68,114,180,0.1);
  }
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
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .docs-link {
    font-size: 9px;
    color: var(--color-blue, #4472B4);
    text-decoration: none;
    letter-spacing: 0;
    text-transform: none;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .docs-link:hover {
    opacity: 1;
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
  }
  .setting-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.5);
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
    font-size: 10px;
    color: rgba(237,232,220,0.3);
    margin: 0;
  }
  .btn-toggle {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 0;
    min-width: 52px;
    text-align: center;
  }
  .btn-toggle.on {
    border-color: var(--color-olive);
    color: var(--color-olive);
  }
  .btn-toggle:active { opacity: 0.7; }

  /* ── MIDI (ADR 081) ── */
  .midi-select {
    background: transparent;
    border: 1px solid rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.7);
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 4px;
    outline: none;
  }
  .midi-select option { background: var(--color-bg); }
  .midi-devices { padding: 4px 0 0; }
  .midi-device {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 10px;
    color: rgba(237,232,220,0.55);
  }
  .midi-device.offline { opacity: 0.4; }
  .midi-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: rgba(237,232,220,0.25);
    flex-shrink: 0;
  }
  .midi-dot.on { background: var(--color-olive); }

  /* ── Mobile: fullscreen overlay ── */
  @media (max-width: 639px) {
    .sidebar {
      inset: 0;
      width: 100%;
      z-index: 110;
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

  /* ── Project primary actions ── */
  .proj-primary {
    display: flex;
    gap: 6px;
    padding: 12px 16px 8px;
  }
  .btn-proj-primary {
    flex: 1;
    border: 1.5px solid rgba(237,232,220,0.5);
    background: rgba(237,232,220,0.12);
    color: rgba(237,232,220,0.9);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 8px;
    cursor: pointer;
    transition: background 40ms linear, color 40ms linear;
  }
  .btn-proj-primary:hover {
    background: rgba(237,232,220,0.18);
    color: rgba(237,232,220,1);
  }
  .btn-proj-primary:active {
    background: rgba(237,232,220,0.24);
  }
  .btn-proj-primary.outline {
    background: transparent;
    border-color: rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.7);
  }
  .btn-proj-primary.outline:hover {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.9);
  }
  .btn-proj-primary.danger {
    border-color: var(--color-salmon);
    background: transparent;
    color: var(--color-salmon);
  }
  .btn-proj-primary.danger:hover {
    background: rgba(237,232,220,0.06);
  }
  .proj-rename {
    padding: 4px 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .proj-rename-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.35);
    text-transform: uppercase;
  }
  .proj-rename-value {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.7);
    cursor: pointer;
    text-transform: uppercase;
  }
  .proj-rename-value:hover {
    color: rgba(237,232,220,0.9);
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
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.9);
    background: rgba(255,255,255,0.06);
    border: 1.5px solid rgba(237,232,220,0.25);
    padding: 8px 10px;
    outline: none;
  }
  .proj-name-input:focus {
    border-color: rgba(237,232,220,0.5);
  }
  .proj-confirm {
    margin: 0 16px 8px;
    padding: 10px 12px;
    background: rgba(237,232,220,0.04);
    border: 1px solid rgba(237,232,220,0.12);
  }
  .proj-confirm-text {
    font-size: 11px;
    color: rgba(237,232,220,0.7);
    display: block;
    margin-bottom: 8px;
  }
  .proj-confirm-actions { display: flex; gap: 6px; }

  /* ── Project list ── */
  .proj-list {
    padding: 4px 16px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .proj-list-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.4);
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
    border-radius: 2px;
    transition: background 40ms linear;
  }
  .proj-item:hover { background: rgba(237,232,220,0.04); }
  .proj-item.current { background: rgba(237,232,220,0.08); }
  .proj-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    color: rgba(237,232,220,0.65);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }
  .proj-item.current .proj-item-name { color: rgba(237,232,220,0.95); }
  .proj-item-name:hover { color: rgba(237,232,220,0.9); }
  .proj-item-name.factory { color: rgba(237,232,220,0.5); font-style: italic; }
  .proj-item-date {
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    flex-shrink: 0;
  }
  .proj-item-del {
    background: none;
    border: none;
    color: rgba(237,232,220,0.2);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    flex-shrink: 0;
    transition: color 40ms linear;
  }
  .proj-item-del:hover { color: rgba(237,232,220,0.6); }
  .proj-item-del.confirm {
    color: var(--color-salmon);
    font-size: 10px;
    font-weight: 700;
  }

  /* ── Settings rows ── */
  .export-section {
    padding: 8px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
  }
  .export-buttons {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .btn-export {
    flex: 1;
    padding: 6px 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    border: 1px solid rgba(237,232,220,0.15);
    border-radius: 4px;
    background: rgba(237,232,220,0.06);
    color: rgba(237,232,220,0.7);
    cursor: pointer;
    transition: background 0.1s;
  }
  .btn-export:active {
    background: rgba(237,232,220,0.15);
  }
  .export-sub-label {
    display: block;
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.3);
    text-transform: uppercase;
    margin: 6px 0 4px;
  }
  .import-error {
    font-size: 10px;
    color: var(--color-salmon);
    padding: 4px 0 0;
  }
  .settings-section {
    padding: 4px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(237,232,220,0.04);
  }
  .setting-row:last-child { border-bottom: none; }
  .setting-row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .setting-row-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.8);
    text-transform: uppercase;
  }
  .setting-row-desc {
    font-size: 10px;
    color: rgba(237,232,220,0.4);
    line-height: 1.3;
  }

  /* ── Jam session (ADR 019) ── */
  .jam-join-row { border-bottom: none !important; padding-bottom: 0; }
  .jam-join-form {
    display: flex;
    gap: 4px;
    padding: 0 12px 10px;
  }
  .jam-input {
    background: transparent;
    border: 1px solid rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.8);
    font-family: var(--font-data);
    font-size: 11px;
    letter-spacing: 0.08em;
    padding: 5px 6px;
    width: 64px;
    text-transform: uppercase;
  }
  .jam-input.jam-name {
    flex: 1;
    text-transform: none;
  }
  .jam-input::placeholder {
    color: rgba(237,232,220,0.25);
    text-transform: uppercase;
  }
  .jam-error {
    font-size: 10px;
    color: #e85050;
    padding: 0 12px 8px;
    margin: 0;
  }
  .jam-active {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .jam-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .jam-status-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
  }
  .jam-room-code {
    font-family: var(--font-data);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220,0.9);
  }
  .jam-qr {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }
  .jam-qr :global(svg) {
    width: 100px;
    height: 100px;
    border-radius: 4px;
  }
  .jam-connected {
    font-size: 10px;
    color: rgba(237,232,220,0.4);
  }
  .jam-connected.on {
    color: var(--color-olive);
  }
  .jam-peers {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .jam-peer {
    font-size: 10px;
    color: rgba(237,232,220,0.6);
    padding-left: 8px;
  }
  .btn-toggle.danger {
    border-color: #e85050;
    color: #e85050;
  }
</style>
