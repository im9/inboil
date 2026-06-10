# inboil v1 — Vision

## What v1 is

A **mobile-first generative DAW** that runs in the browser. No install. Pick up
the phone, open the URL, music is already playing. Touch anything, it responds
audibly. Save / share by URL.

The structural change behind v1 is captured in [ADR 133](../adr/133-instrument-pattern-decoupling.md):
instruments become first-class scene nodes, patterns become voice-agnostic
sequences, and routing is explicit. This unlocks polymetric arrangement, pattern
reuse across instruments, generative-as-pattern-source, and — critically — a
mobile primary surface (the scene canvas itself) that is not a degraded version
of the desktop step grid.

## What v1 is not

- Not an iOS / Android native app — that is [ADR 074](../adr/074-mobile-app.md),
  a separate track
- Not a desktop-DAW-port to mobile — the mobile surface is designed for touch
  from scratch
- Not a sample-pack player or AI loop generator — composition authorship stays
  with the user
- Not a backwards-compatible refresh of the beta — v1 changes the core data
  model. Beta save data migrates, but the user-facing model is different

## Audience

inboil's current (beta) model is **hardware-fluent-optimized**: it inherits
"1 row = 1 voice", step grids, P-Locks, and pattern banks from Elektron-class
groove boxes. For users who already speak that vocabulary, beta is intuitive.
For users who don't, beta and v1 are equally foreign — but v1's foreignness sits
closer to musical reality (instruments + scores + performances + routing) than
to hardware convention.

v1 explicitly targets the **music-fluent user, not the hardware-fluent user**:

- People who play instruments but never used a TR-808
- People who write songs in DAWs but find Elektron intimidating
- Beginners with no prior step-sequencer mental model
- Listeners-becoming-makers who want music to start by touching, not by
  programming

Hardware-fluent users are welcome but not the design center. Their muscle memory
("row 3 is hats") is invalidated; the trade-off is conscious.

## Success criteria

1. **Time-to-first-loop on mobile < 5 seconds from cold open.** App opens, music
   starts, user has changed something within the first interaction.
2. **A 5-minute mobile session produces a shareable artifact** without ever
   touching the desktop.
3. **Generative engines feel like instruments, not algorithms.** A non-engineer
   touches a Drift node and immediately understands what it does, without
   reading docs.
4. **Routing is invisible until you want it.** Default project is "everything
   wired up sensibly"; users discover routing flexibility by exploration, not
   by being forced through it.
5. **Existing inboil songs play unchanged after migration.** Beta save data
   loads, sounds identical, and progressively reveals v1's new affordances as
   the user re-edits.

## What this enables for the product

- **Paid v1.0 release**: the mobile-completeness criterion (criterion 2) is the
  bar that converts inboil from "interesting browser toy" to "tool you'd buy".
- **A different conversation about what inboil is**: not "Elektron in a
  browser" but "a generative DAW that happens to run on your phone".
- **Pattern-sharing economy** ([ADR 107](../adr/107-pattern-sharing-api.md)
  gains expressive power when patterns are voice-agnostic — shared patterns
  carry musical intent without imposing voice choices.
- **Future AI composer integration** ([ADR 109](../adr/109-ai-composer-api.md))
  fits cleanly: AI is just another Source type, plugging into the same
  Source → Instrument protocol.

## Conflict with prior roadmap

Per `project_juce_new_apps.md` and `project_next_session_plan.md` memory notes,
the planned post-beta focus was shifting to iDEATH / VST work in JUCE. v1
proposes redirecting that energy into inboil itself instead. This is a roadmap
decision separate from the design's correctness; the redesign work can land
either way.
