#pragma once
#include "SynthBase.h"
#include <cmath>

namespace inboil {

/// Kick/snare drum: sine oscillator with pitch envelope + amplitude envelope.
/// Pitch drops from pitchStart → pitchEnd with exponential curve.
/// noiseAmt blends in white noise for snare character.
///
/// Default parameters → kick drum.
/// For snare: set noiseAmt ≥ 0.5, shorter pitchDecay, higher pitchCurve.
class DrumSynth : public SynthBase {
public:
    explicit DrumSynth(float sr) : SynthBase(sr) {
        ampEnv.setSampleRate(sr);
        ampEnv.attack  = 0.002f;
        ampEnv.decay   = 0.40f;
        ampEnv.sustain = 0.0f;
        ampEnv.release = 0.01f;
    }

    // ── Public parameters ─────────────────────────────────────────────
    float pitchStart = 200.0f;  // Hz
    float pitchEnd   =  35.0f;  // Hz
    float pitchDecay =  0.08f;  // seconds
    float pitchCurve =  7.0f;   // exponential steepness (higher = faster drop)
    float noiseAmt   =  0.0f;   // 0=pure sine, 1=full noise
    float volume     =  0.95f;

    ADSR  ampEnv;               // public so Engine can configure per-voice

    // ─────────────────────────────────────────────────────────────────

    void noteOn(uint8_t /*note*/, float velocity) override {
        _vel    = velocity;
        _phase  = 0.0f;
        _pitchT = 0.0f;
        ampEnv.noteOn();
    }

    void reset() override {
        ampEnv.reset();
        _phase = _pitchT = 0.0f;
    }

    float tick() override {
        if (ampEnv.isIdle()) return 0.0f;

        // Exponential pitch sweep
        const float t    = _pitchT / (_sr * std::max(0.001f, pitchDecay));
        const float freq = pitchEnd + (pitchStart - pitchEnd) * fastExp(-pitchCurve * t);
        _pitchT += 1.0f;

        _phase += freq / _sr;
        if (_phase >= 1.0f) _phase -= 1.0f;

        const float sine  = std::sin(_phase * 2.0f * 3.14159265f);
        const float noise = _lcgNoise() * 2.0f - 1.0f;
        const float sig   = sine * (1.0f - noiseAmt) + noise * noiseAmt;

        return sig * ampEnv.tick() * _vel * volume;
    }

private:
    float    _phase  = 0.0f;
    float    _pitchT = 0.0f;
    float    _vel    = 1.0f;

    uint32_t _seed = 12345u;
    float _lcgNoise() {
        _seed = _seed * 1664525u + 1013904223u;
        return static_cast<float>(_seed >> 16) / 65535.0f;
    }
};

} // namespace inboil
