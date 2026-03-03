<script lang="ts">
  import { pattern, ui, setTrackSend } from '../state.svelte.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { slide } from 'svelte/transition'
  import Knob from './Knob.svelte'

  let { hideHandle = false }: { hideHandle?: boolean } = $props()

  const track = $derived(pattern.tracks[ui.selectedTrack])
  const params = $derived(getParamDefs(ui.selectedTrack, track.synthType))

  // Group params into categories for tab switching
  interface ParamCategory { id: string; label: string; params: typeof params }
  const paramCategories = $derived((): ParamCategory[] => {
    const cats: ParamCategory[] = [{ id: 'mix', label: 'MIX', params: [] }]
    let currentGroup: string | null = null
    for (const p of params) {
      const g = p.group ?? ''
      if (g !== currentGroup) {
        currentGroup = g
        cats.push({ id: g || '_main', label: (g || 'SYNTH').toUpperCase().slice(0, 4), params: [] })
      }
      cats[cats.length - 1].params.push(p)
    }
    cats.push({ id: 'fx', label: 'FX', params: [] })
    return cats
  })

  let paramTab = $state('mix')
  let collapsed = $state(true)
  $effect(() => {
    void ui.selectedTrack
    const cats = paramCategories()
    if (!cats.find(c => c.id === paramTab)) paramTab = 'mix'
  })
</script>

{#if !hideHandle}
  <!-- Drawer handle (standalone mode, e.g. fx/eq views) -->
  <button class="drawer-handle" onpointerdown={() => { collapsed = !collapsed }} aria-label="Toggle params">
    <span class="handle-pill"></span>
  </button>
{/if}

{#if hideHandle || !collapsed}
  <div transition:slide={{ duration: 50 }}>
  <!-- Param category tabs -->
  <div class="param-tabs">
    {#each paramCategories() as cat}
      <button
        class="param-tab"
        class:active={paramTab === cat.id}
        onpointerdown={() => { paramTab = cat.id }}
      >{cat.label}</button>
    {/each}
  </div>

  <!-- Param knobs for selected category -->
  <div class="params-bar">
    {#if paramTab === 'mix'}
      <Knob value={track.volume} label="VOL" size={40} onchange={v => { pattern.tracks[ui.selectedTrack].volume = v }} />
      <Knob value={(track.pan + 1) / 2} label="PAN" size={40} onchange={v => { pattern.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
    {:else if paramTab === 'fx'}
      <Knob value={track.reverbSend} label="VERB" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
      <Knob value={track.delaySend} label="DLY" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
      <Knob value={track.glitchSend} label="GLT" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
      <Knob value={track.granularSend} label="GRN" size={40} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
    {:else}
      {@const cat = paramCategories().find(c => c.id === paramTab)}
      {#if cat}
        {#each cat.params as p}
          <span data-tip={p.tip ?? 'Drag to adjust'} data-tip-ja={p.tipJa ?? 'ドラッグで調整'}>
          <Knob
            value={normalizeParam(p, knobValue(p))}
            label={p.label}
            size={40}
            locked={isParamLocked(p.key)}
            steps={paramSteps(p)}
            displayValue={displayLabel(p, knobValue(p))}
            onchange={v => knobChange(p, v)}
          />
          </span>
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Track indicator dots -->
  <div class="track-dots">
    {#each pattern.tracks as _t, i}
      <button
        class="dot"
        class:active={i === ui.selectedTrack}
        onpointerdown={() => { ui.selectedTrack = i }}
        aria-label="Track {i + 1}"
      ></button>
    {/each}
  </div>
  </div>
{/if}

<style>
  /* ── Drawer handle ── */
  .drawer-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 0 4px;
    background: var(--color-fg);
    border: none;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .handle-pill {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: rgba(237,232,220,0.25);
    transition: background 120ms;
  }
  .drawer-handle:active .handle-pill {
    background: rgba(237,232,220,0.50);
  }

  /* ── Param category tabs ── */
  .param-tabs {
    display: flex;
    background: var(--color-fg);
    flex-shrink: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .param-tab {
    flex-shrink: 0;
    padding: 5px 10px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.35);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
  }
  .param-tab.active {
    color: rgba(237,232,220,0.90);
    border-bottom-color: var(--color-olive);
  }

  /* ── Params bar ── */
  .params-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-fg);
    flex-shrink: 0;
    padding: 6px 10px;
    gap: 6px;
  }

  /* ── Track dots ── */
  .track-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: var(--color-fg);
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(237,232,220,0.35);
    background: transparent;
    padding: 0;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }
</style>
