#pragma once
#include <cmath>
#include <algorithm>

namespace inboil {

/// Kick-triggered sidechain gain reduction.
/// On trigger(), gain instantly drops to (1 - depth); recovers exponentially.
/// Kick signal bypasses the ducker and passes at full level.
class SidechainDucker {
public:
    SidechainDucker(float sr, float releaseMs = 130.0f) : _sr(sr) {
        setRelease(releaseMs);
    }

    void setRelease(float ms) {
        _coeff = std::exp(-1.0f / (std::max(10.0f, ms) * _sr / 1000.0f));
    }

    /// Call when kick fires; depth 0=no duck, 1=silence
    void trigger(float depth) { _env = 1.0f - depth; }

    /// Returns current gain (0–1). Call once per sample.
    float tick() {
        _env = 1.0f - (1.0f - _env) * _coeff;
        return _env;
    }

private:
    float _sr, _coeff = 0.0f, _env = 1.0f;
};

} // namespace inboil
