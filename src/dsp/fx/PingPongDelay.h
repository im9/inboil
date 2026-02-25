#pragma once
#include <vector>
#include <cmath>
#include <algorithm>

namespace inboil {

/// Stereo ping-pong delay: L feeds into R buffer, R feeds into L buffer.
class PingPongDelay {
public:
    PingPongDelay(float maxMs, float sr) : _sr(sr) {
        const int max = static_cast<int>(std::ceil(maxMs * sr / 1000.0f));
        _bL.assign(max, 0.0f);
        _bR.assign(max, 0.0f);
    }

    void setTime(float ms) {
        _ds = std::min(
            static_cast<int>(std::ceil(ms * _sr / 1000.0f)),
            static_cast<int>(_bL.size())
        );
    }

    void process(float iL, float iR, float fb, float& oL, float& oR) {
        if (_ds == 0) { oL = oR = 0.0f; return; }
        const int len = static_cast<int>(_bL.size());
        const int rL  = (_pL - _ds + len) % len;
        const int rR  = (_pR - _ds + len) % len;
        oL = _bL[rL]; oR = _bR[rR];
        _bL[_pL] = iL + oR * fb;
        _bR[_pR] = iR + oL * fb;
        _pL = (_pL + 1) % len;
        _pR = (_pR + 1) % len;
    }

private:
    float              _sr;
    std::vector<float> _bL, _bR;
    int                _pL = 0, _pR = 0, _ds = 0;
};

} // namespace inboil
