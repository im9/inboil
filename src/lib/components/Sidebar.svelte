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

  let openSections = $state(new Set<number>([0]))

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

  function toggleSection(idx: number) {
    if (openSections.has(idx)) {
      openSections.delete(idx)
    } else {
      openSections.add(idx)
    }
    openSections = new Set(openSections)
  }

  const helpSections = $derived([
    {
      title: L === 'ja' ? 'inboil とは' : 'ABOUT',
      body: L === 'ja'
        ? 'テクノやエレクトロニカに特化した Web ベースの DAW です。ブラウザでアクセスするだけで、どのデバイスでも手軽に音楽制作やライブパフォーマンスを楽しめます。'
        : 'A web-based DAW specialized for techno and electronica. Just open your browser — make music and perform live on any device, anywhere.',
    },
    {
      title: L === 'ja' ? '基本操作' : 'BASICS',
      body: L === 'ja'
        ? 'SPACEキーで再生/停止。グリッドをタップしてステップのON/OFFを切り替え。RANDでランダムパターン生成。Ctrl+Z で元に戻す、Ctrl+Shift+Z でやり直し。'
        : 'SPACE to play/stop. Tap the grid to toggle steps ON/OFF. RAND generates a random pattern. Ctrl+Z to undo, Ctrl+Shift+Z to redo.',
    },
    {
      title: L === 'ja' ? 'トラック' : 'TRACKS',
      body: L === 'ja'
        ? '8トラック構成 (デフォルト: KICK, SNARE, CLAP, C.HH, O.HH, CYM + BASS, LEAD)。楽器はトラックごとに自由に変更可能 — ドラム12種 + ベース/リード/シンセ (Synth, Poly) から選択。トラック名タップで選択。VOL/PANノブで音量とパンを調整。Mボタンでミュート、Sボタンでソロ (複数トラック同時ソロ可)。'
        : '8 tracks (default: KICK, SNARE, CLAP, C.HH, O.HH, CYM + BASS, LEAD). Voice can be reassigned per track — choose from drums, bass, lead, or wavetable synths (Synth, Poly). Tap track name to select. VOL/PAN knobs for volume and panning. M to mute, S to solo (additive — multiple tracks can be soloed).',
    },
    {
      title: L === 'ja' ? 'ベロシティ & チャンス' : 'VELOCITY & CHANCE',
      body: L === 'ja'
        ? '選択トラックの下にバーが表示されます。3つのモード: STEP (トリガー ON/OFF)、VEL (上下ドラッグで各ステップの音量)、CHNC (各ステップの発音確率 0–100%)。ステップ数はVEL下の数字タップで変更 (2〜64)。'
        : 'Bars appear below the selected track. Three modes: STEP (toggle triggers), VEL (drag up/down for per-step volume), CHNC (per-step trigger probability 0–100%). Tap the step count number to cycle (2–64).',
    },
    {
      title: L === 'ja' ? 'ピアノロール' : 'PIANO ROLL',
      body: L === 'ja'
        ? 'メロディトラック選択時に自動表示。グリッドタップでノートを配置。ノートの長さはドラッグで調整可。スライドノートはSLDトグルで設定 (ポルタメント効果)。スケールモード ON 時はスケール外のノートが無効化されます。Poly ボイスでは同じステップに複数ノートを重ねてコード入力が可能。'
        : 'Shown automatically for melodic tracks. Tap to place notes. Drag note edges to adjust duration. SLD toggle enables slide (portamento). With scale mode ON, out-of-scale notes are disabled. With Poly voice, tap multiple notes on the same step to input chords.',
    },
    {
      title: L === 'ja' ? 'パフォーマンス' : 'PERFORMANCE',
      body: L === 'ja'
        ? 'FILL でフィルインを挿入。REV で逆再生。BRK でブレイク (リズムゲート)。KEY でルートノートを変更してキーを移調。'
        : 'FILL: insert fill-in. REV: reverse playback. BRK: rhythmic gate break. KEY changes root note for transposition.',
    },
    {
      title: L === 'ja' ? 'バーチャルキーボード' : 'VIRTUAL KEYBOARD',
      body: L === 'ja'
        ? '🎹 ボタンで ON/OFF。A〜; キーで演奏 (2列クロマチック配列)。Z/X でオクターブ上下 (ピアノロールと連動)。1〜9, 0 でベロシティ設定。'
        : 'Toggle with 🎹 button. Play notes with A–; keys (2-row chromatic layout). Z/X shifts octave (synced with piano roll). 1–9, 0 sets velocity.',
    },
    {
      title: L === 'ja' ? 'パターン' : 'PATTERNS',
      body: L === 'ja'
        ? 'PAT ◀▶ でパターン切り替え。00–19 はファクトリープリセット。再生中はバー境界で自動切り替え。CPY/PST でコピー&ペースト、CLR でクリア。パターン名クリックでリネーム (最大8文字)。カラードットで8色から色を設定でき、MatrixとSceneに反映されます。'
        : 'PAT ◀▶ to switch patterns. 00–19: factory presets. Switch at bar boundary during playback. CPY/PST to copy & paste, CLR to clear. Click pattern name to rename (max 8 chars). Color dot assigns one of 8 colors, reflected in Matrix and Scene views.',
    },
    {
      title: L === 'ja' ? 'シンセパラメータ & プリセット' : 'SYNTH PARAMS & PRESETS',
      body: L === 'ja'
        ? 'ドックパネルのノブをドラッグして音色を調整。パラメータは機能ごとにグループ化: 例 LEAD = FILTER | ENV | ARP、Synth = OSC | FILTER | ENV | LFO。\n\nプリセット: Synth/Poly ボイスでは PRESETS ボタンからファクトリープリセットを選択可能 (Lead, Bass, Pad, Pluck, Keys, FX の6カテゴリ)。\n\nP-Lock (パラメーターロック): LOCKモードで特定ステップのパラメータを個別に設定。ステップを選択 → LOCKをON → ノブを回すとそのステップだけに適用。CLR でロック解除。'
        : 'Drag knobs in the dock panel to shape the sound. Parameters grouped by function: e.g. LEAD = FILTER | ENV | ARP, Synth = OSC | FILTER | ENV | LFO.\n\nPresets: For Synth/Poly voices, click the PRESETS button to browse factory presets (6 categories: Lead, Bass, Pad, Pluck, Keys, FX).\n\nP-Lock (parameter lock): In LOCK mode, knob changes apply only to the selected step. Select a step → enable LOCK → turn knobs to set per-step values. CLR removes locks for that step.',
    },
    {
      title: L === 'ja' ? 'サンプラー' : 'SAMPLER',
      body: L === 'ja'
        ? 'SMPLカテゴリからSamplerを選択。LOADボタンまたはドラッグ&ドロップでオーディオファイルを読み込み。波形が表示されます。\n\nパラメータ: STRT/END (再生範囲), PTCH (ピッチシフト), DCY (ディケイ), REV (リバース再生)。\n\nChop: CHOPノブでスライス数 (8/16/32) を設定。MAPモードではノート番号でスライスを選択、SEQモードでは順番に再生。波形にスライス線が表示されます。P-Lockと組み合わせてブレイクビーツのパターンを作成可能。\n\nBPM同期: BPMノブでサンプルの元テンポを設定すると、曲のBPMに自動追従。LOOPでループ再生ON/OFF。STRCノブでRPTC (リピッチ: ピッチも変わる) とWSLA (WSOLA: ピッチ維持) を切り替え。'
        : 'Select Sampler from the SMPL category. Load audio via the LOAD button or drag & drop. The waveform is displayed.\n\nParams: STRT/END (playback range), PTCH (pitch shift), DCY (decay), REV (reverse).\n\nChop: Set slice count (8/16/32) with the CHOP knob. MAP mode selects slices by note number, SEQ mode plays slices sequentially. Slice lines appear on the waveform. Combine with P-Lock for complex breakbeat patterns.\n\nBPM sync: Set the sample\'s original tempo with the BPM knob — playback auto-syncs to song BPM. LOOP toggles loop playback. STRC knob switches between RPTC (repitch: pitch changes with speed) and WSLA (WSOLA: pitch-preserving timestretch).',
    },
    {
      title: 'GRID',
      body: L === 'ja'
        ? 'メインのステップシーケンサー。ステップをタップしてON/OFF。選択トラックにベロシティバー表示。メロディトラックではピアノロールも常時表示。'
        : 'The main step sequencer. Tap steps to toggle triggers. The selected track shows velocity bars, and melodic tracks display a piano roll.',
    },
    {
      title: L === 'ja' ? 'FX パッド' : 'FX PAD',
      body: L === 'ja'
        ? 'エフェクトノード (VERB, DLY, GLT, GRN) をドラッグしてパラメータ調整。タップでON/OFF。下部のセンドバーで各トラックのセンド量を設定。PerfBar の FX ボタンでオーバーレイシートとしても開けます。'
        : 'Drag effect nodes (VERB, DLY, GLT, GRN) to adjust parameters. Tap to toggle ON/OFF. Send bar at the bottom sets per-track send levels. Also accessible as an overlay sheet via the FX button in PerfBar.',
    },
    {
      title: 'EQ',
      body: L === 'ja'
        ? '3バンドEQ (LOW, MID, HIGH) とフィルターノードをドラッグして音質調整。フィルターは左=ローパス、右=ハイパス。ノードタップでON/OFF。PerfBar の EQ ボタンでオーバーレイシートとしても開けます。'
        : 'Drag 3-band EQ nodes (LOW, MID, HIGH) and filter node to shape tone. Filter sweeps LP (left) to HP (right). Tap nodes to toggle. Also accessible as an overlay sheet via EQ button in PerfBar.',
    },
    {
      title: L === 'ja' ? 'マスター' : 'MASTER',
      body: L === 'ja'
        ? '3つのXYパッド: COMP (コンプレッサー: X=スレッショルド, Y=レシオ)、DUCK (サイドチェイン: X=深さ, Y=リリース)、RET (FXリターン: X=リバーブ量, Y=ディレイ量)。タップでON/OFF、ドラッグで調整。右側にフェーダー: GAIN (マスター音量), MKP (メイクアップゲイン), SWG (スウィング)。VUメーターでL/Rピークを確認。'
        : 'Three XY pads: COMP (compressor: X=threshold, Y=ratio), DUCK (sidechain: X=depth, Y=release), RET (FX returns: X=reverb, Y=delay). Tap to toggle, drag to adjust. Right-side faders: GAIN (master volume), MKP (makeup gain), SWG (swing). VU meter shows L/R stereo peaks.',
    },
    {
      title: L === 'ja' ? 'マトリクスビュー' : 'MATRIX VIEW',
      body: L === 'ja'
        ? 'パターンプールをグリッド表示。各セルはパターンの密度を明るさで表現し、色はパターンカラーに対応。タップでパターン選択。ダブルタップでパターンシートを開く。シーンで使用中のパターンにはマーカーが表示されます。'
        : 'Grid overview of the pattern pool. Each cell shows pattern density as brightness, tinted with pattern color. Tap to select. Double-tap to open pattern sheet. Patterns used in the scene are marked.',
    },
    {
      title: L === 'ja' ? 'シーンビュー' : 'SCENE VIEW',
      body: L === 'ja'
        ? 'ノードベースのグラフで曲構成を作成。パターンノードをエッジで繋いで再生順を定義します。ルートノードから再生開始、分岐はランダムに選択、接続のないノードで停止。\n\nノードタイプ: パターン (楽曲データ), Transpose (移調), Tempo (BPM変更), Repeat (繰り返し), Probability (確率), FX (エフェクト切替)。\n\n操作: ノードをドラッグで移動。エッジポートからドラッグで接続。背景を長押しでバブルメニュー (ノード/ラベル追加)。パターンノードをダブルタップでパターンシート表示。Delete で選択中のノード/エッジを削除。ピンチでズーム。'
        : 'Node-based graph for song arrangement. Connect pattern nodes with edges to define playback order. Starts from root node, random pick at forks, stops at terminal nodes.\n\nNode types: Pattern (music data), Transpose, Tempo, Repeat, Probability, FX (effect toggle).\n\nInteractions: Drag nodes to reposition. Drag from edge ports to connect. Long-press background for bubble menu (add nodes/labels). Double-tap pattern node to open pattern sheet. Delete/Backspace removes selected node/edge. Pinch to zoom.',
    },
    {
      title: L === 'ja' ? 'KEY / スケール' : 'KEY / SCALE',
      body: L === 'ja'
        ? 'KEYはチャーチモード (教会旋法) に基づいています。ルートノートごとにモードが固定されており、スケールモード ON 時はそのモードの音階のみ使用できます。\n\nC — Ionian (メジャー)\nD — Dorian (マイナー系、明るめ)\nE — Phrygian (マイナー系、暗め)\nF — Lydian (メジャー系、浮遊感)\nG — Mixolydian (メジャー系、ブルージー)\nA — Aeolian (ナチュラルマイナー)\nB — Locrian (ディミニッシュ)\nC#/Eb/F#/Ab/Bb — Major'
        : 'KEY uses church modes (modal scales). Each root note has a fixed mode. With scale mode ON, only notes in that mode are available.\n\nC — Ionian (major)\nD — Dorian (minor, bright)\nE — Phrygian (minor, dark)\nF — Lydian (major, dreamy)\nG — Mixolydian (major, bluesy)\nA — Aeolian (natural minor)\nB — Locrian (diminished)\nC#/Eb/F#/Ab/Bb — Major',
    },
    {
      title: L === 'ja' ? 'キーボードショートカット' : 'KEYBOARD SHORTCUTS',
      body: L === 'ja'
        ? 'Space — 再生/停止\nCtrl+Z — 元に戻す\nCtrl+Shift+Z — やり直し\nEscape — シートを閉じる / 選択解除\nDelete — 選択したノード/エッジを削除\n↑↓ — エッジの並べ替え (エッジ選択時)\nCtrl+C — コピー (ノード/パターン)\nCtrl+Shift+C — サブグラフコピー\nCtrl+V — ペースト'
        : 'Space — Play/Stop\nCtrl+Z — Undo\nCtrl+Shift+Z — Redo\nEscape — Close sheet / deselect\nDelete — Remove selected node/edge\n↑↓ — Reorder edges (edge selected)\nCtrl+C — Copy (node/pattern)\nCtrl+Shift+C — Copy subgraph\nCtrl+V — Paste',
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
          {#each helpSections as section, i}
            {#if !filteredIndices || filteredIndices.includes(i)}
            <div class="help-section">
              <button
                class="section-head"
                class:open={filteredIndices ? true : openSections.has(i)}
                onpointerdown={() => toggleSection(i)}
              >
                <span class="section-arrow">{(filteredIndices || openSections.has(i)) ? '▾' : '▸'}</span>
                {section.title}
              </button>
              {#if filteredIndices || openSections.has(i)}
                <div class="section-body">{section.body}</div>
              {/if}
            </div>
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

  /* ── Collapsible sections ── */
  .help-section {
    border-bottom: 1px solid rgba(237,232,220,0.06);
  }

  .section-head {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.7);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-head:active,
  .section-head.open {
    color: rgba(237,232,220,0.9);
  }

  .section-arrow {
    font-size: 10px;
    color: rgba(237,232,220,0.35);
  }

  .section-body {
    padding: 0 12px 10px 24px;
    font-size: 11px;
    line-height: 1.6;
    color: rgba(237,232,220,0.55);
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
