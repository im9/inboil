<script lang="ts">
  import { lang, prefs, session, midiIn, toggleScaleMode, togglePatternEditor, toggleShowGuide, toggleLang } from '../state.svelte.ts'
  import { initMidi, startListening, stopListening } from '../midi.ts'
  import { startHost, joinAsGuest, disconnect } from '../multiDevice/connection.ts'
  import { resetDeltaSync } from '../multiDevice/deltaSync.ts'
  import { generateQrSvg } from '../qr.ts'

  const L = $derived(lang.value)

  const qrSvg = $derived(session.role === 'host' && session.roomCode
    ? generateQrSvg(session.roomCode)
    : '')

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

</script>

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
    <div class="setting-row jam-join-inputs">
      <input
        class="jam-input"
        type="text"
        maxlength="6"
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
  <p class="about-text">inboil v0.1.0 &mdash; &copy; INBOIL</p>
</div>

<style>
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
    border-bottom: 1px solid rgba(237,232,220,0.06);
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
    color: rgba(237,232,220,0.85);
    text-transform: uppercase;
  }
  .setting-row-desc {
    font-size: 10px;
    color: rgba(237,232,220,0.45);
    line-height: 1.3;
  }
  .setting-group {
    padding: 12px 16px;
  }
  .setting-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.45);
    text-transform: uppercase;
    display: block;
    margin-bottom: 8px;
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
  .btn-toggle.danger {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  /* ── MIDI (ADR 081) ── */
  .midi-select {
    background: transparent;
    border: 1px solid rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.7);
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 0;
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

  /* ── Jam session (ADR 019) ── */
  .jam-join-row { border-bottom: none !important; padding-bottom: 8px; }
  .jam-join-inputs {
    display: flex;
    gap: 6px;
    padding-top: 0;
  }
  .jam-input {
    background: transparent;
    border: 1px solid rgba(237,232,220,0.3);
    color: rgba(237,232,220,0.85);
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
    color: var(--color-danger);
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
    border-radius: 0;
  }
  .jam-connected {
    font-size: 10px;
    color: rgba(237,232,220,0.45);
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
    color: rgba(237,232,220,0.55);
    padding-left: 8px;
  }
</style>
