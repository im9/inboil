#pragma once
#include <vector>

namespace inboil {

/// Schroeder allpass filter — for diffusion in reverb.
class AllpassFilter {
public:
    AllpassFilter(int length, float fb = 0.5f)
        : _buf(length, 0.0f), _fb(fb) {}

    float process(float x) {
        float b   = _buf[_ptr];
        float y   = b - x;
        _buf[_ptr] = x + b * _fb;
        if (++_ptr >= static_cast<int>(_buf.size())) _ptr = 0;
        return y;
    }

private:
    std::vector<float> _buf;
    int   _ptr = 0;
    float _fb;
};

} // namespace inboil
