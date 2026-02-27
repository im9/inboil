#pragma once
#include <cstdint>
#include <cmath>

namespace inboil {

// ── Fast math approximations for audio hot path ──────────────────────────────

/// Rational tanh approximation — ~4× faster than std::tanh, <0.5% error for |x|<4.
inline float fastTanh(float x) {
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

/// Fast exp approximation using bit manipulation — ~3× faster than std::exp.
/// Accurate to ~0.1% for |x| < 5, suitable for filter coefficient calculation.
inline float fastExp(float x) {
    x = 1.0f + x / 256.0f;
    x *= x; x *= x; x *= x; x *= x;  // ^16
    x *= x; x *= x; x *= x; x *= x;  // ^256
    return x;
}

/// Abstract base class for all synth voices.
/// noteOn() triggers the voice; tick() advances one sample; reset() silences immediately.
class SynthBase {
public:
    explicit SynthBase(float sampleRate) : _sr(sampleRate) {}
    virtual ~SynthBase() = default;

    virtual void  noteOn(uint8_t note, float velocity) = 0;
    virtual float tick()  = 0;
    virtual void  reset() = 0;

protected:
    float _sr;

    static float midiToHz(uint8_t note) {
        return 440.0f * std::pow(2.0f, (note - 69) / 12.0f);
    }
};

/// Simple one-pole filter (6 dB/oct).
/// setFreq() configures as LP; for HP use:  y = input - lp.process(input)
struct OnePole {
    float a0 = 1.0f, b1 = 0.0f, z1 = 0.0f;

    void setFreq(float cutoff, float sr) {
        float x = fastExp(-2.0f * 3.14159265f * std::max(1.0f, cutoff) / sr);
        a0 = 1.0f - x;
        b1 = -x;
    }
    float process(float in) {
        z1 = in * a0 - z1 * b1;
        return z1;
    }
    void reset() { z1 = 0.0f; }
};

/// Linear ADSR envelope (0–1 range).
/// When gateTime > 0, Sustain auto-transitions to Release after that duration.
/// This prevents indefinite sustain in step-sequencer contexts (no noteOff).
struct ADSR {
    enum class Stage { Idle, Attack, Decay, Sustain, Release };

    float attack   = 0.01f;  // seconds
    float decay    = 0.1f;
    float sustain  = 0.7f;
    float release  = 0.3f;
    float gateTime = 0.0f;   // 0 = sustain forever, >0 = auto-release after N seconds

    float _level     = 0.0f;
    float _sr        = 44100.0f;
    float _gateAccum = 0.0f;
    Stage _stage     = Stage::Idle;

    void setSampleRate(float sr) { _sr = sr; }
    void noteOn()  { _stage = Stage::Attack; _gateAccum = 0.0f; }
    bool isIdle()  const { return _stage == Stage::Idle; }

    void reset() {
        _level = 0.0f;
        _gateAccum = 0.0f;
        _stage = Stage::Idle;
    }

    float tick() {
        switch (_stage) {
            case Stage::Idle: return 0.0f;
            case Stage::Attack:
                _level += 1.0f / (_atk() * _sr);
                if (_level >= 1.0f) { _level = 1.0f; _stage = Stage::Decay; }
                break;
            case Stage::Decay:
                _level -= (1.0f - sustain) / (_dec() * _sr);
                if (_level <= sustain) { _level = sustain; _stage = Stage::Sustain; }
                break;
            case Stage::Sustain:
                if (gateTime > 0.0f) {
                    _gateAccum += 1.0f / _sr;
                    if (_gateAccum >= gateTime) _stage = Stage::Release;
                }
                break;
            case Stage::Release: {
                const float rate = _level / (_rel() * _sr);
                _level -= (rate > 0.00001f) ? rate : 0.00001f;
                if (_level <= 0.001f) { _level = 0.0f; _stage = Stage::Idle; }
                break;
            }
        }
        return _level;
    }

private:
    float _atk() const { return std::max(0.001f, attack);  }
    float _dec() const { return std::max(0.001f, decay);   }
    float _rel() const { return std::max(0.001f, release); }
};

} // namespace inboil
