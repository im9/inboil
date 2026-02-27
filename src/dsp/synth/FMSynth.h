#pragma once
#include "SynthBase.h"
#include <cmath>

namespace inboil {

/// 2-operator FM synth: modulator (op2) → carrier (op1).
/// Ratio 2.1 (slightly inharmonic) → metallic, bell-like dariacore character.
/// Index is envelope-controlled (high attack index → punchy metallic transient).
class FMSynth : public SynthBase {
private:
    ADSR  _env;
    float _freq          = 440.0f;
    float _carrierPhase  = 0.0f;
    float _modulatorPhase = 0.0f;
    float _vel           = 1.0f;

public:
    explicit FMSynth(float sr) : SynthBase(sr) {
        _env.setSampleRate(sr);
        _env.attack   = 0.003f;
        _env.decay    = 0.22f;
        _env.sustain  = 0.15f;
        _env.release  = 0.3f;
        _env.gateTime = 0.12f;  // auto-release after 120ms (step sequencer has no noteOff)
    }

    // Parameters
    float ratio  = 2.1f;   // modulator:carrier ratio — slightly inharmonic
    float index  = 7.0f;   // peak FM index — high for harsh, complex spectrum
    float volume = 0.55f;

    void noteOn(uint8_t note, float velocity) override {
        _freq          = midiToHz(note);
        _vel           = velocity;
        _carrierPhase  = 0.0f;
        _modulatorPhase = 0.0f;
        _env.noteOn();
    }

    void reset() override {
        _env.reset();
        _carrierPhase = _modulatorPhase = 0.0f;
    }

    float tick() override {
        if (_env.isIdle()) return 0.0f;

        const float env    = _env.tick();
        const float modHz  = _freq * ratio;
        const float twoPi  = 2.0f * 3.14159265f;

        // Modulator — index scales with envelope for punchy attack
        _modulatorPhase += modHz / _sr;
        if (_modulatorPhase >= 1.0f) _modulatorPhase -= 1.0f;
        const float mod = std::sin(_modulatorPhase * twoPi) * index * env;

        // Carrier phase-modulated by mod
        _carrierPhase += _freq / _sr;
        if (_carrierPhase >= 1.0f) _carrierPhase -= 1.0f;
        const float car = std::sin((_carrierPhase + mod / twoPi) * twoPi);

        return car * env * _vel * volume;
    }
};

} // namespace inboil
