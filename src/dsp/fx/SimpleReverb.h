#pragma once
#include "CombFilter.h"
#include "AllpassFilter.h"
#include <vector>
#include <cmath>

namespace inboil {

/// Freeverb-style plate reverb: 4 parallel comb filters → 2 series allpass filters.
/// Mono input, stereo output. Delay lengths scaled to sample rate.
class SimpleReverb {
public:
    explicit SimpleReverb(float sr) {
        const float k  = sr / 44100.0f;
        const int   sp = static_cast<int>(std::round(23.0f * k));  // stereo spread

        // Comb filter delay lengths (samples at 44100 Hz)
        const int cLens[4] = { 1116, 1188, 1277, 1356 };
        // Allpass filter delay lengths
        const int aLens[2] = { 556, 441 };

        for (int i = 0; i < 4; ++i) {
            const int n = static_cast<int>(std::round(cLens[i] * k));
            _combsL.emplace_back(n,      0.84f, 0.2f);
            _combsR.emplace_back(n + sp, 0.84f, 0.2f);
        }
        for (int i = 0; i < 2; ++i) {
            const int n = static_cast<int>(std::round(aLens[i] * k));
            _apL.emplace_back(n);
            _apR.emplace_back(n + sp);
        }
    }

    /// size 0–1 maps to feedback 0.60–0.96 (longer tail with higher value)
    void setSize(float s) {
        const float fb = 0.60f + s * 0.36f;
        for (auto& c : _combsL) c.setFeedback(fb);
        for (auto& c : _combsR) c.setFeedback(fb);
    }

    /// damp 0–1 maps to actual damp 0.0–0.4
    void setDamp(float d) {
        const float v = d * 0.4f;
        for (auto& c : _combsL) c.setDamp(v);
        for (auto& c : _combsR) c.setDamp(v);
    }

    void process(float x, float& outL, float& outR) {
        constexpr float kGain = 0.015f;
        outL = outR = 0.0f;
        for (auto& c : _combsL) outL += c.process(x * kGain);
        for (auto& c : _combsR) outR += c.process(x * kGain);
        for (auto& a : _apL) outL = a.process(outL);
        for (auto& a : _apR) outR = a.process(outR);
    }

private:
    std::vector<CombFilter>    _combsL, _combsR;
    std::vector<AllpassFilter> _apL,    _apR;
};

} // namespace inboil
