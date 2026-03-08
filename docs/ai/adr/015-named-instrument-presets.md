# ADR 015: Presets & Pattern Templates

## Status: In Progress (built-in synth presets done, user presets + templates pending)

## Context

inboil has 18 voice types across 4 categories (drum, bass, lead, sampler). The iDEATH synth already has 35 built-in presets with a category browser in DockPanel. However:

1. **Only iDEATH has presets** — drum voices and other synths (Bass303, MoogLead, FM, Analog) have no presets
2. **No user presets** — users can't save their own parameter tweaks for recall
3. **Fixed default pattern template** — every new pattern starts with the same 8-track layout (6 drums + bass + lead). No alternative starting points
4. **Factory patterns are genre demos** — good for first impression, but not useful as compositional starting templates

### Current Architecture

- **Voice system:** 18 voices, per-cell voiceId (any track can be any voice)
- **Preset browser:** `presets.ts` defines `SynthPreset` type + 35 iDEATH presets in 6 categories (lead/bass/pad/pluck/keys/fx). DockPanel shows browser when `hasPresets(voiceId)` returns true
- **Preset application:** `applyPreset()` merges params into cell's `voiceParams`, pushes undo
- **Factory patterns:** 21 built-in patterns in `factory.ts` with per-track voice param overrides (`vp` field)
- **Default tracks:** Fixed in `TRACK_DEFAULTS` (Kick/Snare/Clap/Hat/OpenHat/Cymbal/Bass303/MoogLead)

## Proposed Design

### A. Extend Built-in Presets to More Voices

Add presets for drum voices and other synths. Same `SynthPreset` type, same DockPanel UI — just expand `hasPresets()` and add preset data.

```typescript
// presets.ts — extend existing system
// Current: only iDEATH presets
// New: presets for any voice with tweakable character

// Drum presets: voiceId-specific parameter snapshots
// e.g. Kick presets: "808 Sub", "Punchy", "Lo-fi Thud", "Clicky"
// e.g. Snare presets: "Tight", "Trap", "Brushy", "Noise Blast"

// Bass303 presets: "Acid", "Sub", "Reese"
// MoogLead presets: "Fat Lead", "Brass", "Soft"
// FM presets: "Bell", "Pluck", "Metallic"
```

**Change `hasPresets()` to return true for any voice with presets.** The existing UI handles the rest.

### B. User Presets (IndexedDB)

Users can save and recall their own voiceParams snapshots.

```typescript
// storage.ts — add 'presets' object store (ADR 020 §C planned this)
interface StoredUserPreset {
  id?: number              // auto-increment
  voiceId: VoiceId         // which voice this preset is for
  name: string             // user-given name (max 16 chars)
  category: string         // user-chosen or auto (e.g. 'custom')
  params: Record<string, number>
  createdAt: number
}
```

**UI flow:**
1. User tweaks knobs to desired sound
2. Long-press on preset name area → "SAVE PRESET" prompt (inline text input)
3. Saved presets appear in preset browser alongside built-ins, tagged "USER"
4. Swipe-to-delete or long-press-to-delete on user presets

**Storage:** IndexedDB `presets` store (DB version bump to 3). Not tied to project — presets are global (available across all projects).

### C. Pattern Templates

Replace the fixed `TRACK_DEFAULTS` with selectable starting templates for new patterns.

```typescript
interface PatternTemplate {
  id: string
  name: string        // e.g. "Standard", "4 Sampler", "Minimal"
  tracks: {
    name: string
    voiceId: VoiceId
    note: number
    pan: number
  }[]                 // 8 entries
}

const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: 'standard', name: 'Standard',
    // Current default: 6 drums + bass + lead
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'CYM',   voiceId: 'Cymbal',   note: 60, pan:  0.25 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10 },
    ],
  },
  {
    id: 'sampler-4', name: '4 Sampler',
    // 4 drums + 4 sampler tracks
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',    note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',   note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',     note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat', note: 60, pan:  0.35 },
      { name: 'SMP1',  voiceId: 'Sampler', note: 60, pan: -0.20 },
      { name: 'SMP2',  voiceId: 'Sampler', note: 60, pan:  0.20 },
      { name: 'SMP3',  voiceId: 'Sampler', note: 60, pan: -0.40 },
      { name: 'SMP4',  voiceId: 'Sampler', note: 60, pan:  0.40 },
    ],
  },
  {
    id: 'minimal', name: 'Minimal',
    // 4 drums + 2 bass/lead + 2 sampler
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'LEAD',  voiceId: 'iDEATH',   note: 64, pan:  0.10 },
      { name: 'SMP1',  voiceId: 'Sampler',  note: 60, pan: -0.20 },
      { name: 'SMP2',  voiceId: 'Sampler',  note: 60, pan:  0.20 },
    ],
  },
  {
    id: 'synth-heavy', name: 'Synth',
    // 3 drums + 5 synths
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'PAD',   voiceId: 'iDEATH',   note: 60, pan: -0.15 },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10 },
      { name: 'ARP',   voiceId: 'FM',       note: 60, pan:  0.20 },
      { name: 'FX',    voiceId: 'iDEATH',   note: 60, pan:  0.00 },
    ],
  },
]
```

**Template application:** When creating a new empty pattern (not new project), user can pick a template. The template sets cell voiceId/name for all 8 tracks. Trigs are empty.

**Note:** Templates operate at the **pattern** level (cell voiceId per-pattern, ADR 042). Track-level properties (volume, mute) are unchanged.

### D. No Drum Kit Concept

The original ADR 015 proposed "drum kits" — bundling 6 drum tracks as a named set. This is **dropped** because:

- Cell-based voiceId means any track can be any voice; "drum tracks 0-5" is no longer a fixed concept
- Pattern templates achieve the same goal more flexibly
- Individual drum presets (Section A) let users shape each drum independently
- Kit concept adds complexity (tracking which kit is loaded, partial overrides) without proportional benefit

## Implementation Order

1. ~~Built-in iDEATH presets (35 presets, 6 categories)~~ Done
2. ~~Preset browser UI in DockPanel~~ Done
3. Extend built-in presets to drum voices + Bass303/MoogLead/FM/Analog
4. Pattern templates (data + factory.ts integration)
5. Template selector UI (pattern creation flow)
6. User preset save/load (IndexedDB `presets` store, DB v3)
7. User preset management UI (save, delete, rename)

## Consequences

- **Positive:** Built-in presets for all voices — instant sound exploration without tweaking
- **Positive:** User presets enable personal sound library, persisted across projects
- **Positive:** Pattern templates provide flexible starting points beyond the fixed default
- **Positive:** No drum kit abstraction — simpler model, per-cell voiceId is sufficient
- **Positive:** Existing preset browser UI handles everything — minimal new UI needed
- **Negative:** More preset data to maintain (but it's just static param snapshots)
- **Dependency:** ADR 020 (IndexedDB) — user presets need `presets` store
- **Dependency:** ADR 042 (Cell model) — templates set cell-level voiceId
