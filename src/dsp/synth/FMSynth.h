#pragma once
#include "SynthBase.h"
#include <cmath>

namespace inboil {

/// Single FM operator with phase accumulator, envelope, feedback, and detune.
struct FMOp {
    float phase = 0.0f;
    float prevOut = 0.0f;
    float ratio = 1.0f;
    float detune = 0.0f;   // cents
    float level = 1.0f;
    float feedback = 0.0f;
    ADSR env;

    void reset() { phase = 0.0f; prevOut = 0.0f; env.reset(); }
    void noteOn() { phase = 0.0f; prevOut = 0.0f; env.noteOn(); }

    /// Tick operator with external modulation input. Returns output signal.
    float tick(float freq, float sr, float modIn) {
        const float e = env.tick();
        if (e < 0.00001f) return 0.0f;
        const float centsFactor = (detune != 0.0f)
            ? std::pow(2.0f, detune / 1200.0f) : 1.0f;
        const float hz = freq * ratio * centsFactor;
        phase += hz / sr;
        if (phase >= 1.0f) phase -= 1.0f;
        const float twoPi = 2.0f * 3.14159265f;
        const float fb = (feedback > 0.0f) ? prevOut * feedback * 3.2f : 0.0f;
        const float out = std::sin(phase * twoPi + modIn + fb) * e * level;
        prevOut = out;
        return out;
    }
};

/// 4-operator FM synth with 8 algorithms (ADR 068).
/// Operators numbered 1-4 (index 0-3). Algorithm defines carrier/modulator routing.
class FMSynth : public SynthBase {
private:
    FMOp _ops[4];
    int  _algorithm = 0;
    float _freq = 440.0f;
    float _vel  = 1.0f;

    static constexpr float TAU = 2.0f * 3.14159265f;

public:
    explicit FMSynth(float sr) : SynthBase(sr) {
        for (auto& op : _ops) {
            op.env.setSampleRate(sr);
            op.env.gateTime = 0.12f;
        }
        // Default: EP-like setup
        _ops[0].ratio = 1.0f; _ops[0].level = 1.0f;
        _ops[0].env.attack = 0.003f; _ops[0].env.decay = 0.30f;
        _ops[0].env.sustain = 0.20f; _ops[0].env.release = 0.4f;
        _ops[0].feedback = 0.15f;

        _ops[1].ratio = 2.0f; _ops[1].level = 0.7f;
        _ops[1].env.attack = 0.001f; _ops[1].env.decay = 0.20f;
        _ops[1].env.sustain = 0.10f; _ops[1].env.release = 0.15f;

        _ops[2].ratio = 3.0f; _ops[2].level = 0.5f;
        _ops[2].env.attack = 0.001f; _ops[2].env.decay = 0.10f;
        _ops[2].env.sustain = 0.0f;  _ops[2].env.release = 0.05f;

        _ops[3].ratio = 4.0f; _ops[3].level = 0.3f;
        _ops[3].env.attack = 0.001f; _ops[3].env.decay = 0.08f;
        _ops[3].env.sustain = 0.0f;  _ops[3].env.release = 0.05f;
    }

    void noteOn(uint8_t note, float velocity) override {
        _freq = midiToHz(note);
        _vel  = velocity;
        for (auto& op : _ops) op.noteOn();
    }

    void reset() override {
        for (auto& op : _ops) op.reset();
    }

    float tick() override {
        auto& o1 = _ops[0]; auto& o2 = _ops[1];
        auto& o3 = _ops[2]; auto& o4 = _ops[3];
        const float f = _freq;

        // Check if all envelopes are idle
        bool allIdle = true;
        for (const auto& op : _ops) {
            if (!op.env.isIdle()) { allIdle = false; break; }
        }
        if (allIdle) return 0.0f;

        float out = 0.0f;
        switch (_algorithm) {
            case 0: { // [4]→[3]→[2]→[1]→out (serial)
                float s4 = o4.tick(f, _sr, 0);
                float s3 = o3.tick(f, _sr, s4 * TAU);
                float s2 = o2.tick(f, _sr, s3 * TAU);
                out = o1.tick(f, _sr, s2 * TAU);
                break;
            }
            case 1: { // [4]→[3]→[2]→out, [1]→out
                float s4 = o4.tick(f, _sr, 0);
                float s3 = o3.tick(f, _sr, s4 * TAU);
                out = o2.tick(f, _sr, s3 * TAU) + o1.tick(f, _sr, 0);
                break;
            }
            case 2: { // [4]→[3]→out, [4]→[2]→[1]→out
                float s4 = o4.tick(f, _sr, 0);
                float s2 = o2.tick(f, _sr, s4 * TAU);
                out = o3.tick(f, _sr, s4 * TAU) + o1.tick(f, _sr, s2 * TAU);
                break;
            }
            case 3: { // [4]→[3]→out, [2]→[1]→out
                float s4 = o4.tick(f, _sr, 0);
                float s2 = o2.tick(f, _sr, 0);
                out = o3.tick(f, _sr, s4 * TAU) + o1.tick(f, _sr, s2 * TAU);
                break;
            }
            case 4: { // [3]→[2]→out, [4]→[1]→out
                float s3 = o3.tick(f, _sr, 0);
                float s4 = o4.tick(f, _sr, 0);
                out = o2.tick(f, _sr, s3 * TAU) + o1.tick(f, _sr, s4 * TAU);
                break;
            }
            case 5: { // [4]→[3]→out, [2]→out, [1]→out
                float s4 = o4.tick(f, _sr, 0);
                out = o3.tick(f, _sr, s4 * TAU) + o2.tick(f, _sr, 0) + o1.tick(f, _sr, 0);
                break;
            }
            case 6: { // [4]→[3]→out, [2]→out, [1]→out (fb on 1)
                float s4 = o4.tick(f, _sr, 0);
                out = o3.tick(f, _sr, s4 * TAU) + o2.tick(f, _sr, 0) + o1.tick(f, _sr, 0);
                break;
            }
            case 7: { // all parallel (additive)
                out = o4.tick(f, _sr, 0) + o3.tick(f, _sr, 0)
                    + o2.tick(f, _sr, 0) + o1.tick(f, _sr, 0);
                break;
            }
        }
        const int carriers = (_algorithm >= 7) ? 4 : (_algorithm >= 5) ? 3 : 2;
        return out / carriers * _vel * 0.55f;
    }
};

} // namespace inboil
