<script lang="ts">
  import { perf, effects, masterPad, pushUndo } from '../state.svelte.ts'
  import Knob from './Knob.svelte'

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
    if (key === 'gain') perf.masterGain = v
    else if (key === 'mkp') effects.comp.makeup = 1 + v * 3
    else if (key === 'atk') effects.comp.attack = 0.1 + v * 29.9
    else if (key === 'rel') effects.comp.release = 10 + v * 290
    else perf.swing = v
  }

  function masterKnobDisplay(key: MasterKnobKey): string {
    if (key === 'gain') return `${Math.round(perf.masterGain * 100)}%`
    if (key === 'mkp') return `${effects.comp.makeup.toFixed(1)}×`
    if (key === 'atk') return `${effects.comp.attack.toFixed(1)}ms`
    if (key === 'rel') return `${Math.round(effects.comp.release)}ms`
    return `${Math.round(perf.swing * 100)}%`
  }

  type MasterPadKey = 'comp' | 'duck' | 'ret'
  const MASTER_PAD_NODES: { key: MasterPadKey; label: string; xLabel: string; yLabel: string; tip: string; tipJa: string }[] = [
    { key: 'comp', label: 'COMP', xLabel: 'THR', yLabel: 'RAT', tip: 'Compressor — threshold / ratio', tipJa: 'コンプレッサー — スレッショルド / レシオ' },
    { key: 'duck', label: 'DUCK', xLabel: 'DPT', yLabel: 'REL', tip: 'Sidechain ducker — depth / release', tipJa: 'サイドチェインダッカー — 深さ / リリース' },
    { key: 'ret',  label: 'RET',  xLabel: 'VRB', yLabel: 'DLY', tip: 'FX returns — reverb / delay level', tipJa: 'FXリターン — リバーブ / ディレイレベル' },
  ]

  function masterPadXDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `${Math.round((0.1 + st.x * 0.9) * 100)}%`
    if (key === 'duck') return `${Math.round(st.x * 100)}%`
    return `${Math.round(st.x * 200)}%`
  }

  function masterPadYDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `1:${Math.round(1 + st.y * 19)}`
    if (key === 'duck') return `${Math.round(20 + st.y * 480)}ms`
    return `${Math.round(st.y * 200)}%`
  }

  function setMasterPadX(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].x = v
  }

  function setMasterPadY(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].y = v
  }

  function toggleMasterPadOn(key: MasterPadKey) {
    pushUndo('Master toggle')
    masterPad[key].on = !masterPad[key].on
  }
</script>

<span class="section-label">MASTER</span>
<div class="master-dock-knobs">
  {#each MASTER_KNOBS as mk}
    <span data-tip={mk.tip} data-tip-ja={mk.tipJa}>
      <Knob
        value={getMasterKnobValue(mk.key)}
        label={mk.label}
        size={32}
        displayValue={masterKnobDisplay(mk.key)}
        onchange={v => setMasterKnobValue(mk.key, v)}
      />
    </span>
  {/each}
</div>
<span class="section-label mst-sub">XY PAD</span>
<div class="master-dock-grid">
  {#each MASTER_PAD_NODES as node}
    {@const st = masterPad[node.key]}
    <div class="master-dock-band" class:disabled={!st.on}>
      <button
        class="fx-dock-toggle"
        class:active={st.on}
        aria-pressed={st.on}
        onpointerdown={() => toggleMasterPadOn(node.key)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >{node.label}</button>
      <div class="fx-dock-knobs">
        <Knob
          value={st.x}
          label={node.xLabel}
          size={32}
          displayValue={masterPadXDisplay(node.key)}
          onchange={v => setMasterPadX(node.key, v)}
        />
        <Knob
          value={st.y}
          label={node.yLabel}
          size={32}
          displayValue={masterPadYDisplay(node.key)}
          onchange={v => setMasterPadY(node.key, v)}
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .section-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220, 0.4);
    padding-bottom: 2px;
  }
  .master-dock-knobs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .mst-sub {
    margin-top: 4px;
  }
  .master-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .master-dock-band {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .master-dock-band.disabled {
    opacity: 0.35;
  }
  .fx-dock-toggle {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid rgba(237,232,220, 0.15);
    background: transparent;
    color: rgba(237,232,220, 0.4);
    cursor: pointer;
    border-radius: 2px;
  }
  .fx-dock-toggle.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .fx-dock-knobs {
    display: flex;
    gap: 4px;
  }
</style>
