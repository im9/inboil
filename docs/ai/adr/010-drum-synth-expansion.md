# ADR 010: Drum Synth Expansion

## Status: Proposed

## Context

The current drum palette has 6 fixed voices: Kick, Snare, Clap, Closed HH, Open HH, Cymbal. All are hardcoded to tracks 0–5 in `makeVoice()`. While the sounds are well-tuned for hyperpop, users cannot swap drum types (e.g. put a different kick character on track 0) or access additional percussion timbres.

### Current Drum Voices

| Voice | Technique | Character |
|-------|-----------|-----------|
| KickVoice | Sine pitch sweep + click + tanh drive | TR-909 style |
| SnareVoice | Tone + filtered noise, dual VCA | TR-909 style |
| ClapVoice | 4 noise bursts + decay tail | Analog clap |
| HatVoice | 6 metallic oscillators + HP | Crispy closed hat |
| OpenHatVoice | Same as HatVoice, longer decay | Open hat |
| CymbalVoice | 6 oscillators, wider ratios + body burst | Crash cymbal |

### Missing Percussion Types

- **808 Kick** — longer, boomy sub-bass kick with pitch sustain (trap/hyperpop staple)
- **Rimshot / Cross-stick** — short tonal + noise transient
- **Tom** — pitched sine sweep, mid-range (fills, rolls)
- **Cowbell** — dual detuned square oscillators, BP filter
- **Shaker / Maracas** — filtered noise with amplitude modulation

**Note on cymbals/rides:** Cymbal-type sounds (crash, ride, splash) are extremely difficult to synthesize convincingly — even hardware drum machines like the TR-909 used PCM samples for cymbals while keeping kick/snare/clap as analog. The current CymbalVoice has been extensively tuned but remains the weakest-sounding voice. Cymbal/ride sounds are better served by the sampler approach (ADR 012) with lazy-loaded PCM samples (~25KB compressed per sample). The existing CymbalVoice remains as a zero-dependency fallback.

## Proposed Design

### New Voice Classes (in `voices.ts`)

1. **Kick808Voice** — Long sine body (60–120Hz), minimal pitch sweep, sub-heavy, tanh warmth. Params: `tone`, `decay`, `drive`.
2. **RimshotVoice** — Short sine ping (800Hz) + noise burst blend. Params: `tone`, `decay`, `noiseAmt`.
3. **TomVoice** — Sine pitch sweep (300→120Hz), moderate decay, optional drive. Params: `pitch`, `decay`, `drive`.
4. **CowbellVoice** — Two detuned square oscillators (587Hz, 845Hz), BP filter, fast decay. Params: `decay`, `filterFc`, `detune`.
5. **ShakerVoice** — Amplitude-modulated filtered noise (BP 3–8kHz), LFO-gated. Params: `decay`, `tone`, `rate`.

### Integration

Each new voice implements the existing `Voice` interface (`noteOn`, `tick`, `reset`, `setParam`). Added to the voice registry (ADR 009) with new identifiers.

### Parameter Definitions

Add entries to `paramDefs.ts` for each new voice with appropriate ranges and labels.

## Consequences

- **Positive:** Richer percussion palette; 808 kick is essential for trap/hyperpop genres.
- **Positive:** All voices use the same interface — no architectural changes needed.
- **Negative:** More voice code to maintain. Each voice is self-contained (~50–80 lines), so complexity is linear.
- **Dependency:** Requires ADR 009 (instrument selection) to assign voices to tracks.
