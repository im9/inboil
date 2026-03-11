# ADR 081: Hardware MIDI Keyboard Input (Web MIDI API)

## Status: Proposed

## Context

ADR 031 で PC キーボードによるバーチャルキーボードを実装済み。`PatternToolbar.svelte` の `handleVkbdKeyDown` → `engine.triggerNote()` パイプラインが稼働中。しかし外部 MIDI キーボード（USB MIDI、Bluetooth MIDI）からの入力には未対応。

Web MIDI API (`navigator.requestMIDIAccess()`) は Chrome / Edge / Opera で完全サポートされており、USB MIDI デバイスはプラグ＆プレイ、Bluetooth MIDI は OS 側でペアリング済みなら同じ API で認識される。Firefox は実験的フラグのみ、Safari は未対応。

### Scope

ADR 016 の Phase 2（MIDI Input）と重複するが、本 ADR は **入力のみ** にスコープを限定：

- MIDI Output (→ 外部シンセ) → ADR 016 Phase 1
- MIDI Clock sync → ADR 016 Phase 3
- VST/AU Bridge → ADR 016 Phase 4–5

Chrome + デスクトップアプリ (Tauri, ADR 073) 限定機能として割り切る。

## Decision

### Architecture

```
USB MIDI keyboard ──┐
                    ├─→ OS MIDI driver ─→ navigator.requestMIDIAccess()
BLE MIDI (OS paired)┘                          │
                                         MIDIInput.onmidimessage
                                               │
                                     ┌─────────▼──────────┐
                                     │   midiInputHandler  │
                                     │  (src/lib/midi.ts)  │
                                     └─────────┬──────────┘
                                               │ noteOn / noteOff
                                               ▼
PC keyboard → keyToMidi() ──→ vkbd pipeline (engine.triggerNote / releaseNote)
```

MIDI 入力は既存の vkbd パイプラインに合流。`engine.triggerNote()` / `engine.releaseNote()` を共有し、audition / step-record / live-record モードも ADR 031 と同じロジックを使う。

### State

```typescript
// src/lib/state.svelte.ts — vkbd に隣接
export const midiIn = $state({
  available: false,         // Web MIDI API detected
  enabled: false,           // user toggle
  devices: [] as MidiDevice[],
  activeDeviceId: '',       // selected input port ID ('' = all)
  channel: 0 as number,    // 0 = omni, 1–16 = filter
})

interface MidiDevice {
  id: string
  name: string
  manufacturer: string
  connected: boolean
}
```

### Core Module: `src/lib/midi.ts`

```typescript
let access: MIDIAccess | null = null

export async function initMidi(): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false
  try {
    access = await navigator.requestMIDIAccess()
    midiIn.available = true
    refreshDeviceList()
    access.onstatechange = refreshDeviceList  // hot-plug
    return true
  } catch {
    return false
  }
}

function refreshDeviceList() {
  if (!access) return
  midiIn.devices = [...access.inputs.values()].map(input => ({
    id: input.id,
    name: input.name ?? 'Unknown',
    manufacturer: input.manufacturer ?? '',
    connected: input.state === 'connected',
  }))
}

export function startListening() {
  if (!access) return
  access.inputs.forEach(input => {
    input.onmidimessage = handleMessage
  })
}

export function stopListening() {
  if (!access) return
  access.inputs.forEach(input => {
    input.onmidimessage = null
  })
}

function handleMessage(e: MIDIMessageEvent) {
  if (!midiIn.enabled) return
  const [status, note, velocity] = e.data!
  const cmd = status & 0xF0
  const ch = (status & 0x0F) + 1  // MIDI channels 1-16

  // Channel filter
  if (midiIn.channel !== 0 && ch !== midiIn.channel) return

  // Device filter
  const port = e.target as MIDIInput
  if (midiIn.activeDeviceId && port.id !== midiIn.activeDeviceId) return

  if (cmd === 0x90 && velocity > 0) {
    // Note On — reuse vkbd pipeline
    engine.triggerNote(ui.selectedTrack, note, velocity / 127)
  } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
    // Note Off
    engine.releaseNote(ui.selectedTrack)
  }
}
```

### Differences from PC Virtual Keyboard

| Aspect | PC vkbd (ADR 031) | Hardware MIDI (this ADR) |
|--------|-------------------|--------------------------|
| Note range | 17 keys (1.5 octaves) | Full 88 keys |
| Velocity | Fixed (`vkbd.velocity`) | Per-note from hardware |
| Polyphony | Mono (releaseNote on all-keys-up) | Per-note noteOff (Phase 2) |
| Octave shift | Z/X keys | Not needed (hardware has full range) |
| NoteOff | All-release model | Individual noteOff per key |

Phase 1 では既存の mono releaseNote をそのまま使う。Phase 2 で per-note noteOff をワークレットに追加。

### Per-Note Release (Phase 2)

現在 `engine.releaseNote(trackId)` はトラック全体のリリース。MIDI キーボードでは個別の noteOff が必要：

```typescript
// engine.ts — new method
releaseNoteByPitch(trackId: number, note: number): void {
  this._post({ type: 'releaseNoteByPitch', trackId, note })
}

// worklet-processor.ts — new handler
case 'releaseNoteByPitch': {
  const voice = voices[msg.trackId]
  if (voice.currentNote === msg.note) {
    voice.noteOff()
  }
  break
}
```

### UI: Sidebar SYSTEM Panel

Sidebar の SYSTEM セクションに MIDI 設定を追加：

```
┌─────────────────────────────────┐
│  MIDI INPUT                     │
│  ┌─────────────────────────┐    │
│  │ ● Enabled          [ON] │    │
│  │ Device: [All ▼]         │    │
│  │ Channel: [Omni ▼]       │    │
│  └─────────────────────────┘    │
│                                 │
│  Connected:                     │
│   ● KORG nanoKEY2              │
│   ○ Arturia KeyStep (offline)  │
└─────────────────────────────────┘
```

- Enable トグル: `midiIn.enabled` を切替、`startListening()` / `stopListening()` を呼ぶ
- Device ドロップダウン: `All` (全デバイス受信) or 特定デバイス
- Channel ドロップダウン: `Omni` (全チャンネル) or 1–16
- デバイスリスト: 接続状態をリアルタイム表示（`onstatechange` で自動更新）

### PatternToolbar Integration

vkbd ボタンの隣に MIDI インジケータを追加：

```
[⌨ C4]  [MIDI ●]     ← ● = receiving, ○ = enabled but idle
```

MIDI メッセージ受信中はドットが点滅（CSS animation）。

### Browser Compatibility & Fallback

```typescript
// Feature detection
if (!navigator.requestMIDIAccess) {
  midiIn.available = false
  // UI: hide MIDI settings, show "MIDI not supported in this browser"
}
```

- Chrome / Edge / Opera: full support
- Firefox: `dom.webmidi.enabled` flag (user must manually enable)
- Safari: not supported — hide UI entirely
- Tauri desktop app (ADR 073): Chromium engine = full support

### Bluetooth MIDI

特別な API は不要。macOS の Audio MIDI 設定 / Windows の Bluetooth 設定で BLE MIDI デバイスをペアリングすると、OS が通常の MIDI デバイスとして公開し、Web MIDI API から自動で見える。追加コード不要。

レイテンシ: BLE MIDI は ~10–20ms の遅延。ステップ入力やオーディション用途なら問題なし。リアルタイムレコーディングではクオンタイズで吸収。

## Implementation Phases

1. **Phase 1: Basic Input** — `initMidi()`, `handleMessage()`, noteOn/Off → existing `engine.triggerNote/releaseNote`. Sidebar UI (enable toggle + device list). ~100 LOC.
2. **Phase 2: Per-Note Release** — `releaseNoteByPitch` worklet command. ポリフォニック対応。
3. **Phase 3: CC Mapping** — モジュレーションホイール (CC1) → filter cutoff, ピッチベンド → detune. Learn mode (CC 受信 → パラメータ自動割当).
4. **Phase 4: Step/Live Record** — ADR 031 Phase 2/3 と共通。MIDI 入力からステップレコード・リアルタイムレコードへの統合。

## Considerations

- **HTTPS 必須**: Web MIDI API は secure context (HTTPS or localhost) でのみ利用可能。Vite dev server (`localhost`) と Cloudflare Pages (HTTPS) は問題なし
- **パーミッション**: ブラウザが MIDI アクセス許可プロンプトを表示。sysex を要求しなければワンクリック許可
- **レイテンシ**: USB MIDI は < 1ms、BLE MIDI は ~10–20ms。AudioWorklet の処理遅延 (128 samples ≈ 2.7ms @48kHz) と合わせても許容範囲
- **セキュリティ**: `sysex: false` で要求すれば SysEx メッセージは送受信不可。一般的な noteOn/noteOff/CC のみ

## Future Extensions

- MIDI Output (ADR 016 Phase 1): トラックのトリガーを外部シンセに送信
- MIDI Clock (ADR 016 Phase 3): 外部機器とのテンポ同期
- MIDI Learn for all knobs: DockPanel のノブに CC 番号を割当
- MPE (MIDI Polyphonic Expression): Roli Seaboard 等の表現力の高いコントローラ対応
