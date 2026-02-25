#pragma once
#include <vector>

namespace inboil {

/// Feedback comb filter with one-pole damping — building block for Freeverb reverb.
class CombFilter {
public:
    CombFilter(int length, float fb, float damp)
        : _buf(length, 0.0f), _fb(fb), _damp(damp) {}

    void setFeedback(float fb)  { _fb   = fb; }
    void setDamp(float d)       { _damp = d; }

    float process(float x) {
        float y   = _buf[_ptr];
        _filt     = y * (1.0f - _damp) + _filt * _damp;
        _buf[_ptr] = x + _filt * _fb;
        _ptr      = (_ptr + 1) % static_cast<int>(_buf.size());
        return y;
    }

private:
    std::vector<float> _buf;
    int   _ptr  = 0;
    float _filt = 0.0f;
    float _fb, _damp;
};

} // namespace inboil
