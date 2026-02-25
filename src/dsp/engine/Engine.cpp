#include "Engine.h"
#include "../synth/DrumSynth.h"
#include "../synth/NoiseSynth.h"
#include "../synth/AnalogSynth.h"
#include "../synth/FMSynth.h"
#include <cmath>
#include <algorithm>

namespace inboil {

// ── Voice factory ─────────────────────────────────────────────────────────────
//
// Track layout mirrors state.svelte.ts initial tracks:
//   0  KICK   DrumSynth  (hyperpop: deep punch, fast pitch drop)
//   1  SNARE  DrumSynth  (hyperpop: mostly noise, short decay)
//   2  HATS   NoiseSynth
//   3  BASS   AnalogSynth
//   4  LEAD   AnalogSynth
//   5  FM     FMSynth
//   6  SAMP   AnalogSynth (placeholder — no sampler yet)
//   7  CHORD  FMSynth     (placeholder)

static SynthBase* createVoice(int trackIdx, float sr) {
    switch (trackIdx) {
        case 0: {  // Kick — deep sine, fast pitch sweep 200→35 Hz
            auto* d = new DrumSynth(sr);
            d->pitchStart = 200.0f; d->pitchEnd = 35.0f;
            d->pitchDecay = 0.08f;  d->pitchCurve = 7.0f;
            d->noiseAmt   = 0.0f;   d->volume     = 0.95f;
            d->ampEnv.attack  = 0.002f; d->ampEnv.decay   = 0.40f;
            d->ampEnv.sustain = 0.0f;   d->ampEnv.release = 0.01f;
            return d;
        }
        case 1: {  // Snare — mostly noise, short tone crack
            auto* d = new DrumSynth(sr);
            d->pitchStart = 300.0f; d->pitchEnd = 140.0f;
            d->pitchDecay = 0.015f; d->pitchCurve = 10.0f;
            d->noiseAmt   = 0.85f;  d->volume     = 0.80f;
            d->ampEnv.attack  = 0.0005f; d->ampEnv.decay   = 0.08f;
            d->ampEnv.sustain = 0.0f;    d->ampEnv.release = 0.01f;
            return d;
        }
        case 2: return new NoiseSynth(sr);
        case 3: return new AnalogSynth(sr);
        case 4: return new AnalogSynth(sr);
        case 5: return new FMSynth(sr);
        case 6: return new AnalogSynth(sr);  // Sampler placeholder
        case 7: return new FMSynth(sr);      // ChordSynth placeholder
        default: return new AnalogSynth(sr);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

void Engine::init(float sampleRate, int blockSize) {
    _sampleRate = sampleRate;
    _blockSize  = blockSize;
    _samplesPerStep = (60.0 / _bpm / 4.0) * _sampleRate;

    // Create voices
    for (int i = 0; i < MAX_TRACKS; ++i) {
        delete _voices[i];
        _voices[i] = createVoice(i, sampleRate);
    }

    // Create FX (all depend on sample rate)
    _reverb = std::make_unique<SimpleReverb>(sampleRate);
    _delay  = std::make_unique<PingPongDelay>(1000.0f, sampleRate);
    _ducker = std::make_unique<SidechainDucker>(sampleRate, _duckDepth);
    _comp   = std::make_unique<BusCompressor>(sampleRate);

    // Apply default FX settings
    _reverb->setSize(0.72f); _reverb->setDamp(0.5f);
    _delay->setTime(375.0f);

    // Default sends for each track (mirrors makeTrack() in state.svelte.ts)
    const bool drumTrack[MAX_TRACKS] = { true, true, true, false, false, false, false, false };
    for (int i = 0; i < MAX_TRACKS; ++i) {
        _tracks[i].reverbSend = drumTrack[i] ? 0.08f : 0.25f;
        _tracks[i].delaySend  = drumTrack[i] ? 0.00f : 0.12f;
    }
}

// ── Transport ─────────────────────────────────────────────────────────────────

void Engine::play() {
    _playing     = true;
    _sampleAccum = 0.0;
}

void Engine::stop() {
    _playing = false;
    for (int i = 0; i < MAX_TRACKS; ++i) {
        _playheads[i] = 0;
        if (_voices[i]) _voices[i]->reset();
    }
}

// ── Pattern setters ───────────────────────────────────────────────────────────

void Engine::setParams(const EngineParams& p) {
    _bpm = p.bpm;
    _samplesPerStep = (60.0 / _bpm / 4.0) * _sampleRate;
}

void Engine::setTrack(int idx, const Track& t) {
    if (idx >= 0 && idx < MAX_TRACKS) _tracks[idx] = t;
}

void Engine::setMute(int idx, bool muted) {
    if (idx >= 0 && idx < MAX_TRACKS) _tracks[idx].muted = muted;
}

void Engine::setSteps(int idx, uint8_t steps) {
    if (idx >= 0 && idx < MAX_TRACKS)
        _tracks[idx].steps = static_cast<uint8_t>(std::max(1, std::min((int)steps, MAX_STEPS)));
}

void Engine::setTrig(int trackIdx, int stepIdx, bool active, uint8_t note, float velocity) {
    if (trackIdx < 0 || trackIdx >= MAX_TRACKS) return;
    if (stepIdx  < 0 || stepIdx  >= MAX_STEPS)  return;
    auto& trig    = _tracks[trackIdx].trigs[stepIdx];
    trig.active   = active;
    trig.note     = note;
    trig.velocity = velocity < 0.0f ? 0.0f : (velocity > 1.0f ? 1.0f : velocity);
}

void Engine::setTrackSends(int trackIdx, float reverbSend, float delaySend) {
    if (trackIdx < 0 || trackIdx >= MAX_TRACKS) return;
    _tracks[trackIdx].reverbSend = std::min(1.0f, std::max(0.0f, reverbSend));
    _tracks[trackIdx].delaySend  = std::min(1.0f, std::max(0.0f, delaySend));
}

void Engine::setFx(const FxParams& fx) {
    _delayFeedback = fx.delayFeedback;
    _duckDepth     = fx.duckDepth;
    _compThreshold = fx.compThreshold;
    _compRatio     = fx.compRatio;
    _compMakeup    = fx.compMakeup;
    if (_reverb) { _reverb->setSize(fx.reverbSize); _reverb->setDamp(fx.reverbDamp); }
    if (_delay)  { _delay->setTime(fx.delayTime); }
    if (_ducker) { _ducker->setRelease(fx.duckRelease); }
}

// ── Process ───────────────────────────────────────────────────────────────────

void Engine::process(float* outL, float* outR) {
    for (int s = 0; s < _blockSize; ++s) {
        // Kick signal bypasses sidechain; everything else gets ducked
        float kickDry = 0.0f;
        float restL   = 0.0f, restR   = 0.0f;
        float reverbIn = 0.0f, delayIn = 0.0f;

        if (_playing) {
            _sampleAccum += 1.0;
            if (_sampleAccum >= _samplesPerStep) {
                _sampleAccum -= _samplesPerStep;
                _advanceStep();
            }
            for (int t = 0; t < MAX_TRACKS; ++t) {
                if (!_voices[t] || _tracks[t].muted) continue;
                const float sig = _voices[t]->tick();
                if (t == 0) {
                    kickDry += sig;  // kick: no ducking
                } else {
                    restL += sig;
                    restR += sig;
                }
                reverbIn += sig * _tracks[t].reverbSend;
                delayIn  += sig * _tracks[t].delaySend;
            }
        }

        // FX run always (reverb/delay tails decay naturally after stop)
        float revL = 0.0f, revR = 0.0f;
        float delL = 0.0f, delR = 0.0f;
        if (_reverb) _reverb->process(reverbIn, revL, revR);
        if (_delay)  _delay->process(delayIn, delayIn, _delayFeedback, delL, delR);

        // Sidechain: kick punches through; rest + FX are ducked
        const float duck = _ducker ? _ducker->tick() : 1.0f;
        const float mixL = kickDry + (restL + revL + delL) * duck;
        const float mixR = kickDry + (restR + revR + delR) * duck;

        // Bus compressor
        float cL = mixL, cR = mixR;
        if (_comp) _comp->process(mixL, mixR, _compThreshold, _compRatio, _compMakeup, cL, cR);

        // Final limiter: tanh with 1.6× drive — harmonic saturation + hard roof
        outL[s] = std::tanh(cL * 1.6f) * 0.92f;
        outR[s] = std::tanh(cR * 1.6f) * 0.92f;
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

void Engine::_advanceStep() {
    for (int t = 0; t < MAX_TRACKS; ++t) {
        const auto& track = _tracks[t];
        if (track.steps == 0) continue;
        _playheads[t] = (_playheads[t] + 1) % track.steps;
        const Trig& trig = track.trigs[_playheads[t]];
        if (trig.active && !track.muted) {
            _triggerVoice(t, trig);
            // Kick (track 0) triggers sidechain ducking
            if (t == 0 && _ducker) _ducker->trigger(_duckDepth);
        }
    }
}

void Engine::_triggerVoice(int trackIdx, const Trig& trig) {
    if (_voices[trackIdx])
        _voices[trackIdx]->noteOn(trig.note, trig.velocity);
}

} // namespace inboil
