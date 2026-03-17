# ADR 109 — AI Composer API

## Status: Proposed

## Context

The user envisions "AI as composing partner" — lowering the complexity barrier rather than automating composition. A backend API that accepts musical context and returns pattern variations, fills, or harmonic suggestions fits this vision. This is the most ambitious backend project, combining LLM integration, algorithmic composition, and real-time interaction.

## Decision

### Phase 1 — Algorithmic Variation Engine (no LLM)

Pure algorithmic pattern generation — learn backend fundamentals without API cost.

**Tech Stack:**
| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Cloudflare Workers | Stateless computation, fast response |
| Language | TypeScript | Reuse music theory knowledge from worklet code |

**POST `/api/compose/variation`**
- Input: pattern JSON (cells, BPM, rootNote)
- Options: intensity (0–1), mode (subtle/wild), seed
- Output: modified pattern JSON

**Algorithms:**
- **Euclidean rhythms** — redistribute trigs using Euclidean algorithm for a given density
- **Markov chain** — build transition matrix from input pattern, generate variations
- **Mutation** — random trig add/remove/shift with probability weighted by intensity
- **Humanize** — velocity variation, micro-timing (chance values), ghost notes
- **Call & response** — analyze first 8 steps, generate complementary 8 steps

**POST `/api/compose/fill`**
- Input: pattern JSON + target track indices
- Output: 1-bar fill pattern (for FILL feature integration)
- Logic: density increase + roll detection + accent patterns

**POST `/api/compose/harmony`**
- Input: root note, scale, chord progression (optional)
- Output: suggested bass line and chord voicings as trig arrays
- Uses: circle of fifths, common progressions, voice leading rules

### Phase 2 — LLM-Assisted Composition

Add Claude API as a creative partner for higher-level musical decisions.

**Tech Stack addition:**
| Layer | Choice | Rationale |
|---|---|---|
| LLM | Claude API (Haiku for speed, Sonnet for quality) | Natural language ↔ musical structure |
| Cache | KV or D1 | Cache similar prompts to reduce API calls |

**POST `/api/compose/suggest`**
- Input: current song state (patterns, scene graph structure, style tags)
- Natural language prompt: "make the B section more energetic" / "add tension before the drop"
- Output: structured JSON — suggested parameter changes, new pattern, decorator values
- LLM receives a compressed musical representation, returns structured edits

**POST `/api/compose/describe`**
- Input: pattern JSON
- Output: natural language description of the musical content
- Use case: accessibility, learning ("This pattern uses a four-on-the-floor kick with syncopated hi-hats")

**Prompt engineering:**
- System prompt defines INBOIL's data model (WorkletPattern, voiceIds, param ranges)
- Few-shot examples of good pattern transformations
- Structured output via tool_use to guarantee valid JSON
- Temperature tuning: low (0.3) for harmony, higher (0.8) for creative variation

**POST `/api/compose/chat`** (stretch goal)
- Conversational composition session
- Stateful: remembers context within a session (KV-backed)
- "Make the kick pattern more syncopated" → returns diff to apply
- "That's too busy, dial it back" → understands relative context

### Phase 3 — Real-Time Suggestions (WebSocket)

Live composition assistance during playback.

- WebSocket connection from app to suggestion server
- On each pattern cycle: send current state snapshot
- Server returns optional suggestions (next pattern, fill trigger, parameter nudge)
- UI: subtle indicator in DockPanel — tap to apply suggestion
- Fully opt-in, never auto-applies

**App integration (all phases):**
- DockPanel "AI" tab or floating compose button
- Suggestions appear as ghost trigs (dimmed) on StepGrid — tap to accept
- Scene graph: "suggest next node" based on current arrangement
- Undo-aware: AI changes go through normal pushUndo() flow

## Learning Outcomes

- Phase 1: algorithmic composition, music theory in code, deterministic APIs
- Phase 2: LLM API integration, prompt engineering, structured output, caching strategies
- Phase 3: stateful WebSocket services, real-time streaming, event-driven architecture

## Constraints

- Phase 1 has zero external API cost (pure algorithms)
- Phase 2 Claude API cost: Haiku is very cheap per call; cache aggressively
- Suggestion latency budget: < 500ms for Phase 1, < 2s for Phase 2
- LLM never auto-applies changes — always returns suggestions for user to accept/reject
- No training on user data — stateless per-request (except Phase 3 session context)
- Pattern JSON compressed before LLM prompt to fit context window efficiently
