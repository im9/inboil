#pragma once
#include "SynthBase.h"
#include <cmath>

namespace inboil {

/// Hi-hat / cymbal: LP-filtered white noise with fast amplitude envelope.
/// Cutoff at 10 kHz keeps the snap while rolling off extreme highs.
class NoiseSynth : public SynthBase {
private:
    ADSR     _ampEnv;
    OnePole  _lpf;
    float    _vel  = 1.0f;
    uint32_t _seed = 98765u;

    float _lcgNoise() {
        _seed = _seed * 1664525u + 1013904223u;
        return static_cast<float>(_seed >> 16) / 65535.0f;
    }

public:
    explicit NoiseSynth(float sr) : SynthBase(sr) {
        _ampEnv.setSampleRate(sr);
        _ampEnv.attack  = 0.001f;
        _ampEnv.decay   = 0.022f;
        _ampEnv.sustain = 0.0f;
        _ampEnv.release = 0.004f;
        _lpf.setFreq(10000.0f, sr);
    }

    // Parameters
    float decay  = 0.022f;    // seconds
    float tone   = 10000.0f;  // LP filter cutoff
    float volume = 0.45f;

    void noteOn(uint8_t /*note*/, float velocity) override {
        _vel          = velocity;
        _ampEnv.decay = (decay > 0.005f) ? decay : 0.005f;
        _lpf.setFreq(tone, _sr);
        _ampEnv.noteOn();
    }

    void reset() override { _ampEnv.reset(); _lpf.reset(); }

    float tick() override {
        if (_ampEnv.isIdle()) return 0.0f;
        const float noise = _lcgNoise() * 2.0f - 1.0f;
        return _lpf.process(noise) * _ampEnv.tick() * _vel * volume;
    }
};

} // namespace inboil
