#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include "../synth/SynthBase.h"
#include "../fx/SimpleReverb.h"
#include "../fx/PingPongDelay.h"
#include "../fx/SidechainDucker.h"
#include "../fx/BusCompressor.h"

namespace inboil {

static constexpr int MAX_TRACKS = 8;
static constexpr int MAX_STEPS  = 64;

struct Trig {
    bool     active   = false;
    uint8_t  note     = 60;    // MIDI note
    float    velocity = 1.0f;
};

struct Track {
    uint8_t  steps      = 16;
    Trig     trigs[MAX_STEPS];
    bool     muted      = false;
    bool     sidechainSource = false;  // ADR 064: triggers ducker & bypasses ducking
    float    reverbSend = 0.0f;  // 0–1
    float    delaySend  = 0.0f;  // 0–1
};

struct EngineParams {
    float bpm = 120.0f;
};

struct FxParams {
    float reverbSize     = 0.72f;
    float reverbDamp     = 0.5f;
    float delayTime      = 375.0f;   // ms
    float delayFeedback  = 0.42f;
    float duckDepth      = 0.85f;    // 0=off, 1=full silence
    float duckRelease    = 120.0f;   // ms
    float compThreshold  = 0.30f;    // linear amplitude
    float compRatio      = 6.0f;
    float compMakeup     = 2.2f;     // linear gain
};

/// Top-level DSP engine.
/// Owns synth voice pool, step sequencer, and the full FX chain.
/// Signal chain: voices → [reverb / delay sends] → sidechain ducker → bus compressor → tanh limiter
class Engine {
public:
    Engine()  = default;
    ~Engine() {
        for (int i = 0; i < MAX_TRACKS; ++i) delete _voices[i];
    }

    /// Must be called once before process().
    void init(float sampleRate, int blockSize);

    /// Render one block of stereo audio (non-interleaved, length = blockSize).
    void process(float* outL, float* outR);

    /// Transport
    void play();
    void stop();

    /// Pattern / sequencer
    void setParams(const EngineParams& p);
    void setTrack(int trackIdx, const Track& t);
    void setMute(int trackIdx, bool muted);
    void setSteps(int trackIdx, uint8_t steps);

    /// Update a single trig without replacing the whole Track.
    void setTrig(int trackIdx, int stepIdx, bool active, uint8_t note, float velocity);

    /// Update send amounts for a track.
    void setTrackSends(int trackIdx, float reverbSend, float delaySend);

    /// Global FX parameters.
    void setFx(const FxParams& fx);

    /// Current playhead positions (read by UI)
    int  getPlayhead(int trackIdx) const {
        if (trackIdx < 0 || trackIdx >= MAX_TRACKS) return 0;
        return _playheads[trackIdx];
    }

private:
    void _advanceStep();
    void _triggerVoice(int trackIdx, const Trig& trig);

    float  _sampleRate      = 44100.0f;
    int    _blockSize       = 128;
    float  _bpm             = 120.0f;
    bool   _playing         = false;

    double _samplesPerStep  = 0.0;
    double _sampleAccum     = 0.0;

    int    _playheads[MAX_TRACKS] = {};
    Track  _tracks[MAX_TRACKS];
    SynthBase* _voices[MAX_TRACKS] = {};

    // FX (created in init())
    std::unique_ptr<SimpleReverb>    _reverb;
    std::unique_ptr<PingPongDelay>   _delay;
    std::unique_ptr<SidechainDucker> _ducker;
    std::unique_ptr<BusCompressor>   _comp;

    // Cached FX params
    float _delayFeedback  = 0.42f;
    float _duckDepth      = 0.85f;
    float _compThreshold  = 0.30f;
    float _compRatio      = 6.0f;
    float _compMakeup     = 2.2f;
};

} // namespace inboil
