# ADR 081: Hardware MIDI Keyboard Input (Web MIDI API)

## Status: Proposed

## Context

ADR 031 implemented a virtual keyboard via PC keys. The `PatternToolbar.svelte` `handleVkbdKeyDown` → `engine.triggerNote()` pipeline is operational. However, external MIDI keyboards (USB MIDI, Bluetooth MIDI) are not yet supported.

The Web MIDI API (`navigator.requestMIDIAccess()`) is fully supported in Chrome / Edge / Opera. USB MIDI devices are plug-and-play, and Bluetooth MIDI devices paired at the OS level are recognized through the same API. Firefox has experimental flag support only; Safari is unsupported.

### Scope

Overlaps with ADR 016 Phase 2 (MIDI Input), but this ADR is scoped to **input only**:

- MIDI Output (→ external synths) → ADR 016 Phase 1
- MIDI Clock sync → ADR 016 Phase 3
- VST/AU Bridge → ADR 016 Phase 4–5

Accepted as a Chrome + desktop app (Tauri, ADR 073) only feature.

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

MIDI input merges into the existing vkbd pipeline. Shares `engine.triggerNote()` / `engine.releaseNote()` and reuses the same audition / step-record / live-record modes from ADR 031.

### State

```typescript
// src/lib/state.svelte.ts — adjacent to vkbd
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

Phase 1 reuses the existing mono releaseNote as-is. Phase 2 adds per-note noteOff to the worklet.

### Per-Note Release (Phase 2)

Currently `engine.releaseNote(trackId)` releases the entire track. Hardware MIDI keyboards require individual noteOff per key:

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

Add MIDI settings to the Sidebar SYSTEM section:

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

- Enable toggle: switches `midiIn.enabled`, calls `startListening()` / `stopListening()`
- Device dropdown: `All` (receive from all devices) or specific device
- Channel dropdown: `Omni` (all channels) or 1–16
- Device list: real-time connection status (auto-updated via `onstatechange`)

### PatternToolbar Integration

Add a MIDI indicator next to the vkbd button:

```
[⌨ C4]  [MIDI ●]     ← ● = receiving, ○ = enabled but idle
```

The dot blinks (CSS animation) while MIDI messages are being received.

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

No special API needed. When a BLE MIDI device is paired via macOS Audio MIDI Setup / Windows Bluetooth settings, the OS exposes it as a standard MIDI device, automatically visible through the Web MIDI API. No additional code required.

Latency: BLE MIDI adds ~10–20ms delay. Acceptable for step input and audition. For real-time recording, quantization absorbs the latency.

## Implementation Phases

1. **Phase 1: Basic Input** — `initMidi()`, `handleMessage()`, noteOn/Off → existing `engine.triggerNote/releaseNote`. Sidebar UI (enable toggle + device list). ~100 LOC.
2. **Phase 2: Per-Note Release** — `releaseNoteByPitch` worklet command. Polyphonic support.
3. **Phase 3: CC Mapping** — Modulation wheel (CC1) → filter cutoff, pitch bend → detune. Learn mode (receive CC → auto-assign to parameter).
4. **Phase 4: Step/Live Record** — Shared with ADR 031 Phase 2/3. Integration of MIDI input into step-record and live-record modes.

## Considerations

- **HTTPS required**: Web MIDI API requires a secure context (HTTPS or localhost). Vite dev server (`localhost`) and Cloudflare Pages (HTTPS) are both fine
- **Permission prompt**: Browser shows a MIDI access permission prompt. One-click approval when `sysex: false`
- **Latency**: USB MIDI < 1ms, BLE MIDI ~10–20ms. Combined with AudioWorklet processing delay (128 samples ≈ 2.7ms @48kHz), still within acceptable range
- **Security**: Requesting with `sysex: false` prevents SysEx message send/receive. Only standard noteOn/noteOff/CC messages

## Future Extensions

- MIDI Output (ADR 016 Phase 1): send track triggers to external synths
- MIDI Clock (ADR 016 Phase 3): tempo sync with external gear
- MIDI Learn for all knobs: assign CC numbers to DockPanel knobs
- MPE (MIDI Polyphonic Expression): support for expressive controllers like Roli Seaboard
