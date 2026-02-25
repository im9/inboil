/// Flat C API for Emscripten WASM export.
/// All functions take an Engine* as first argument (opaque handle from engine_create).
#include "../engine/Engine.h"
#include <new>
#include <cstdint>

using namespace inboil;

extern "C" {

// ── Lifecycle ─────────────────────────────────────────────────────────────────

Engine* engine_create() {
    return new (std::nothrow) Engine();
}

void engine_destroy(Engine* e) {
    delete e;
}

void engine_init(Engine* e, float sampleRate, int blockSize) {
    if (e) e->init(sampleRate, blockSize);
}

// ── Process ───────────────────────────────────────────────────────────────────

/// Render one block. outL/outR are float32 pointers into WASM linear memory.
void engine_process(Engine* e, float* outL, float* outR) {
    if (e) e->process(outL, outR);
}

// ── Transport ─────────────────────────────────────────────────────────────────

void engine_play(Engine* e) {
    if (e) e->play();
}

void engine_stop(Engine* e) {
    if (e) e->stop();
}

// ── Pattern params ────────────────────────────────────────────────────────────

void engine_set_bpm(Engine* e, float bpm) {
    if (!e) return;
    EngineParams p;
    p.bpm = bpm;
    e->setParams(p);
}

void engine_set_steps(Engine* e, int trackIdx, int steps) {
    if (e) e->setSteps(trackIdx, static_cast<uint8_t>(steps));
}

void engine_set_mute(Engine* e, int trackIdx, bool muted) {
    if (e) e->setMute(trackIdx, muted);
}

/// Set a single trig. Call once per changed step from JS.
void engine_set_trig(Engine* e, int trackIdx, int stepIdx,
                     bool active, int note, float velocity) {
    if (e) e->setTrig(trackIdx, stepIdx, active, static_cast<uint8_t>(note), velocity);
}

/// Set reverb and delay send amounts for a track (0.0–1.0 each).
void engine_set_track_sends(Engine* e, int trackIdx, float reverbSend, float delaySend) {
    if (e) e->setTrackSends(trackIdx, reverbSend, delaySend);
}

// ── Global FX ─────────────────────────────────────────────────────────────────

/// Update the global FX chain in one call.
/// threshold and makeup are linear amplitude (not dB).
void engine_set_fx(Engine* e,
                   float reverbSize, float reverbDamp,
                   float delayTime,  float delayFeedback,
                   float duckDepth,  float duckRelease,
                   float compThreshold, float compRatio, float compMakeup) {
    if (!e) return;
    FxParams fx;
    fx.reverbSize    = reverbSize;
    fx.reverbDamp    = reverbDamp;
    fx.delayTime     = delayTime;
    fx.delayFeedback = delayFeedback;
    fx.duckDepth     = duckDepth;
    fx.duckRelease   = duckRelease;
    fx.compThreshold = compThreshold;
    fx.compRatio     = compRatio;
    fx.compMakeup    = compMakeup;
    e->setFx(fx);
}

// ── Playhead read ─────────────────────────────────────────────────────────────

int engine_get_playhead(Engine* e, int trackIdx) {
    if (!e) return 0;
    return e->getPlayhead(trackIdx);
}

} // extern "C"
