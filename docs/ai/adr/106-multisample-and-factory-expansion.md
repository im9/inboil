# ADR 106: Multi-Sample Mapping & Factory Sound Expansion

## Status: Implemented (Phase 1–3); Phase 4 future

## Context

SamplerVoice currently loads **one buffer per track**. Pitch is shifted mathematically from `rootNote` (default C4). This works well for drum one-shots and loops but degrades for pitched instruments — a grand piano sample played ±2 octaves from root sounds obviously artificial because timbre, harmonic content, and attack character change drastically across the keyboard.

### User Request

1. **Grand piano** as a factory instrument — needs multi-sample mapping to sound convincing
2. **Human voice one-shots** ("yeah", "ah", "oh", "hey") — single-sample is fine, but adds a new `vocals` factory category

### Current Architecture Constraints

- `SamplerVoice.loadSample(buffer, sampleRate)` accepts exactly one `Float32Array`
- Worklet command `loadSample` sends one buffer per `trackId`
- `samplesByTrack[trackId]` stores a single `SampleMeta { name, waveform, rawBuffer }`
- No concept of note-range zones or velocity layers

### Why Not a Dedicated Piano Synth?

Physical modelling piano (like Pianoteq) is extremely complex DSP — hundreds of coupled string resonators, soundboard simulation, hammer mechanics. Way beyond scope. Multi-sampled playback with 8–16 well-chosen samples delivers 90% of the quality at 1% of the complexity.

## Proposed Design

### A. Multi-Sample Zone Map

A **zone map** defines which sample plays for which note range:

```typescript
interface SampleZone {
  buffer: Float32Array    // audio data
  bufferSR: number        // sample rate
  rootNote: number        // MIDI note this sample was recorded at
  loNote: number          // lowest MIDI note for this zone (inclusive)
  hiNote: number          // highest MIDI note for this zone (inclusive)
  loVel?: number          // velocity layer lower bound (0–127, default 0)
  hiVel?: number          // velocity layer upper bound (0–127, default 127)
}
```

Zone selection on `noteOn(note, velocity)`:
1. Filter zones where `loNote <= note <= hiNote`
2. Among matches, filter by `loVel <= velocity*127 <= hiVel`
3. If multiple matches (overlapping zones), pick the zone whose `rootNote` is closest to `note`
4. Pitch-shift from zone's `rootNote` (not the global rootNote param)

**Fallback**: if no zone matches, use the closest zone by note distance (never silence).

### B. SamplerVoice Changes

```typescript
export class SamplerVoice implements Voice {
  // Existing single-buffer fields become the "default zone"
  private zones: SampleZone[] = []
  private activeZone: SampleZone | null = null  // selected zone for current note

  // New method — replaces loadSample for multi-sample use
  loadZones(zones: SampleZone[]): void {
    // Sort by loNote for binary search
    this.zones = zones.sort((a, b) => a.loNote - b.loNote)
    // Peak-normalize each zone independently
    for (const z of this.zones) this._normalizeBuffer(z.buffer)
  }

  // Existing loadSample becomes sugar for single-zone
  loadSample(buffer: Float32Array, bufferSR: number): void {
    this._normalizeBuffer(buffer)
    this.zones = [{
      buffer, bufferSR, rootNote: this.rootNote,
      loNote: 0, hiNote: 127, loVel: 0, hiVel: 127
    }]
  }

  noteOn(note: number, velocity: number): void {
    // Zone selection
    this.activeZone = this._findZone(note, velocity)
    if (!this.activeZone) return

    // Use zone's buffer and rootNote for pitch calculation
    const srRatio = this.activeZone.bufferSR / this.sr
    const semis = (note - this.activeZone.rootNote) + this.pitchShift
    this.rate = Math.pow(2, semis / 12) * srRatio
    // ... rest of noteOn logic uses this.activeZone.buffer
  }
}
```

**Key principle**: `tick()` reads from `this.activeZone.buffer` instead of `this.buffer`. All existing features (chop, WSOLA, reverse, loop) work unchanged — they operate on whichever buffer the zone selected.

### C. Worklet Command Extension

New command alongside existing `loadSample`:

```typescript
// Single sample (unchanged)
case 'loadSample': { ... }

// Multi-sample zone map
case 'loadZones': {
  const t = cmd.trackId ?? 0
  if (!(this.voices[t] instanceof SamplerVoice)) {
    this.voices[t] = new SamplerVoice(sampleRate)
  }
  (this.voices[t] as SamplerVoice).loadZones(cmd.zones)
}
```

Zone data is transferred via `Transferable` (ArrayBuffer transfer) to avoid copying.

### D. Factory Multi-Sample Packs

Factory packs are a new concept: a **pack manifest** that bundles multiple samples into a single instrument with pre-configured zone mapping.

#### Pack Manifest Format

Added to `factory.json`:

```jsonc
{
  "samples": [ /* ... existing 79 entries ... */ ],
  "packs": [
    {
      "id": "grand-piano",
      "name": "Grand Piano",
      "category": "keys",
      "zones": [
        { "file": "keys/piano-c2.webm", "rootNote": 36, "loNote": 21, "hiNote": 42 },
        { "file": "keys/piano-f2.webm", "rootNote": 41, "loNote": 43, "hiNote": 48 },
        { "file": "keys/piano-c3.webm", "rootNote": 48, "loNote": 49, "hiNote": 54 },
        { "file": "keys/piano-f3.webm", "rootNote": 53, "loNote": 55, "hiNote": 60 },
        { "file": "keys/piano-c4.webm", "rootNote": 60, "loNote": 61, "hiNote": 66 },
        { "file": "keys/piano-f4.webm", "rootNote": 65, "loNote": 67, "hiNote": 72 },
        { "file": "keys/piano-c5.webm", "rootNote": 72, "loNote": 73, "hiNote": 78 },
        { "file": "keys/piano-f5.webm", "rootNote": 77, "loNote": 79, "hiNote": 84 },
        { "file": "keys/piano-c6.webm", "rootNote": 84, "loNote": 85, "hiNote": 96 },
        { "file": "keys/piano-f6.webm", "rootNote": 89, "loNote": 97, "hiNote": 108 }
      ]
    }
  ]
}
```

#### Piano Source: Salamander Grand Piano V3

- **License**: Public domain (released 2022-03-04, formerly CC-BY 3.0)
- **Source**: Yamaha C5 grand, AKG C414 mics
- **Original**: 88 keys × 16 velocity layers, 48kHz/24bit (~1.1 GB)
- **For inboil**: Subset of ~10 notes (every augmented 4th: C2, F2, C3, F3, C4, F4, C5, F5, C6, F6), single velocity layer (mf), trimmed to ~3s sustain, transcoded to WebM/Opus
- **Estimated size**: ~200–300KB total (10 samples × 20–30KB each)
- **Quality tradeoff**: ±3 semitones of pitch shift per zone = acceptable for piano timbre. Wider intervals would audibly warp the hammer attack.

### E. New Factory Category: Vocals

Single-sample one-shots (no multi-sample needed — pitch-shifting voices is musically desirable):

| Sample | Source | License | Est. Size |
|--------|--------|---------|-----------|
| yeah | Freesound CC0 | CC0 | ~8KB |
| ah | Freesound CC0 | CC0 | ~6KB |
| oh | Freesound CC0 | CC0 | ~6KB |
| hey | Freesound CC0 | CC0 | ~8KB |
| ooh | Freesound CC0 | CC0 | ~8KB |
| huh | Freesound CC0 | CC0 | ~5KB |

**Total**: ~40–60KB — negligible addition to factory bundle.

These go in `factory/vocals/` as regular pool entries (no zone mapping). The sampler's existing pitch-shift makes them instantly usable as vocal chops.

### F. UI: Pack Browser in DockPanel

The existing pool browser gains a new section or visual treatment for packs:

- Packs appear as a single entry with a keyboard icon (🎹) in the pool browser
- Tapping a pack loads all zones to the current track automatically
- Pack name displayed in track header (e.g., "Grand Piano" instead of individual sample name)
- Individual samples from a pack are also browsable in their folder (e.g., `factory/keys/`)

### G. State & Persistence

#### samplesByTrack Extension

```typescript
// Current
interface SampleMeta {
  name: string
  waveform: Float32Array
  rawBuffer: ArrayBuffer
}

// Extended
interface SampleMeta {
  name: string
  waveform: Float32Array      // overview of first/primary zone
  rawBuffer: ArrayBuffer       // primary zone buffer (single-sample compat)
  packId?: string              // if loaded from a pack
  zones?: SampleZoneMeta[]     // multi-sample zone data
}

interface SampleZoneMeta {
  name: string
  rawBuffer: ArrayBuffer
  sampleRate: number
  rootNote: number
  loNote: number
  hiNote: number
}
```

#### Persistence

- **Factory packs**: Only `packId` is persisted in project save. On load, zones are re-fetched from the factory pool (they're already installed in OPFS).
- **User multi-samples**: Full zone buffers persisted in per-project IndexedDB (same as current single samples, just multiple entries per track).

### H. Size Budget

| Addition | Samples | Compressed Size |
|----------|---------|----------------|
| Grand Piano (10 zones) | 10 | ~250KB |
| Vocals (6 one-shots) | 6 | ~45KB |
| **Total new** | **16** | **~295KB** |
| Current factory total | 79 | ~970KB |
| **New factory total** | **95** | **~1,265KB** |

+30% factory size — still well under 2MB. First-launch install remains fast on any connection.

## Phases

### Phase 1: Multi-Sample Engine (worklet-only)

- Add `SampleZone` type and `zones[]` array to `SamplerVoice`
- Implement `_findZone(note, velocity)` with fallback
- Refactor `noteOn`/`tick`/`slideNote` to read from `activeZone`
- Add `loadZones` worklet command
- Existing `loadSample` becomes single-zone sugar — **zero breaking changes**
- Unit tests: zone selection, velocity layers, fallback, pitch calculation

### Phase 2: Factory Piano & Vocals

- Source Salamander Grand Piano subset, transcode to WebM/Opus
- Source 6 vocal one-shots from Freesound (CC0 only)
- Add `packs` array to `factory.json`
- Add `keys/` and `vocals/` factory folders
- Bump factory pool version (v2 → v3)
- `installFactorySamples` handles pack installation + zone metadata

### Phase 3: UI & Persistence

- Pack browser entries in DockPanel pool browser
- Pack-aware `setSample` / `samplesByTrack` extension
- Pack-aware project save/load (persist `packId`, re-hydrate zones from pool)
- Pack name in track header display

### Phase 4 (Future): User Multi-Sample Packs

- UI for creating custom zone maps from pool samples
- Drag samples onto a keyboard range visualizer
- Velocity layer assignment
- Save/load user packs

## Alternatives Considered

### A. SFZ File Format Support

Import standard SFZ instrument definitions. Rejected: SFZ is a complex format with hundreds of opcodes. Parsing it fully is a rabbit hole. Our zone map is a minimal subset that covers the core use case.

### B. Dedicated Piano VoiceId

A separate `'Piano'` voice with hardcoded sample loading. Rejected: multi-sample is a general capability that benefits any pitched instrument (strings, brass, mallets). Building it into the sampler is more composable.

### C. WebAudio API Sample Playback (Main Thread)

Use `AudioBufferSourceNode` for each note. Rejected: can't integrate with our worklet DSP chain (per-track FX, sidechain, automation). All audio must go through the worklet.

## References

- ADR 012: Sampler — base sampler architecture
- ADR 065: Sampler Chop & Timestretch — chop/WSOLA features that must work with zones
- ADR 104: Audio Pool — OPFS storage and factory sample infrastructure
- Salamander Grand Piano V3: https://github.com/sfzinstruments/SalamanderGrandPiano (public domain)
- Freesound: https://freesound.org (CC0 filter for vocal samples)
