<script lang="ts">
  import { onMount } from 'svelte'
  import { song, activeCell, ui, lang, prefs, clearAllParamLocks, setTrackSend, toggleLang, toggleScaleMode, togglePatternEditor, toggleDockPosition, factoryReset } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import Knob from './Knob.svelte'
  import FxPad from './FxPad.svelte'
  import FilterView from './FilterView.svelte'

  const track  = $derived(song.tracks[ui.selectedTrack])
  const TRACK_ABBR = ['KK', 'SN', 'CP', 'CH', 'OH', 'CY', 'BS', 'LD']
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const L = $derived(lang.value)

  function closeToParam() { ui.dockTab = 'param' }

  // ── Help sections ──
  let openSections = $state(new Set<number>([0]))
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
        ? 'SPACEキーで再生/停止を切り替えられます。グリッドをタップしてステップのON/OFFを切り替えられます。RANDボタンでランダムパターンを生成できます。'
        : 'SPACE to play/stop. Tap the grid to toggle steps ON/OFF. RAND generates a random pattern.',
    },
    {
      title: L === 'ja' ? 'トラック' : 'TRACKS',
      body: L === 'ja'
        ? '8トラック構成です: KICK, SNARE, CLAP, C.HH, O.HH, CYM (ドラム) + BASS, LEAD (メロディ)。トラック名をタップして選択できます。VOL/PANノブで音量とパンを調整できます。Mボタンでミュートできます。'
        : '8 tracks: KICK, SNARE, CLAP, C.HH, O.HH, CYM (drums) + BASS, LEAD (melodic). Tap track name to select. VOL/PAN knobs adjust volume and panning. M button to mute.',
    },
    {
      title: L === 'ja' ? 'ベロシティ & ステップ数' : 'VELOCITY & STEPS',
      body: L === 'ja'
        ? '選択トラックの下にベロシティバーが表示されます。上下ドラッグで各ステップの音量を調整できます。VEL下の数字をタップしてステップ数を変更できます (2〜64)。'
        : 'Velocity bars appear below the selected track. Drag up/down to adjust per-step volume. Tap the number below VEL to cycle step count (2–64).',
    },
    {
      title: L === 'ja' ? 'ピアノロール' : 'PIANO ROLL',
      body: L === 'ja'
        ? 'メロディトラック (BASS/LEAD) 選択時にピアノロールが自動表示されます。グリッドをタップしてノートを配置できます。'
        : 'The piano roll is shown automatically for melodic tracks (BASS/LEAD). Tap the grid to place notes.',
    },
    {
      title: L === 'ja' ? 'パフォーマンス' : 'PERFORMANCE',
      body: L === 'ja'
        ? 'FILL でフィルインを挿入します。REV で逆再生します。BRK でブレイク (リズムゲート) をかけます。KEY でルートノートを変更してキーを移調できます。'
        : 'FILL: insert fill-in. REV: reverse playback. BRK: rhythmic gate break. KEY changes root note for transposition.',
    },
    {
      title: L === 'ja' ? 'バーチャルキーボード' : 'VIRTUAL KEYBOARD',
      body: L === 'ja'
        ? '🎹 ボタンでバーチャルキーボードを ON/OFF します。A〜; キーで選択トラックの音を演奏できます (2列クロマチック配列)。Z/X でオクターブを上下でき、ピアノロールの表示範囲と連動します。1〜9, 0 でベロシティを設定できます。'
        : 'Toggle the virtual keyboard with the 🎹 button. Play notes on the selected track with A–; keys (2-row chromatic layout). Z/X shifts octave up/down, synced with the piano roll view. 1–9, 0 sets velocity.',
    },
    {
      title: L === 'ja' ? 'パターン' : 'PATTERNS',
      body: L === 'ja'
        ? 'PAT ◀▶ でパターンを切り替えられます。00–19 はファクトリープリセットです。再生中はバーの境界で自動的に切り替わります。CPY で現在のパターンをコピー、別スロットに移動して PST でペースト、CLR でパターンをクリアできます。'
        : 'PAT ◀▶ to switch patterns. 00–19: factory presets. During playback, switch happens at the bar boundary. CPY copies the current pattern, navigate to another slot and PST to paste, CLR clears the pattern.',
    },
    {
      title: L === 'ja' ? 'シンセパラメータ' : 'SYNTH PARAMS',
      body: L === 'ja'
        ? 'サイドパネルのノブをドラッグして音色を調整できます。パラメータは機能ごとにセパレーターで区切られています。例: LEAD = FILTER (CUT/MOD/RESO/FDCY) | ENV (ATCK/ADCY/SUST/RLS) | ARP (ARP/RATE/CHRD/AOCT)。アルペジエーターは1ノートから自動的にアルペジオパターンを生成し、KEYのスケールに沿ったコードが鳴ります。'
        : 'Drag knobs in the side panel to shape the sound. Parameters are grouped by function with visual separators. Example: LEAD = FILTER (CUT/MOD/RESO/FDCY) | ENV (ATCK/ADCY/SUST/RLS) | ARP (ARP/RATE/CHRD/AOCT). The arpeggiator generates patterns from a single note, using scale-aware chords that follow the KEY setting.',
    },
    {
      title: 'GRID',
      body: L === 'ja'
        ? 'メインのステップシーケンサーです。各トラックのステップをタップしてON/OFFを切り替えます。選択トラックにはベロシティバーが表示され、メロディトラックではピアノロールも常時表示されます。'
        : 'The main step sequencer. Tap steps to toggle triggers ON/OFF. The selected track shows velocity bars, and melodic tracks always display a piano roll.',
    },
    {
      title: L === 'ja' ? 'FX パッド' : 'FX PAD',
      body: L === 'ja'
        ? 'エフェクトノード (VERB, DLY, GLT, GRN) をドラッグしてパラメータを調整します。タップでON/OFFを切り替えます。下部のセンドバーで各トラックのセンド量とパンを設定できます。'
        : 'Drag effect nodes (VERB, DLY, GLT, GRN) to adjust parameters. Tap to toggle ON/OFF. The send bar at the bottom sets per-track send levels and panning.',
    },
    {
      title: 'EQ',
      body: L === 'ja'
        ? '3バンドEQ (LOW, MID, HIGH) とフィルターのノードをドラッグして音質を調整します。フィルターは左でローパス、右でハイパスに変化します。各ノードをタップでON/OFFできます。'
        : 'Drag 3-band EQ nodes (LOW, MID, HIGH) and a filter node to shape the tone. Filter sweeps from low-pass (left) to high-pass (right). Tap nodes to toggle ON/OFF.',
    },
    {
      title: L === 'ja' ? 'チェーン' : 'CHAIN',
      body: L === 'ja'
        ? 'パターンを順番に並べて曲構成をつくります。+ ADD で現在のパターンを追加。◀▶ でパターンを変更、×N でリピート回数を設定します。FX (VRB/DLY/GLT/GRN) はトグル＋ノブでセンド量を調整できます。PERF (FILL/BRK/REV) はラストリピートで発動し、長さ (BAR/½/¼/1S) も設定可能です。KEY で転調、行番号タップでジャンプ、⏮ で先頭に戻ります。ON/OFF で途中再開もできます。'
        : 'Arrange patterns into a song structure. + ADD appends the current pattern. ◀▶ changes pattern, ×N sets repeat count. FX (VRB/DLY/GLT/GRN) toggle + knob for send amount. PERF (FILL/BRK/REV) triggers on the last repeat with adjustable length (BAR/½/¼/1S). KEY for transposition, tap row number to jump, ⏮ to rewind. ON/OFF resumes from current position.',
    },
  ])

  // ── System tab ──
  let confirmReset = $state(false)
  function handleReset() {
    factoryReset()
    confirmReset = false
  }

  // ── Hover guide (listener always active, display only in HELP tab) ──
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
</script>

<div class="dock-panel" class:bottom={ui.dockPosition === 'bottom'}>
  <!-- ── Tab bar ── -->
  <div class="dock-tabs">
    {#each ['param', 'fx', 'eq', 'help', 'sys'] as tab}
      <button
        class="dock-tab"
        class:active={ui.dockTab === tab}
        onpointerdown={() => { ui.dockTab = tab as typeof ui.dockTab }}
      >{tab === 'param' ? 'PRM' : tab.toUpperCase()}</button>
    {/each}
  </div>

  {#if ui.dockTab === 'help'}
    <!-- ── HELP mode ── -->
    <div class="mode-head">
      <span class="mode-title">HELP</span>
      <div class="mode-head-right">
        <button class="btn-lang" onpointerdown={toggleLang}
          data-tip="Toggle language" data-tip-ja="言語を切り替え"
        >{L === 'ja' ? 'EN' : 'JP'}</button>
        <button class="btn-close" onpointerdown={closeToParam}>&times;</button>
      </div>
    </div>
    <div class="dock-body">
      <div class="help-content">
        {#each helpSections as section, i}
          <div class="help-section">
            <button
              class="section-head"
              class:open={openSections.has(i)}
              onpointerdown={() => toggleSection(i)}
            >
              <span class="section-arrow">{openSections.has(i) ? '▾' : '▸'}</span>
              {section.title}
            </button>
            {#if openSections.has(i)}
              <div class="section-body">{section.body}</div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    <div class="guide-footer" class:active={guideText}>
      <span class="guide-label">GUIDE</span>
      <p class="guide-text">{guideText || (L === 'ja' ? 'UI要素にカーソルを合わせると説明が表示されます' : 'Hover over any element to see its description')}</p>
    </div>

  {:else if ui.dockTab === 'sys'}
    <!-- ── SYSTEM mode ── -->
    <div class="mode-head">
      <span class="mode-title">SYSTEM</span>
      <button class="btn-close" onpointerdown={closeToParam}>&times;</button>
    </div>
    <div class="dock-body">
      <div class="sys-content">
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
          <span class="setting-label">{L === 'ja' ? '言語' : 'LANGUAGE'}</span>
          <button class="btn-toggle" onpointerdown={toggleLang}>
            {L === 'ja' ? 'EN' : 'JP'}
          </button>
        </div>

        <div class="setting-group about">
          <span class="setting-label">ABOUT</span>
          <p class="about-text">inboil v0.1.0</p>
        </div>
      </div>
    </div>
    <div class="sys-footer">
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

  {:else if ui.dockTab === 'fx'}
    <!-- ── FX mode ── -->
    <div class="mode-head">
      <span class="mode-title">FX</span>
      <button class="btn-close" onpointerdown={closeToParam}>&times;</button>
    </div>
    <div class="dock-body dock-fx">
      <FxPad />
    </div>

  {:else if ui.dockTab === 'eq'}
    <!-- ── EQ mode ── -->
    <div class="mode-head">
      <span class="mode-title">EQ</span>
      <button class="btn-close" onpointerdown={closeToParam}>&times;</button>
    </div>
    <div class="dock-body dock-fx">
      <FilterView />
    </div>

  {:else}
    <!-- ── PARAM mode (default) ── -->
    <div class="dock-body">
        <div class="param-content">
          <!-- Track selector bar -->
          <div class="track-bar">
            {#each song.tracks as _t, i}
              <button
                class="track-btn"
                class:active={i === ui.selectedTrack}
                class:muted={_t.muted}
                onpointerdown={() => { ui.selectedTrack = i }}
                data-tip={_t.name} data-tip-ja={_t.name}
              >{TRACK_ABBR[i] ?? _t.name.slice(0, 2)}</button>
            {/each}
            <button
              class="btn-dock-pos"
              onpointerdown={toggleDockPosition}
              data-tip={ui.dockPosition === 'right' ? 'Move dock to bottom' : 'Move dock to right'}
              data-tip-ja={ui.dockPosition === 'right' ? 'ドックを下に移動' : 'ドックを右に移動'}
            >{ui.dockPosition === 'right' ? '⇩' : '⇨'}</button>
          </div>

          <div class="lock-row">
            <button
              class="btn-lock"
              class:active={ui.lockMode}
              onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
              data-tip="Parameter lock mode" data-tip-ja="パラメーターロックモード"
            >LOCK</button>
            {#if ui.lockMode && ui.selectedStep !== null}
              <span class="lock-label">STEP{ui.selectedStep + 1}</span>
              <button class="btn-clr" class:hidden={!hasAnyLock} onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
            {/if}
          </div>

          <!-- Synth param knobs (multi-row grid) -->
          <div class="knob-grid">
            {#each params as p, i}
              {#if i > 0 && p.group && p.group !== params[i - 1].group}
                <div class="param-sep-row" aria-hidden="true"></div>
              {/if}
              <span data-tip={p.tip ?? 'Drag to adjust'} data-tip-ja={p.tipJa ?? 'ドラッグで調整'}>
                <Knob
                  value={normalizeParam(p, knobValue(p))}
                  label={p.label}
                  size={32}
                  locked={isParamLocked(p.key)}
                  steps={paramSteps(p)}
                  displayValue={displayLabel(p, knobValue(p))}
                  onchange={v => knobChange(p, v)}
                />
              </span>
            {/each}
          </div>

          <!-- Send knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="knob-grid">
            <span data-tip="Reverb send amount" data-tip-ja="リバーブセンド量">
              <Knob value={activeCell(ui.selectedTrack).reverbSend} label="VERB" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
            </span>
            <span data-tip="Delay send amount" data-tip-ja="ディレイセンド量">
              <Knob value={activeCell(ui.selectedTrack).delaySend} label="DLY" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
            </span>
            <span data-tip="Glitch send amount" data-tip-ja="グリッチセンド量">
              <Knob value={activeCell(ui.selectedTrack).glitchSend} label="GLT" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
            </span>
            <span data-tip="Granular send amount" data-tip-ja="グラニュラーセンド量">
              <Knob value={activeCell(ui.selectedTrack).granularSend} label="GRN" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
            </span>
          </div>

          <!-- Mixer knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="knob-grid">
            <span data-tip="Track volume" data-tip-ja="トラック音量">
              <Knob value={track.volume} label="VOL" size={32} onchange={v => { song.tracks[ui.selectedTrack].volume = v }} />
            </span>
            <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
              <Knob value={(track.pan + 1) / 2} label="PAN" size={32} onchange={v => { song.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
            </span>
          </div>
        </div>
    </div>
  {/if}
</div>

<style>
  .dock-panel {
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(237,232,220,0.08);
    overflow: hidden;
  }

  /* ── Bottom dock overrides ── */
  .dock-panel.bottom {
    width: 100%;
    height: auto;
    max-height: 200px;
    border-left: none;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-direction: row;
  }
  .dock-panel.bottom .dock-body {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .dock-panel.bottom .param-content {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 8px 12px;
    flex-wrap: nowrap;
  }
  .dock-panel.bottom .track-bar {
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
    width: auto;
    flex-shrink: 0;
  }
  .dock-panel.bottom .track-btn {
    padding: 2px 6px;
  }
  .dock-panel.bottom .lock-row {
    flex-direction: column;
    margin-bottom: 0;
    flex-shrink: 0;
  }
  .dock-panel.bottom .knob-grid {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  .dock-panel.bottom .section-divider {
    width: 1px;
    height: auto;
    align-self: stretch;
    margin: 0 4px;
  }

  /* ── Tab bar ── */
  .dock-tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .dock-tab {
    flex: 1;
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.30);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 6px 0;
    text-align: center;
    text-transform: uppercase;
    border-bottom: 2px solid transparent;
  }
  .dock-tab:not(:last-child) {
    border-right: 1px solid rgba(237,232,220,0.06);
  }
  .dock-tab.active {
    color: rgba(237,232,220,0.80);
    border-bottom-color: var(--color-olive);
  }

  /* ── Mode header (HELP / SYSTEM) ── */
  .mode-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(237,232,220,0.1);
    flex-shrink: 0;
  }
  .mode-title {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
  }
  .mode-head-right {
    display: flex;
    align-items: center;
    gap: 6px;
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

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .dock-fx {
    display: flex;
    overflow: hidden;
  }

  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px;
  }
  .param-minimal {
    padding: 24px 12px;
    text-align: center;
  }
  .param-hint {
    font-size: 10px;
    color: rgba(237,232,220,0.35);
    margin: 0;
  }

  /* ── Track selector bar ── */
  .track-bar {
    display: flex;
    gap: 2px;
    margin-bottom: 8px;
  }
  .track-btn {
    flex: 1;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.4);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 4px 0;
    text-align: center;
  }
  .track-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .track-btn.muted:not(.active) {
    opacity: 0.35;
  }
  .btn-dock-pos {
    flex-shrink: 0;
    width: 22px;
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .btn-dock-pos:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.7);
  }

  .lock-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  .btn-lock {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.45);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .lock-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
  }
  .btn-clr {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.5);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr.hidden { visibility: hidden; }
  .btn-clr:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 4px 0;
  }
  .param-sep-row {
    width: 100%;
    height: 1px;
    background: rgba(237,232,220,0.08);
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: rgba(237,232,220,0.12);
    margin: 8px 0;
  }

  /* ── HELP mode ── */
  .help-content {
    padding: 0;
  }
  .btn-lang {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
  }
  .btn-lang:active { background: rgba(237,232,220,0.15); }

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
  .section-head.open { color: rgba(237,232,220,0.9); }
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

  /* ── Hover guide footer ── */
  .guide-footer {
    flex-shrink: 0;
    padding: 10px 12px;
    border-top: 1px solid rgba(237,232,220,0.08);
    min-height: 52px;
  }
  .guide-label {
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.25);
    text-transform: uppercase;
  }
  .guide-footer.active .guide-label { color: var(--color-olive); }
  .guide-text {
    font-size: 11px;
    line-height: 1.5;
    color: rgba(237,232,220,0.35);
    margin: 4px 0 0;
    transition: color 120ms;
  }
  .guide-footer.active .guide-text { color: rgba(237,232,220,0.7); }

  /* ── SYS tab ── */
  .sys-content {
    padding: 0;
  }
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
  .setting-desc {
    font-size: 10px;
    line-height: 1.5;
    color: rgba(237,232,220,0.35);
    margin: 6px 0 0;
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

  /* ── SYS footer (reset) ── */
  .sys-footer {
    flex-shrink: 0;
    padding: 12px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
    margin-top: auto;
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
  .btn-reset-cancel:active { background: rgba(237,232,220,0.15); }
</style>
