<script lang="ts">
  import { perf, effects, masterPad, fxPad, pushUndo } from '../state.svelte.ts'
  import { captureValue, captureToggle } from '../sweepRecorder.svelte.ts'
  import Knob from './Knob.svelte'
  import VFader from './VFader.svelte'

  type MasterKnobKey = 'gain' | 'mkp' | 'atk' | 'rel' | 'swg'
  const MASTER_KNOBS: { key: MasterKnobKey; label: string; tip: string; tipJa: string }[] = [
    { key: 'gain', label: 'GAIN', tip: 'Master output volume', tipJa: 'マスター出力音量' },
    { key: 'mkp',  label: 'MKP',  tip: 'Compressor makeup gain (1–4×)', tipJa: 'コンプレッサーメイクアップゲイン (1–4×)' },
    { key: 'atk',  label: 'ATK',  tip: 'Compressor attack (0.1–30ms)', tipJa: 'コンプレッサーアタック (0.1–30ms)' },
    { key: 'rel',  label: 'REL',  tip: 'Compressor release (10–300ms)', tipJa: 'コンプレッサーリリース (10–300ms)' },
    { key: 'swg',  label: 'SWG',  tip: 'Swing amount (shuffle feel)', tipJa: 'スウィング量 (シャッフル感)' },
  ]

  function getMasterKnobValue(key: MasterKnobKey): number {
    if (key === 'gain') return perf.masterGain
    if (key === 'mkp') return (effects.comp.makeup - 1) / 3
    if (key === 'atk') return (effects.comp.attack - 0.1) / 29.9
    if (key === 'rel') return (effects.comp.release - 10) / 290
    return perf.swing
  }

  function setMasterKnobValue(key: MasterKnobKey, v: number) {
    pushUndo('Master knob')
    if (key === 'gain') { perf.masterGain = v; captureValue({ kind: 'master', param: 'masterVolume' }, v) }
    else if (key === 'mkp') effects.comp.makeup = 1 + v * 3
    else if (key === 'atk') effects.comp.attack = 0.1 + v * 29.9
    else if (key === 'rel') effects.comp.release = 10 + v * 290
    else { perf.swing = v; captureValue({ kind: 'master', param: 'swing' }, v) }
  }

  function masterKnobDisplay(key: MasterKnobKey): string {
    if (key === 'gain') return `${Math.round(perf.masterGain * 100)}%`
    if (key === 'mkp') return `${effects.comp.makeup.toFixed(1)}×`
    if (key === 'atk') return `${effects.comp.attack.toFixed(1)}ms`
    if (key === 'rel') return `${Math.round(effects.comp.release)}ms`
    return `${Math.round(perf.swing * 100)}%`
  }

  type MasterPadKey = 'comp' | 'duck' | 'ret' | 'sat'

  function masterPadXDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `${Math.round((0.1 + st.x * 0.9) * 100)}%`
    if (key === 'duck') return `${Math.round(st.x * 100)}%`
    if (key === 'sat')  return `${(0.1 + st.x * 2.9).toFixed(1)}`
    return `${Math.round(st.x * 200)}%`
  }

  function masterPadYDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `1:${Math.round(1 + st.y * 19)}`
    if (key === 'duck') return `${Math.round(20 + st.y * 480)}ms`
    if (key === 'sat')  return `${Math.round(st.y * 100)}%`
    return `${Math.round(st.y * 200)}%`
  }

  const MPAD_X: Record<MasterPadKey, 'compThreshold' | 'duckDepth' | 'retVerb' | 'satDrive'> = {
    comp: 'compThreshold', duck: 'duckDepth', ret: 'retVerb', sat: 'satDrive',
  }
  const MPAD_Y: Record<MasterPadKey, 'compRatio' | 'duckRelease' | 'retDelay' | 'satTone'> = {
    comp: 'compRatio', duck: 'duckRelease', ret: 'retDelay', sat: 'satTone',
  }

  function setMasterPadX(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].x = v
    captureValue({ kind: 'master', param: MPAD_X[key] }, v)
  }

  function setMasterPadY(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].y = v
    captureValue({ kind: 'master', param: MPAD_Y[key] }, v)
  }

  function toggleMasterPadOn(key: MasterPadKey) {
    pushUndo('Master toggle')
    masterPad[key].on = !masterPad[key].on
    captureToggle({ kind: 'masterFxOn', param: key }, masterPad[key].on)
  }

  // DJ Filter (state in fxPad.filter for backwards compatibility)
  function filterFreqDisplay(x: number): string {
    const f = x <= 0.5 ? 80 * Math.pow(250, x / 0.5) : 20 * Math.pow(400, (x - 0.5) / 0.5)
    return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`
  }
  function toggleFilterOn() {
    pushUndo('Toggle filter')
    fxPad.filter.on = !fxPad.filter.on
    captureToggle({ kind: 'fxOn', fx: 'filter' }, fxPad.filter.on)
  }
  function setFilterX(v: number) { pushUndo('Filter'); fxPad.filter.x = v; captureValue({ kind: 'master', param: 'filterCutoff' }, v) }
  function setFilterY(v: number) { pushUndo('Filter'); fxPad.filter.y = v; captureValue({ kind: 'master', param: 'filterResonance' }, v) }
</script>

<span class="section-label">MASTER</span>
<div class="master-dock-groups">
  <!-- OUTPUT + SAT side by side -->
  <div class="pad-row">
    <div class="master-dock-group pad-half">
      <span class="group-label">OUTPUT</span>
      <div class="master-dock-faders">
        {#each MASTER_KNOBS.filter(mk => mk.key === 'gain' || mk.key === 'swg') as mk}
          <span data-tip={mk.tip} data-tip-ja={mk.tipJa}>
            <VFader
              value={getMasterKnobValue(mk.key)}
              label={mk.label}
              height={52}
              displayValue={masterKnobDisplay(mk.key)}
              onchange={v => setMasterKnobValue(mk.key, v)}
            />
          </span>
        {/each}
      </div>
    </div>
    <div class="master-dock-group pad-half" class:disabled={!masterPad.sat.on} style:--fx-color="var(--color-purple)">
      <div class="pad-header">
        <button class="fx-dock-toggle" class:active={masterPad.sat.on} aria-pressed={masterPad.sat.on}
          onpointerdown={() => toggleMasterPadOn('sat')}
          data-tip="Tape saturator — drive / tone" data-tip-ja="テープサチュレーター — ドライブ / トーン"
        >SAT</button>
      </div>
      <div class="fx-dock-knobs">
        <Knob value={masterPad.sat.x} label="DRV" size={36} displayValue={masterPadXDisplay('sat')} onchange={v => setMasterPadX('sat', v)} />
        <Knob value={masterPad.sat.y} label="TNE" size={36} displayValue={masterPadYDisplay('sat')} onchange={v => setMasterPadY('sat', v)} />
      </div>
    </div>
  </div>
  <!-- COMP (full width — has extra knobs) -->
  <div class="master-dock-group" class:disabled={!masterPad.comp.on} style:--fx-color="var(--color-olive)">
    <div class="pad-header">
      <button class="fx-dock-toggle" class:active={masterPad.comp.on} aria-pressed={masterPad.comp.on}
        onpointerdown={() => toggleMasterPadOn('comp')}
        data-tip="Compressor — threshold / ratio" data-tip-ja="コンプレッサー — スレッショルド / レシオ"
      >COMP</button>
    </div>
    <div class="fx-dock-knobs">
      <Knob value={masterPad.comp.x} label="THR" size={36} displayValue={masterPadXDisplay('comp')} onchange={v => setMasterPadX('comp', v)} />
      <Knob value={masterPad.comp.y} label="RAT" size={36} displayValue={masterPadYDisplay('comp')} onchange={v => setMasterPadY('comp', v)} />
      {#each MASTER_KNOBS.filter(mk => mk.key === 'mkp' || mk.key === 'atk' || mk.key === 'rel') as mk}
        <span data-tip={mk.tip} data-tip-ja={mk.tipJa}>
          <Knob value={getMasterKnobValue(mk.key)} label={mk.label} size={36} displayValue={masterKnobDisplay(mk.key)} onchange={v => setMasterKnobValue(mk.key, v)} />
        </span>
      {/each}
    </div>
  </div>
  <!-- DUCK + RET side by side -->
  <div class="pad-row">
    <div class="master-dock-group pad-half" class:disabled={!masterPad.duck.on} style:--fx-color="var(--color-blue)">
      <div class="pad-header">
        <button class="fx-dock-toggle" class:active={masterPad.duck.on} aria-pressed={masterPad.duck.on}
          onpointerdown={() => toggleMasterPadOn('duck')}
          data-tip="Sidechain ducker — depth / release" data-tip-ja="サイドチェインダッカー — 深さ / リリース"
        >DUCK</button>
      </div>
      <div class="fx-dock-knobs">
        <Knob value={masterPad.duck.x} label="DPT" size={36} displayValue={masterPadXDisplay('duck')} onchange={v => setMasterPadX('duck', v)} />
        <Knob value={masterPad.duck.y} label="REL" size={36} displayValue={masterPadYDisplay('duck')} onchange={v => setMasterPadY('duck', v)} />
      </div>
    </div>
    <div class="master-dock-group pad-half" class:disabled={!masterPad.ret.on} style:--fx-color="var(--color-salmon)">
      <div class="pad-header">
        <button class="fx-dock-toggle" class:active={masterPad.ret.on} aria-pressed={masterPad.ret.on}
          onpointerdown={() => toggleMasterPadOn('ret')}
          data-tip="FX returns — reverb / delay level" data-tip-ja="FXリターン — リバーブ / ディレイレベル"
        >RET</button>
      </div>
      <div class="fx-dock-knobs">
        <Knob value={masterPad.ret.x} label="VRB" size={36} displayValue={masterPadXDisplay('ret')} onchange={v => setMasterPadX('ret', v)} />
        <Knob value={masterPad.ret.y} label="DLY" size={36} displayValue={masterPadYDisplay('ret')} onchange={v => setMasterPadY('ret', v)} />
      </div>
    </div>
  </div>
  <!-- DJ Filter (master bus) -->
  <div class="master-dock-group" class:disabled={!fxPad.filter.on} style:--fx-color="var(--color-teal)">
    <div class="pad-header">
      <button class="fx-dock-toggle" class:active={fxPad.filter.on} aria-pressed={fxPad.filter.on}
        onpointerdown={toggleFilterOn}
        data-tip="DJ Filter — frequency sweep / resonance" data-tip-ja="DJフィルター — 周波数スウィープ / レゾナンス"
      >FLTR</button>
    </div>
    <div class="fx-dock-knobs">
      <Knob value={fxPad.filter.x} label="FREQ" size={36} displayValue={filterFreqDisplay(fxPad.filter.x)} onchange={setFilterX} />
      <Knob value={fxPad.filter.y} label="RESO" size={36} displayValue={`${Math.round(fxPad.filter.y * 100)}%`} onchange={setFilterY} />
    </div>
  </div>
</div>

<style>
  .section-label {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-transport-border);
    padding-bottom: 2px;
  }
  .master-dock-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
  .master-dock-group {
    padding: 6px 8px;
    border: 1px solid var(--dz-border);
    border-radius: 0;
  }
  .group-label {
    display: block;
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dz-text-mid);
    margin-bottom: 6px;
  }
  .master-dock-faders {
    display: flex;
    gap: 16px;
  }
  .master-dock-group.disabled {
    opacity: 0.35;
  }
  .pad-row {
    display: flex;
    gap: 8px;
  }
  .pad-half {
    flex: 1;
    min-width: 0;
  }
  .pad-half .fx-dock-knobs {
    flex-wrap: wrap;
  }
  .pad-header {
    margin-bottom: 6px;
  }
  .fx-dock-toggle {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-transport-border);
    cursor: pointer;
    border-radius: 0;
  }
  .fx-dock-toggle.active {
    background: var(--fx-color, var(--color-olive));
    border-color: var(--fx-color, var(--color-olive));
    color: var(--color-bg);
  }
  .fx-dock-knobs {
    display: flex;
    gap: 4px;
  }
</style>
