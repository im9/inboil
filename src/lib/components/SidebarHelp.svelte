<script lang="ts">
  import { lang } from '../state.svelte.ts'

  const L = $derived(lang.value)

  const docsBase = location.hostname === 'localhost'
    ? 'http://localhost:4321'
    : 'https://inboil-site.pages.dev'

  // ── Search filter ──
  let searchQuery = $state('')

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
        ? 'トラック下部のバーを8モードで切替:\nSTEP — トリガー ON/OFF\nVEL — 各ステップの音量\nCHNC — 発音確率 0–100%\nVOL / PAN / VERB / DLY / GLT / GRN — ステップごとの P-Lock\nステップ数: 数字タップで 2–64'
        : 'Switch 8 modes in the bar below each track:\nSTEP — toggle triggers\nVEL — per-step volume\nCHNC — trigger probability 0–100%\nVOL / PAN / VERB / DLY / GLT / GRN — per-step P-Lock\nStep count: tap number for 2–64',
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
      title: L === 'ja' ? 'サンプラー & オーディオプール' : 'SAMPLER & AUDIO POOL',
      docsUrl: '/docs/sound/sampler/',
      body: L === 'ja'
        ? 'LOAD ボタンまたはファイルをドラッグで読み込み\n開始/終了/ピッチ/減衰/逆再生を調整\nCHOP — サンプルを分割して再生\nBPM同期 — テンポに合わせて自動伸縮\nPOOL — 79種のファクトリーサンプル内蔵\nフォルダ階層・検索・試聴してワンタップで割り当て'
        : 'LOAD button or drag file to import audio\nAdjust start/end/pitch/decay/reverse\nCHOP — slice sample into segments\nBPM sync — auto-stretch to match tempo\nPOOL — 79 factory samples built-in\nBrowse folders, search, audition and assign with one tap',
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
        ? 'ノードグラフで曲構成。エッジで再生順を定義\nルートから開始、分岐ランダム、末端で停止\nノード: Pattern (マトリクスからドラッグ) / Generative (右クリック)\nGenerative: Turing Machine / Quantizer / Tonnetz\nFunction nodes (Transpose/Tempo/Repeat/FX): バブルメニューから追加'
        : 'Node graph for arrangement. Edges define playback order\nStarts at root, random at forks, stops at terminals\nNodes: Pattern (drag from matrix) / Generative (right-click)\nGenerative: Turing Machine / Quantizer / Tonnetz\nFunction nodes (Transpose/Tempo/Repeat/FX): add from bubble menu',
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
</script>

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

<style>
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
</style>
