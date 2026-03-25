# ADR 122: FX & Master Audio Design

## Status: In Progress (Phase 1)

## Context

The current FX and master bus architecture has grown organically and lacks a clear design framework for what belongs where. This causes confusion when adding new effects or adjusting existing ones.

### Current architecture

```
Track voices ──┬── dry (pan, volume) ──────────────────────────────┐
               ├── reverbSend ──► VERB (Room/Hall/Shimmer) ──┐    │
               ├── delaySend  ──► DLY  (Digi/Dotted/Tape)  ──┤    │
               ├── glitchSend ──► GLT  (Crush/Redux/Stutter)─┤    │
               └── granSend   ──► GRN  (Cloud/Stretch)  ─────┤    │
                                                              ▼    ▼
Per-track insert FX (2 slots):                            SidechainDucker
  verb | delay | glitch                                       │
                                                         BusCompressor
                                                              │
                                                          PeakingEQ ×3
                                                              │
                                                           DJ Filter
                                                              │
                                                          Break gate
                                                              │
                                                        TapeSaturator (SAT)
                                                              │
                                                          Master gain
                                                              │
                                                         PeakLimiter
```

### Problems

1. **No distortion/saturation as per-track effect** — insert FX types are `verb | delay | glitch`. Users want distortion/overdrive on individual tracks (bass, drums), not just master.

2. **TapeSaturator identity crisis** — originally implemented as "tape saturation" (tanh distortion), reworked to tape compression (asymmetric soft-knee). The name says "saturator" but the behavior is "compressor with color." User wants DECO Classic (vacuum tube) character but current implementation is more cassette-like.

3. **No clear design principle** for what goes where:
   - Master bus: processing that affects the final mix (comp, EQ, limiter, sat)
   - Send FX: shared effects with per-track send levels (reverb, delay, glitch, granular)
   - Insert FX: per-track serial chain (currently only verb/delay/glitch)

### Current code

- Master bus: `TapeSaturator` (`effects.ts:451`), `BusCompressor` (`effects.ts:154`), `PeakLimiter` (`effects.ts:189`), `SidechainDucker` (`effects.ts:137`)
- Send FX: `SimpleReverb`/`ModulatedReverb`/`ShimmerReverb`, `PingPongDelay`/`TapeDelay`, `GranularProcessor`, `StutterBuffer` (all in `effects.ts`)
- Insert FX: `WorkletInsertFx.type: 'verb' | 'delay' | 'glitch'` (`types.ts:71`)
- Master pad: `sat: { on, x: drive, y: tone }` in `EngineContext.masterPad` (`engine.ts:15`)

## Decision

### 1. Design principles

| Layer | Purpose | Character | Examples |
|---|---|---|---|
| **Insert FX** | Shape individual track sound | Creative, per-track | Distortion, saturation, chorus, phaser |
| **Send FX** | Shared spatial/textural effects | Ambient, shared | Reverb, delay, granular, glitch |
| **Master bus** | Final mix polish | Transparent, subtle | Compression, EQ, limiting, tape warmth |

**Rule of thumb**: if you'd want different settings per track, it's an insert. If it's shared space, it's a send. If it's mix glue, it's master.

### 2. Add distortion/saturation as insert FX type

Add `'dist'` to `WorkletInsertFx.type`:

```typescript
type: 'verb' | 'delay' | 'glitch' | 'dist' | null
```

Distortion insert with XY pad control:
- **X**: drive (0–1 → clean to heavy)
- **Y**: tone (0–1 → dark to bright)
- **Flavours**: `overdrive` (soft, tube-like) / `fuzz` (hard clip) / `bitcrush` (digital)

### 3. Rename and refine TapeSaturator

Rename to `MasterTape` or keep `TapeSaturator` but clarify its role as **master bus tape coloring** — not distortion. Refine toward DECO Classic character:

- Add mid-frequency presence boost (~1.5–3kHz shelf, subtle)
- Widen the soft-knee for smoother compression onset
- Keep head bump and hiss as tape character elements
- At low drive: nearly transparent warmth. At high drive: gentle, musical compression

### 4. Insert FX distortion engine

New class `Distortion` in `effects.ts`:

```typescript
export class Distortion {
  // Overdrive: tube-style asymmetric saturation with cabinet-like tone shaping
  // Fuzz: hard clip with even/odd harmonic blend
  // Bitcrush: sample rate reduction + bit depth (moved from glitch send?)
}
```

Overdrive flavour should have:
- Pre-EQ boost (mid push before saturation)
- Asymmetric soft clip (similar principle to TapeSaturator but more aggressive)
- Post-EQ (cabinet simulation — LP + resonance)
- Mix control (parallel processing)

## Considerations

- **Bitcrush overlap**: glitch send already has crush/redux. Insert bitcrush would be per-track with mix control — different use case (subtle lo-fi vs destructive send effect). Could share DSP code.
- **CPU budget**: Distortion per-track is cheap (transfer function + filters). No concern.
- **Insert slot count**: Currently 2 slots per track (ADR 114). Distortion fits in existing slots.
- **Migration**: Adding `'dist'` to insert type union is backwards compatible (existing saves don't use it).
- **TapeSaturator tuning**: "Classic tube" vs "cassette" is largely about the saturation curve shape and mid-frequency emphasis. Can be iterated by ear without architectural changes.

## Implementation Phases

### Phase 1: Insert distortion

Implementation Checklist:
- [ ] Unit tests for Distortion class (TDD — tests before implementation)
- [ ] `Distortion` class in `effects.ts` — overdrive (asymmetric soft clip + cabinet LP) and fuzz (hard clip + harmonic blend)
  - X: drive (0–1 → 0.5–8.0 gain), Y: tone (0–1 → LP cutoff 800Hz–16kHz)
  - Overdrive: pre-EQ mid boost → asymmetric tanh → post-EQ cabinet LP
  - Fuzz: hard clip with ceiling → mix even/odd harmonics
- [ ] Add `'dist'` to `CellInsertFx.type` union (`types.ts`)
- [ ] Add `'dist'` to `WorkletInsertFx.type` union + `fuzz?: boolean` flag (`dsp/types.ts`)
- [ ] Add `DistFlavour` type + `FX_FLAVOURS.dist` entries (`constants.ts`)
- [ ] Add `'dist'` to `InsertFxSlot.type` union + `distortion?: Distortion` field (`worklet-processor.ts`)
- [ ] Wire `_createInsertSlot` / `_updateInsertParams` / `_processInsert` for dist
- [ ] Add default flavour `'overdrive'` in `setInsertFxType` (`stepActions.ts`)
- [ ] DockTrackEditor: add DIST to type selector, overdrive/fuzz flavour buttons, DRIVE/TONE knob labels
- [ ] `pnpm check` + `pnpm test` pass

### Phase 2: TapeSaturator refinement
- Add mid-presence boost (~2kHz) for Classic tube character
- Widen soft-knee curve
- Ear-test with reference material (DECO Classic, Studer console saturation)

### Phase 3: Glitch/dist boundary cleanup — SKIPPED
- Reviewed: send (shared bus, destructive) and insert (per-track, mix control) are standard separate systems (cf. Elektron, Ableton). No unification needed.
- Bitcrush stays as insert glitch flavour only; dist keeps overdrive/fuzz. Roles are distinct.

### Phase 4: FX dock style refinement

FX on/off and HOLD visibility improvements in DockFxControls:

**Per-FX color on toggle labels**
- Currently all `.fx-dock-toggle.active` use `--color-olive`
- Apply per-FX color when active:
  - VERB: `--color-olive`
  - DLY: `--color-blue`
  - GLT: `--color-salmon`
  - GRN: `--color-purple`
  - FLTR: `--color-teal`
- Flavour buttons and HOLD toggle also use the parent FX's color when active
- Matches the FxPad canvas color coding — consistent mental model across dock and pad

**EQ band on/off toggle in dock**
- DockEqControls has `pad.on` state and `.disabled` opacity, but no toggle button to control it
- Add a clickable label button (same pattern as FX toggle) per EQ band: LOW / MID / HIGH
- Currently the `.eq-dock-label` is a plain `<span>` — convert to a button that toggles `fxPad[bandKey].on`
- Allows users to bypass individual EQ bands without opening the FxPad overlay

**Move DJ Filter from FX to Master section**
- DJ Filter is master bus processing (EQ → DJ Filter → Saturator → Limiter) but currently lives in DockFxControls as "FLTR"
- Has no corresponding node on the FxPad XY canvas — the only FX dock entry without pad representation
- Was added in ADR 075 Phase 2 alongside send FX dock controls, then carried over to DockFxControls during the component split refactor — never intentionally placed in FX
- Move to DockMasterControls as a master pad section (same pattern as COMP/DUCK/RET/SAT)
- Add DJ Filter node to MasterPad XY canvas with `--color-teal`
- Master pad nodes become: COMP / DUCK / RET / SAT / FLTR (5 nodes)
- Remove from DockFxControls and FX_SECTIONS config

**Master dock toggle colors aligned with MasterPad**
- DockMasterControls toggles (SAT, COMP, DUCK, RET) all use `--color-olive` when active
- MasterView pad nodes have per-section colors:
  - COMP: `--color-olive`
  - DUCK: `--color-blue`
  - RET: `--color-salmon`
  - SAT: `--color-purple`
- Apply matching per-section colors to dock toggle `.active` state
- Consistent color coding between pad visualization and dock controls

**HOLD label repositioning**
- Move HOLD label from left side to immediately left of the toggle switch (same row, adjacent)
- Current layout: `HOLD .......................... [switch]` (gap too wide)
- New layout: knobs row has no HOLD label; hold row is compact: `HOLD [switch]` right-aligned
- This makes the association between label and toggle immediately clear

**Dock layout: FX/EQ/Master always accessible**
- Currently FX/EQ/Master controls only appear in dock during overlay sheet mode (split layout)
- In normal scene view, dock shows PATTERN + TRACKS/SCENE tabs — no FX controls at all
- DJ Filter lived in FX dock since ADR 075 but went unnoticed because of this
- Add FX/EQ/MASTER as dock tab options alongside TRACKS/SCENE, so controls are accessible from any view
- Compact each section to fit: per-FX color labels double as on/off toggles (Phase 4 items above), tighter knob spacing
- If vertical space is too tight, fall back to collapsible accordion sections within the tab
- Goal: no FX control should require a specific view mode to access

## Future Extensions

- **Amp sim**: Guitar/bass amp modeling as insert FX (preamp + cabinet IR)
- **Chorus/phaser/flanger**: Classic modulation effects as insert types
- **Per-track EQ**: Parametric EQ as insert FX (currently only master bus)
- **Waveshaper**: Custom transfer curve editor for insert distortion
