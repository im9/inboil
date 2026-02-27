#pragma once
#include "SynthBase.h"
#include <cmath>

namespace inboil {

/// Subtractive synth: sawtooth VCO → tanh saturation → one-pole LPF → ADSR VCA.
/// Pre-filter saturation adds harmonics for a brighter, grittier analog vibe.
/// Filter sweeps open with the envelope (bright attack, dark decay).
class AnalogSynth : public SynthBase {
private:
    ADSR    _env;
    OnePole _lpf;
    float   _freq  = 220.0f;
    float   _phase = 0.0f;
    float   _vel   = 1.0f;

public:
    explicit AnalogSynth(float sr) : SynthBase(sr) {
        _env.setSampleRate(sr);
        _env.attack   = 0.008f;
        _env.decay    = 0.18f;
        _env.sustain  = 0.4f;
        _env.release  = 0.25f;
        _env.gateTime = 0.15f;  // auto-release after 150ms (step sequencer has no noteOff)
    }

    // Parameters
    float cutoff = 1200.0f;  // LPF base cutoff Hz
    float envMod = 3500.0f;  // cutoff swept up by this amount at env peak
    float volume = 0.60f;

    void noteOn(uint8_t note, float velocity) override {
        _freq = midiToHz(note);
        _vel  = velocity;
        _env.noteOn();
    }

    void reset() override { _env.reset(); _lpf.reset(); _phase = 0.0f; }

    float tick() override {
        if (_env.isIdle()) return 0.0f;

        const float env = _env.tick();

        // Sawtooth oscillator
        _phase += _freq / _sr;
        if (_phase >= 1.0f) _phase -= 1.0f;

        // Pre-filter saturation (even harmonics → warmer/brighter)
        const float sat = fastTanh((_phase * 2.0f - 1.0f) * 1.8f);

        // Filter cutoff modulated by envelope
        const float fc = cutoff + envMod * env;
        _lpf.setFreq(fc < _sr * 0.45f ? fc : _sr * 0.45f, _sr);

        return _lpf.process(sat) * env * _vel * volume;
    }
};

} // namespace inboil
