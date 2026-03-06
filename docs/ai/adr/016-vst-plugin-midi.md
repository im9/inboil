# ADR 016: VST Plugin Integration & MIDI

## Status: Proposed

## Context

inboil currently runs entirely in-browser using Web Audio API + AudioWorklet for DSP. All synthesis is done by built-in C++/WASM voices. Users cannot load external VST/AU plugins or send/receive MIDI — limiting integration with existing DAW workflows and hardware.

### Goals

1. **Load third-party VST/AU plugins** as instruments or effects on tracks
2. **Synchronized playback** — plugins follow inboil's transport (BPM, play/stop)
3. **MIDI output** — send trigger data (note on/off, velocity, CC) to external synths/DAWs
4. **MIDI input** — receive MIDI from controllers/keyboards for real-time note input

### Constraints

- Web Audio API has **no native VST/AU hosting capability** — browsers cannot load native plugins
- Web MIDI API exists but only handles MIDI messages, not audio plugin hosting
- AudioWorklet runs in a separate thread with no DOM/native API access
- Cross-origin and sandboxing restrictions prevent loading arbitrary native code

## Proposed Design

### Architecture Overview

Two complementary approaches, addressing different use cases:

```
┌──────────────────────────────────────────────────┐
│  A. Web MIDI (browser-native)                    │
│  ─ MIDI out to external synths/DAWs             │
│  ─ MIDI in from controllers                      │
│  ─ No plugin hosting, just messages              │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  B. Companion App Bridge (native)                │
│  ─ Local native app hosts VST/AU plugins         │
│  ─ WebSocket/SharedArrayBuffer bridge            │
│  ─ Audio streams back to browser via loopback    │
└──────────────────────────────────────────────────┘
```

---

### A. Web MIDI Integration

The Web MIDI API (`navigator.requestMIDIAccess()`) enables direct MIDI I/O from the browser. This is the primary integration path — it requires no native companion app.

#### MIDI Output (inboil → external)

Each track can optionally route its trigger data as MIDI messages:

```typescript
interface MidiOutputConfig {
  enabled: boolean
  portId: string        // Web MIDI output port ID
  channel: number       // MIDI channel 1–16
  sendCC: boolean       // also send voice param changes as CC
  ccMapping: Record<string, number>  // voiceParam key → CC number
}

interface Track {
  // existing fields...
  midiOut?: MidiOutputConfig
}
```

**Trigger flow:**
1. Sequencer fires a trig → worklet sends `{ note, velocity, trackId }` to main thread
2. Main thread checks `track.midiOut.enabled`
3. If enabled, sends MIDI Note On (channel, note, velocity) via Web MIDI API
4. On step advance, sends MIDI Note Off for previous note
5. Optionally: knob changes send CC messages in real-time

**Transport sync:**
- Send MIDI Clock (0xF8) at 24 ppqn derived from BPM
- Send Start (0xFA) / Stop (0xFC) with playback state
- External devices/DAWs slave to inboil's clock

```typescript
class MidiClockSender {
  private output: MIDIOutput
  private intervalId: number = 0

  start(bpm: number) {
    const tickMs = 60000 / bpm / 24  // 24 ppqn
    this.output.send([0xFA])  // MIDI Start
    this.intervalId = setInterval(() => {
      this.output.send([0xF8])  // MIDI Clock tick
    }, tickMs)
  }

  stop() {
    clearInterval(this.intervalId)
    this.output.send([0xFC])  // MIDI Stop
  }
}
```

#### MIDI Input (external → inboil)

Receive MIDI from keyboards, pad controllers, or DAWs:

```typescript
interface MidiInputConfig {
  enabled: boolean
  portId: string
  channel: number | 'omni'  // listen channel or all
  mode: 'live' | 'record'   // live = play notes immediately, record = write to trigs
}
```

**Live mode:** Incoming Note On → triggers the selected track's voice immediately (audition). No sequencer involvement.

**Record mode:** While playing, incoming notes are quantized to the nearest step and written into the selected track's trigs (overdub recording).

```typescript
function handleMidiInput(msg: MIDIMessageEvent) {
  const [status, note, velocity] = msg.data
  const cmd = status & 0xF0
  const ch = status & 0x0F

  if (cmd === 0x90 && velocity > 0) {
    // Note On
    if (midiInput.mode === 'live') {
      triggerVoiceImmediate(ui.selectedTrack, note, velocity / 127)
    } else if (midiInput.mode === 'record' && playback.playing) {
      const step = playback.playheads[ui.selectedTrack]
      setTrigNote(ui.selectedTrack, step, note)
      setTrigVelocity(ui.selectedTrack, step, velocity / 127)
    }
  }
}
```

#### UI: MIDI Settings

- **Global MIDI page** (accessible from settings/gear icon):
  - List detected MIDI inputs/outputs
  - Enable/disable Web MIDI access
  - MIDI clock master on/off
- **Per-track MIDI routing** (in ParamPanel or track settings):
  - Output port + channel selector
  - CC mapping editor (param → CC number)
  - "MIDI only" toggle (mutes internal voice, only sends MIDI)

---

### B. Companion App Bridge (VST/AU Hosting)

Browsers cannot load native VST/AU plugins. A companion native app bridges this gap.

#### Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   inboil    │ ◄──────────────── │  inboil-bridge   │
│  (browser)  │   param/trigger    │  (native app)    │
│             │ ──────────────── │                  │
│  Web Audio  │   audio stream     │  VST/AU host     │
│  AudioWorklet│ ◄═══════════════ │  JUCE / CLAP     │
└─────────────┘   (loopback audio) └──────────────────┘
```

#### inboil-bridge (Native Companion)

A lightweight native application (Electron, Tauri, or standalone JUCE app) that:

1. **Hosts VST3/AU/CLAP plugins** using JUCE or a plugin hosting library
2. **Receives trigger/param data** from inboil via WebSocket
3. **Routes audio output** to a virtual audio device (loopback) or returns audio frames via SharedArrayBuffer
4. **Exposes plugin parameter list** to inboil UI for knob mapping

```
inboil-bridge protocol (WebSocket JSON):
→ { type: 'loadPlugin', path: '/Library/Audio/Plug-Ins/VST3/Serum.vst3', trackId: 6 }
← { type: 'pluginLoaded', trackId: 6, params: [{ id: 0, name: 'Cutoff', min: 0, max: 1 }, ...] }
→ { type: 'noteOn', trackId: 6, note: 48, velocity: 0.8, params: { 0: 0.65, 3: 0.4 } }
→ { type: 'noteOff', trackId: 6, note: 48 }
→ { type: 'paramChange', trackId: 6, paramId: 0, value: 0.72 }
→ { type: 'transport', playing: true, bpm: 128, position: 0 }
```

#### Audio Return Path

Three options for getting plugin audio back into inboil:

1. **Virtual loopback** (BlackHole/JACK): Plugin audio → virtual device → browser captures via `getUserMedia`. Simplest but adds latency.
2. **SharedArrayBuffer**: Bridge writes PCM frames to shared memory → AudioWorklet reads directly. Lowest latency but requires cross-origin isolation headers (COOP/COEP).
3. **WebSocket audio streaming**: Binary frames over WebSocket. Moderate latency, most portable.

**Recommendation:** Start with option 1 (loopback) for simplicity. Upgrade to SharedArrayBuffer for latency-critical use.

#### Track State Extension

```typescript
interface ExternalPluginConfig {
  bridgeUrl: string      // WebSocket URL to companion app
  pluginPath: string     // native plugin file path
  pluginParams: { id: number; name: string; value: number }[]
  audioInputId?: string  // MediaStream device ID for audio return
}

interface Track {
  // existing fields...
  externalPlugin?: ExternalPluginConfig
}
```

When `externalPlugin` is set, the track's internal voice is bypassed. Triggers are sent to the bridge instead of the AudioWorklet.

---

### C. CLAP Web Extension (Future)

The CLAP plugin format has a [proposed WebAssembly extension](https://github.com/free-audio/clap) that could eventually allow running plugins directly in the browser via WASM. This is experimental and not yet viable, but worth monitoring as a long-term path to native-free plugin hosting.

## Implementation Order

1. **Phase 1: Web MIDI Output** — send notes/CC to external gear. Minimal UI (per-track toggle + port selector). Enables hardware synth integration immediately.
2. **Phase 2: Web MIDI Input** — receive from controllers. Live + record modes. Enables keyboard/pad input.
3. **Phase 3: MIDI Clock** — transport sync. External devices follow inboil BPM.
4. **Phase 4: Companion Bridge (proof of concept)** — WebSocket protocol, single plugin hosting, loopback audio.
5. **Phase 5: Full Bridge** — multi-track plugin hosting, SharedArrayBuffer audio, parameter mapping UI.

## Consequences

- **Positive:** MIDI output alone unlocks integration with hardware synths, DAWs, and external gear — huge workflow upgrade.
- **Positive:** MIDI input enables real-time performance and recording from controllers.
- **Positive:** Companion bridge is opt-in — inboil remains fully functional without it.
- **Positive:** WebSocket protocol is language-agnostic — bridge could be JUCE, Rust, Python, etc.
- **Negative:** Web MIDI API requires user permission grant and HTTPS context.
- **Negative:** Companion bridge adds deployment/install complexity (user must run a separate app).
- **Negative:** Audio loopback adds latency (typically 5–20ms). SharedArrayBuffer reduces this but requires COOP/COEP headers.
- **Negative:** VST/AU licensing — some plugins may not work in a non-DAW host context.
- **Risk:** Browser MIDI clock timing may jitter (not sample-accurate). Acceptable for most use cases, may need worker-based timing for tight sync.
- **Risk:** SharedArrayBuffer requires cross-origin isolation which may conflict with other features (e.g., third-party scripts, CDN assets).
- **Dependency:** Phase 4–5 requires a separate native application codebase (new repo).
- **Dependency:** Benefits from ADR 009 (instrument selection) for track-level plugin assignment UI.
