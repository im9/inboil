#pragma once
#include <cmath>
#include <algorithm>

namespace inboil {

/// Feedforward peak bus compressor.
/// Attack 0.8 ms, release 60 ms — tight enough to catch kick transients.
class BusCompressor {
public:
    explicit BusCompressor(float sr) {
        _aCoeff = std::exp(-1.0f / (0.0008f * sr));  // 0.8 ms
        _rCoeff = std::exp(-1.0f / (0.060f  * sr));  // 60 ms
    }

    /// threshold and makeup are linear amplitude (not dB).
    void process(float L, float R,
                 float threshold, float ratio, float makeup,
                 float& outL, float& outR) {
        const float level = std::max(std::abs(L), std::abs(R));
        const float c     = (level > _env) ? _aCoeff : _rCoeff;
        _env = level + (_env - level) * c;

        float gain = 1.0f;
        if (_env > threshold) {
            const float desired = threshold + (_env - threshold) / ratio;
            gain = desired / _env;
        }
        outL = L * gain * makeup;
        outR = R * gain * makeup;
    }

private:
    float _env = 0.0f, _aCoeff, _rCoeff;
};

} // namespace inboil
