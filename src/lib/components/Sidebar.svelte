<script lang="ts">
  import { onMount } from 'svelte'
  import { ui, lang, prefs, toggleLang, toggleScaleMode, factoryReset } from '../state.svelte.ts'

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

  // ── Hover guide ──
  let guideText = $state('')

  onMount(() => {
    function onOver(e: Event) {
      if (ui.sidebar !== 'help') return
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

  $effect(() => {
    if (ui.sidebar !== 'help') guideText = ''
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
      title: L === 'ja' ? 'パターン' : 'PATTERNS',
      body: L === 'ja'
        ? 'PAT ◀▶ でパターンを切り替えられます。00–19 はファクトリープリセットです。再生中はバーの境界で自動的に切り替わります。'
        : 'PAT ◀▶ to switch patterns. 00–19: factory presets. During playback, switch happens at the bar boundary.',
    },
    {
      title: L === 'ja' ? 'シンセパラメータ' : 'SYNTH PARAMS',
      body: L === 'ja'
        ? '下部パネルのノブをドラッグして音色を調整できます。パラメータは機能ごとにセパレーターで区切られています。例: LEAD = FILTER (CUT/MOD/RESO/FDCY) | ENV (ATCK/ADCY/SUST/RLS) | ARP (ARP/RATE/CHRD/AOCT)。アルペジエーターは1ノートから自動的にアルペジオパターンを生成し、KEYのスケールに沿ったコードが鳴ります。'
        : 'Drag knobs in the bottom panel to shape the sound. Parameters are grouped by function with visual separators. Example: LEAD = FILTER (CUT/MOD/RESO/FDCY) | ENV (ATCK/ADCY/SUST/RLS) | ARP (ARP/RATE/CHRD/AOCT). The arpeggiator generates patterns from a single note, using scale-aware chords that follow the KEY setting.',
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
        {:else}
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
          </div>

        {/if}
      </div>
    {/if}

    {#if visibleMode === 'help'}
      <div class="guide-footer" class:active={guideText}>
        <span class="guide-label">GUIDE</span>
        <p class="guide-text">{guideText || (L === 'ja' ? 'UI要素にカーソルを合わせると説明が表示されます' : 'Hover over any element to see its description')}</p>
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

<style>
  .sidebar {
    position: absolute;
    right: 0;
    bottom: 0;
    top: 0;
    width: 280px;
    z-index: 20;
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
  .guide-footer.active .guide-label {
    color: var(--color-olive);
  }
  .guide-text {
    font-size: 11px;
    line-height: 1.5;
    color: rgba(237,232,220,0.35);
    margin: 4px 0 0;
    transition: color 120ms;
  }
  .guide-footer.active .guide-text {
    color: rgba(237,232,220,0.7);
  }

  .sidebar-footer {
    flex-shrink: 0;
    padding: 12px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
    margin-top: auto;
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
</style>
