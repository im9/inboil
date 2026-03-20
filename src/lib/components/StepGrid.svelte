<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte'
  import { song, activeCell, playback, ui, trackDisplayName, pushUndo } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import { toggleTrig, toggleMute, toggleSolo, setTrigVelocity, setTrigChance, setParamLock, setTrackSteps, setTrackSend, isDrum, STEP_OPTIONS, addTrack, removeTrack, resetSeqParams, cycleTrackScale, SCALE_OPTIONS } from '../stepActions.ts'
  import type { Trig } from '../types.ts'
  import PianoRoll from './PianoRoll.svelte'
  import Knob from './Knob.svelte'
  import { trackPlkValue, trackPlkChange, isTrackPlkLocked } from '../paramHelpers.ts'
  import { relativeCoords, stepIndexFromX } from '../domHelpers.ts'

  // ── Step paging (hardware-style 16-step pages) ──
  const PAGE_SIZE = 16
  const maxSteps = $derived(Math.max(...song.patterns[ui.currentPattern].cells.map(c => c.steps)))
  const totalPages = $derived(Math.ceil(maxSteps / PAGE_SIZE))
  const needsPaging = $derived(maxSteps > PAGE_SIZE)
  const pageStart = $derived(ui.stepPage * PAGE_SIZE)
  const pageEnd = $derived(Math.min(maxSteps, pageStart + PAGE_SIZE))

  // Clamp page when step count shrinks
  $effect(() => {
    const max = totalPages  // track reactive dep
    const cur = untrack(() => ui.stepPage)
    if (cur >= max) ui.stepPage = Math.max(0, max - 1)
  })

  // Auto-follow playhead during playback — track the longest track's playhead
  $effect(() => {
    if (!playback.playing || !needsPaging) return
    // Find the track with the most steps (the one that actually uses multiple pages)
    const cells = song.patterns[ui.currentPattern].cells
    let longestTrackId = 0, longestSteps = 0
    for (const c of cells) {
      if (c.steps > longestSteps) { longestSteps = c.steps; longestTrackId = c.trackId }
    }
    const head = playback.playheads[longestTrackId]
    if (head == null) return
    const headPage = Math.floor(head / PAGE_SIZE)
    if (headPage !== untrack(() => ui.stepPage)) ui.stepPage = headPage
  })

  // Force scroll recalc after mount — transition:fly on parent can delay layout
  let scrollEl: HTMLDivElement | undefined = $state(undefined)
  onMount(() => {
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.style.overflowY = 'hidden'
        void scrollEl.offsetHeight
        scrollEl.style.overflowY = ''
      }
    })
  })

  function cycleSteps(trackId: number) {
    const current = activeCell(trackId).steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    setTrackSteps(trackId, STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length])
  }

  // ── PO-style step-set mode (long-press step button → tap grid to set length) ──
  let stepSetTrack: number | null = $state(null)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const STEP_SET_MAX = 16
  const EXT_STEPS = [24, 32, 48, 64] as const

  function stepPointerDown(_e: PointerEvent, trackId: number) {
    // If already in step-set mode for this track, dismiss
    if (stepSetTrack === trackId) {
      stepSetTrack = null
      return
    }
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      stepSetTrack = trackId
    }, 300)
  }

  function stepPointerUp(trackId: number) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (!longPressTriggered && stepSetTrack !== trackId) cycleSteps(trackId)
  }

  function stepContextMenu(e: Event, trackId: number) {
    e.preventDefault()
    stepSetTrack = stepSetTrack === trackId ? null : trackId
  }

  function pickStepCount(n: number) {
    if (stepSetTrack != null) setTrackSteps(stepSetTrack, n)
    stepSetTrack = null
  }

  onDestroy(() => { if (longPressTimer) clearTimeout(longPressTimer) })

  // ── Remove track (× button in expanded vel row) ──
  let removeTrackId: number | null = $state(null)

  function confirmRemoveTrack() {
    if (removeTrackId != null) {
      removeTrack(removeTrackId)
      removeTrackId = null
    }
  }

  // ── Velocity / automation row modes (ADR 093) ──
  type VelMode = 'VEL' | 'CHNC' | 'VOL' | 'PAN' | 'VERB' | 'DLY' | 'GLT' | 'GRN'
  const VEL_MODES: VelMode[] = ['VEL', 'CHNC', 'VOL', 'PAN', 'VERB', 'DLY', 'GLT', 'GRN']
  const VEL_MODE_COLORS: Record<VelMode, string> = {
    VEL: '', CHNC: '#4472B4', VOL: '#508080', PAN: '#508080',
    VERB: '#787845', DLY: '#4472B4', GLT: '#E8A090', GRN: '#9B6BA0',
  }
  const VEL_MODE_KEYS: Record<VelMode, string> = {
    VEL: '', CHNC: '', VOL: 'vol', PAN: 'pan',
    VERB: 'reverbSend', DLY: 'delaySend', GLT: 'glitchSend', GRN: 'granularSend',
  }

  let velContainer: HTMLDivElement | undefined = $state(undefined)
  let velDragging = $state(false)
  let velMode: VelMode = $state('VEL')
  const modeColor = $derived(VEL_MODE_COLORS[velMode])
  const isPlkMode = $derived(velMode !== 'VEL' && velMode !== 'CHNC')
  const MIX_MODES: VelMode[] = ['VOL', 'PAN']
  const FX_MODES: VelMode[] = ['VERB', 'DLY', 'GLT', 'GRN']
  const isMixMode = $derived((MIX_MODES as readonly string[]).includes(velMode))
  const isFxMode = $derived((FX_MODES as readonly string[]).includes(velMode))

  function velNextMode() {
    const i = VEL_MODES.indexOf(velMode)
    velMode = VEL_MODES[(i + 1) % VEL_MODES.length]
  }
  function velNextMix() {
    const i = MIX_MODES.indexOf(velMode)
    velMode = MIX_MODES[(i + 1) % MIX_MODES.length]
  }
  function velNextFx() {
    const i = FX_MODES.indexOf(velMode)
    velMode = FX_MODES[(i + 1) % FX_MODES.length]
  }

  /** Read the displayed value (0–1) for a trig in the current mode */
  function velReadValue(trig: Trig): number {
    switch (velMode) {
      case 'VEL': return trig.velocity
      case 'CHNC': return trig.chance ?? 1
      case 'PAN': return (trig.paramLocks?.pan ?? 0) * 0.5 + 0.5  // -1..1 → 0..1
      default: {
        const key = VEL_MODE_KEYS[velMode]
        return key ? (trig.paramLocks?.[key] ?? 0) : 0
      }
    }
  }

  function velStartDrag(e: PointerEvent, trackId: number, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (e.shiftKey) velNextMode()
    velDragging = true
    velApply(e, trackId, idx)
  }

  function velOnMove(e: PointerEvent) {
    if (!velDragging || !velContainer) return
    const trackId = ui.selectedTrack
    const { x: relX } = relativeCoords(e, velContainer)
    const visibleCount = Math.min(activeCell(trackId).steps, pageEnd) - pageStart
    const localIdx = stepIndexFromX(relX, 26, 0, visibleCount - 1)
    velApply(e, trackId, pageStart + localIdx)
  }

  function velApply(e: PointerEvent, trackId: number, idx: number) {
    if (!velContainer) return
    const cell = velContainer.children[idx - pageStart] as HTMLElement
    if (!cell) return
    const rect = cell.getBoundingClientRect()
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    if (velMode === 'VEL') {
      setTrigVelocity(trackId, idx, v)
    } else if (velMode === 'CHNC') {
      setTrigChance(trackId, idx, v)
    } else if (velMode === 'PAN') {
      setParamLock(trackId, idx, 'pan', v * 2 - 1)  // 0..1 → -1..1
    } else {
      const key = VEL_MODE_KEYS[velMode]
      if (key) setParamLock(trackId, idx, key, v)
    }
  }

  function velEndDrag() {
    velDragging = false
  }

  // ── Vel-bar mount animation (one-shot) ──
  let velMounting = $state(true)
  $effect(() => {
    velMounting = true
    void ui.selectedTrack  // re-trigger on track change
    tick().then(() => { velMounting = false })
  })

  // ── Vel-fill grow/shrink animation on trig toggle ──
  let growing: Set<string> = $state(new Set())
  let shrinking: Set<string> = $state(new Set())
  const timers = new Map<string, number>()

  onDestroy(() => { timers.forEach(id => clearTimeout(id)); timers.clear() })

  function handleToggle(trackId: number, stepIdx: number) {
    const trig = activeCell(trackId).trigs[stepIdx]
    const key = `${trackId}-${stepIdx}`
    // Cancel any pending timer for this step to avoid stacking
    if (timers.has(key)) { clearTimeout(timers.get(key)!); timers.delete(key) }

    if (trig.active) {
      // Turn OFF → toggle immediately + play shrink simultaneously
      toggleTrig(trackId, stepIdx)
      shrinking = new Set([...shrinking, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        shrinking = new Set([...shrinking].filter(k => k !== key))
      }, 180))
    } else {
      // Turn ON → toggle immediately + play grow simultaneously
      toggleTrig(trackId, stepIdx)
      growing = new Set([...growing, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        growing = new Set([...growing].filter(k => k !== key))
      }, 180))
    }
  }

  // ── Step drag-to-paint state ──
  let stepDragging = $state(false)
  let stepPaintOn = $state(true)
  let stepDragTrack = $state(-1)
  let stepVisited = new Set<number>()
  let stepStepsEl: HTMLElement | null = null

  function stepStartDrag(e: PointerEvent, trackId: number, stepIdx: number) {
    e.preventDefault()
    // Lock mode: select step instead of toggling
    if (ui.lockMode) {
      ui.selectedTrack = trackId
      ui.selectedStep = ui.selectedStep === stepIdx && ui.selectedTrack === trackId ? null : stepIdx
      return
    }
    const trig = activeCell(trackId).trigs[stepIdx]
    stepPaintOn = !trig.active
    stepDragTrack = trackId
    stepDragging = true
    stepVisited = new Set([stepIdx])
    stepStepsEl = (e.currentTarget as HTMLElement).closest('.steps') as HTMLElement
    stepStepsEl?.setPointerCapture(e.pointerId)
    handleToggle(trackId, stepIdx)
  }

  function stepOnMove(e: PointerEvent) {
    if (!stepDragging || !stepStepsEl) return
    const { x: relX } = relativeCoords(e, stepStepsEl)
    const ph = activeCell(stepDragTrack)
    const visibleCount = Math.min(ph.steps, pageEnd) - pageStart
    const localIdx = stepIndexFromX(relX, 26, 0, visibleCount - 1)
    const idx = pageStart + localIdx
    if (stepVisited.has(idx)) return
    stepVisited.add(idx)
    const trig = ph.trigs[idx]
    if (stepPaintOn && !trig.active) handleToggle(stepDragTrack, idx)
    else if (!stepPaintOn && trig.active) handleToggle(stepDragTrack, idx)
  }

  function stepEndDrag() {
    stepDragging = false
    stepStepsEl = null
  }

  // ── Keyboard navigation for step buttons ──
  function stepKeydown(e: KeyboardEvent, trackId: number, stepIdx: number) {
    const cells = song.patterns[ui.currentPattern].cells
    const steps = activeCell(trackId).steps
    let targetTrack = trackId
    let targetStep = stepIdx

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        targetStep = stepIdx > 0 ? stepIdx - 1 : steps - 1
        break
      case 'ArrowRight':
        e.preventDefault()
        targetStep = stepIdx < steps - 1 ? stepIdx + 1 : 0
        break
      case 'ArrowUp': {
        e.preventDefault()
        const idx = cells.findIndex(c => c.trackId === trackId)
        if (idx > 0) {
          targetTrack = cells[idx - 1].trackId
          targetStep = Math.min(stepIdx, activeCell(targetTrack).steps - 1)
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        const idx = cells.findIndex(c => c.trackId === trackId)
        if (idx < cells.length - 1) {
          targetTrack = cells[idx + 1].trackId
          targetStep = Math.min(stepIdx, activeCell(targetTrack).steps - 1)
        }
        break
      }
      case 'Enter':
        e.preventDefault()
        handleToggle(trackId, stepIdx)
        return
      default:
        return
    }
    if (targetTrack !== trackId || targetStep !== stepIdx) {
      const btn = scrollEl?.querySelector(`button.step[data-track="${targetTrack}"][data-step="${targetStep}"]`) as HTMLElement
      btn?.focus()
    }
  }
</script>

<div class="step-grid">
{#if needsPaging}
  <div class="page-bar">
    <div class="page-head" style="width: calc(var(--head-w) + 8px)"></div>
    {#each { length: totalPages } as _, p}
      <button
        class="page-btn"
        class:active={ui.stepPage === p}
        onpointerdown={() => { ui.stepPage = p }}
        data-tip="Page {p + 1}" data-tip-ja="ページ {p + 1}"
      >{p + 1}</button>
    {/each}
  </div>
{/if}
<div class="step-grid-scroll" bind:this={scrollEl}>
  {#each song.patterns[ui.currentPattern].cells as ph}
    {@const trackId = ph.trackId}
    {@const track = song.tracks[trackId]}
    {@const selected = ui.selectedTrack === trackId}

    <div
      class="track-group"
      class:selected
      class:muted={track?.muted}
      class:solo-muted={ui.soloTracks.size > 0 && !ui.soloTracks.has(trackId)}
    >
      <div class="track-cols">
        <!-- ── Left column: track controls (single border-right) ── -->
        <div class="track-controls">
          <div class="ctrl-main">
            <button
              class="track-label"
              class:expanded={selected}
              onpointerdown={() => { ui.selectedTrack = selected ? -1 : trackId }}
              data-tip="Expand velocity lane" data-tip-ja="ベロシティレーンを展開"
            >
              <span class="track-name">{trackDisplayName(ph, ui.currentPattern)}</span>
              <svg class="chevron" class:open={selected} viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1,1 5,5 9,1" />
              </svg>
            </button>
            <span class="head-sep"></span>
            <button
              class="btn-steps flip-host"
              onpointerdown={(e) => stepPointerDown(e, trackId)}
              onpointerup={() => stepPointerUp(trackId)}
              onpointerleave={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }}
              oncontextmenu={(e) => stepContextMenu(e, trackId)}
              data-tip="Tap: cycle · Hold: picker" data-tip-ja="タップ: 切替 · 長押し: 選択"
            >
              <span class="flip-card" class:flipped={stepSetTrack === trackId}>
                <span class="flip-face steps-off">{ph.steps}</span>
                <span class="flip-face back steps-on">{ph.steps}</span>
              </span>
            </button>
            <button
              class="btn-scale"
              onpointerdown={() => cycleTrackScale(trackId)}
              data-tip="Step scale (click to cycle)" data-tip-ja="ステップスケール（クリックで切替）"
            >{SCALE_OPTIONS.find(o => o.divisor === (ph.scale ?? 2))?.label ?? '1/16'}</button>
            <button
              class="btn-solo flip-host"
              onpointerdown={() => toggleSolo(trackId)}
              data-tip="Solo/unsolo track" data-tip-ja="トラックをソロ"
            >
              <span class="flip-card" class:flipped={ui.soloTracks.has(trackId)}>
                <span class="flip-face solo-off">S</span>
                <span class="flip-face back solo-on">S</span>
              </span>
            </button>
            <button
              class="btn-mute flip-host"
              onpointerdown={() => toggleMute(trackId)}
              data-tip="Mute/unmute track" data-tip-ja="トラックをミュート"
            >
              <span class="flip-card" class:flipped={track?.muted}>
                <span class="flip-face mute-off">M</span>
                <span class="flip-face back mute-on">M</span>
              </span>
            </button>
          </div>
          {#if selected}
            <div class="ctrl-vel">
              <button class="head-action" onclick={() => resetSeqParams(trackId)}
                data-tip="Reset params to defaults" data-tip-ja="パラメータを初期値に戻す"
              >RST</button>
              <span class="ctrl-spacer"></span>
              <button class="vel-tab" class:active={velMode === 'VEL'}
                onpointerdown={() => { velMode = 'VEL' }}
                data-tip="Velocity per step" data-tip-ja="ステップごとのベロシティ"
              >VEL</button>
              <button class="vel-tab" class:active={velMode === 'CHNC'}
                style="--tab-color: {VEL_MODE_COLORS.CHNC}"
                onpointerdown={() => { velMode = 'CHNC' }}
                data-tip="Trigger probability" data-tip-ja="発火確率"
              >CHNC</button>
              <button class="vel-tab" class:active={isMixMode}
                style={isMixMode ? `--tab-color: ${modeColor}` : `--tab-color: ${VEL_MODE_COLORS.VOL}`}
                onpointerdown={() => { isMixMode ? velNextMix() : (velMode = 'VOL') }}
                data-tip="Per-step VOL / PAN (tap to cycle)" data-tip-ja="ステップごとのVOL / PAN（タップで切替）"
              >{isMixMode ? velMode : 'MIX'}</button>
              <button class="vel-tab" class:active={isFxMode}
                style={isFxMode ? `--tab-color: ${modeColor}` : `--tab-color: ${VEL_MODE_COLORS.VERB}`}
                onpointerdown={() => { isFxMode ? velNextFx() : (velMode = 'VERB') }}
                data-tip="Per-step FX sends (tap to cycle: VERB → DLY → GLT → GRN)" data-tip-ja="ステップごとのFXセンド（タップで切替: VERB → DLY → GLT → GRN）"
              >{isFxMode ? velMode : 'FX'}</button>
            </div>
          {/if}
        </div>

        <!-- ── Right column: step sequencer + mix/send ── -->
        <div class="track-content">
          <div class="track-seq">
          {#if stepSetTrack === trackId}
            <div class="steps step-set-mode" role="application" style="--steps: {STEP_SET_MAX + EXT_STEPS.length}">
              {#each { length: STEP_SET_MAX } as _, stepIdx}
                {@const isActive = stepIdx < ph.steps}
                <button
                  class="step step-set-cell"
                  class:active={isActive}
                  class:current-end={stepIdx === ph.steps - 1}
                  aria-label="Set {stepIdx + 1} steps"
                  onpointerdown={() => pickStepCount(stepIdx + 1)}
                >
                  <span class="step-set-num">{stepIdx + 1}</span>
                </button>
              {/each}
              {#each EXT_STEPS as ext}
                <button
                  class="step step-set-cell ext"
                  class:active={ph.steps === ext}
                  onpointerdown={() => pickStepCount(ext)}
                >
                  <span class="step-set-num">{ext}</span>
                </button>
              {/each}
            </div>
          {:else}
            {@const visibleTrigs = ph.trigs.slice(pageStart, Math.min(ph.steps, pageEnd))}
            <div
              class="steps"
              role="application"
              style="--steps: {visibleTrigs.length}"
              onpointermove={stepOnMove}
              onpointerup={stepEndDrag}
              onpointercancel={stepEndDrag}
              data-tip="Tap or drag to toggle steps" data-tip-ja="タップ/ドラッグでステップを切り替え"
            >
              {#each visibleTrigs as trig, i}
                {@const stepIdx = pageStart + i}
                {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
                {@const isLockSel = ui.lockMode && ui.selectedTrack === trackId && ui.selectedStep === stepIdx}
                {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
                <button
                  class="step flip-host"
                  class:playhead={isPlayhead}
                  class:lock-selected={isLockSel}
                  aria-label="Step {stepIdx + 1}"
                  data-track={trackId}
                  data-step={stepIdx}
                  onpointerdown={(e) => stepStartDrag(e, trackId, stepIdx)}
                  onkeydown={(e) => stepKeydown(e, trackId, stepIdx)}
                >
                  <span class="flip-card" class:flipped={trig.active}>
                    <span class="flip-face step-off"></span>
                    <span class="flip-face back step-on"></span>
                  </span>
                  {#if hasLocks}<span class="lock-dot"></span>{/if}
                  {#if trig.chance != null && trig.chance < 1}<span class="chance-dot"></span>{/if}
                </button>
              {/each}
            </div>
          {/if}
          {#if selected}
            {@const velTrigs = ph.trigs.slice(pageStart, Math.min(ph.steps, pageEnd))}
            <div
              class="vel-bars"
              class:plk-mode={isPlkMode}
              class:chance-mode={velMode === 'CHNC'}
              class:mounting={velMounting}
              style="--steps: {velTrigs.length}{modeColor ? `; --plk-color: ${modeColor}` : ''}"
              role="application"
              bind:this={velContainer}
              onpointermove={velOnMove}
              onpointerup={velEndDrag}
              onpointercancel={velEndDrag}
              data-tip={velMode === 'VEL' ? "Drag up/down to adjust velocity" : velMode === 'CHNC' ? "Drag to set step probability" : `Drag to set per-step ${velMode}`}
              data-tip-ja={velMode === 'VEL' ? "上下ドラッグでベロシティを調整" : velMode === 'CHNC' ? "ドラッグで発火確率を調整" : `ドラッグでステップごとの${velMode}を調整`}
            >
              {#each velTrigs as trig, i}
                {@const stepIdx = pageStart + i}
                {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
                {@const isActive = trig.active || shrinking.has(`${trackId}-${stepIdx}`)}
                {@const barHeight = isPlkMode ? velReadValue(trig) * 100 : (velMode === 'CHNC' && isActive ? (trig.chance ?? 1) * 100 : trig.velocity * 100)}
                {@const hasChance = trig.active && trig.chance != null && trig.chance < 1}
                <div
                  class="vel-cell"
                  role="slider"
                  tabindex="-1"
                  aria-valuenow={velReadValue(trig)}
                  onpointerdown={e => velStartDrag(e, trackId, stepIdx)}
                >
                  <div
                    class="vel-fill"
                    class:active={isPlkMode ? barHeight > 0 : isActive}
                    class:growing={growing.has(`${trackId}-${stepIdx}`)}
                    class:shrinking={shrinking.has(`${trackId}-${stepIdx}`)}
                    class:playhead={isPlayhead}
                    style="height: {barHeight}%{velMode === 'VEL' && hasChance ? `; opacity: ${(0.3 + (trig.chance!) * 0.4).toFixed(2)}` : ''}"
                  ></div>
                </div>
              {/each}
            </div>
          {/if}
          </div>
          <div class="track-mix">
            <div class="mix-knobs">
              <span data-tip="Track volume" data-tip-ja="トラック音量">
                <Knob
                  value={selected ? trackPlkValue('vol', track.volume) : track.volume}
                  label="VOL" size={24} light compact
                  locked={selected && isTrackPlkLocked('vol')}
                  onchange={v => {
                    if (selected) trackPlkChange('vol', v, bv => { pushUndo('Set volume'); song.tracks[trackId].volume = bv })
                    else { pushUndo('Set volume'); song.tracks[trackId].volume = v }
                  }}
                />
              </span>
              <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
                <Knob
                  value={selected ? (trackPlkValue('pan', track.pan) + 1) / 2 : (track.pan + 1) / 2}
                  label="PAN" size={24} light compact
                  locked={selected && isTrackPlkLocked('pan')}
                  onchange={v => {
                    if (selected) trackPlkChange('pan', v * 2 - 1, bv => { pushUndo('Set pan'); song.tracks[trackId].pan = bv })
                    else { pushUndo('Set pan'); song.tracks[trackId].pan = v * 2 - 1 }
                  }}
                />
              </span>
            </div>
            {#if selected}
              <div class="send-knobs">
                <span data-tip="Reverb send" data-tip-ja="リバーブセンド">
                  <Knob value={trackPlkValue('reverbSend', ph.reverbSend)} label="VERB" size={24} light compact
                    locked={isTrackPlkLocked('reverbSend')}
                    onchange={v => trackPlkChange('reverbSend', v, bv => setTrackSend(trackId, 'reverbSend', bv))} />
                </span>
                <span data-tip="Delay send" data-tip-ja="ディレイセンド">
                  <Knob value={trackPlkValue('delaySend', ph.delaySend)} label="DLY" size={24} light compact
                    locked={isTrackPlkLocked('delaySend')}
                    onchange={v => trackPlkChange('delaySend', v, bv => setTrackSend(trackId, 'delaySend', bv))} />
                </span>
                <span data-tip="Glitch send" data-tip-ja="グリッチセンド">
                  <Knob value={trackPlkValue('glitchSend', ph.glitchSend)} label="GLT" size={24} light compact
                    locked={isTrackPlkLocked('glitchSend')}
                    onchange={v => trackPlkChange('glitchSend', v, bv => setTrackSend(trackId, 'glitchSend', bv))} />
                </span>
                <span data-tip="Granular send" data-tip-ja="グラニュラーセンド">
                  <Knob value={trackPlkValue('granularSend', ph.granularSend)} label="GRN" size={24} light compact
                    locked={isTrackPlkLocked('granularSend')}
                    onchange={v => trackPlkChange('granularSend', v, bv => setTrackSend(trackId, 'granularSend', bv))} />
                </span>
              </div>
            {/if}
          </div>
        </div>
      </div>
      <!-- Inline piano roll for melodic tracks -->
      {#if selected && !isDrum(ph)}
        <PianoRoll trackId={trackId} />
      {/if}
    </div>
  {/each}
  {#if song.tracks.length < 16}
    <button
      class="btn-add-track"
      onpointerdown={() => addTrack()}
      data-tip="Add empty track" data-tip-ja="空トラックを追加"
    >+</button>
  {/if}
</div>
</div>

{#if removeTrackId != null}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="remove-backdrop" onpointerdown={() => removeTrackId = null}></div>
  <div class="remove-confirm">
    <span class="remove-label">Remove track {removeTrackId + 1}?</span>
    <button class="remove-btn remove-yes" onpointerdown={confirmRemoveTrack}>REMOVE</button>
    <button class="remove-btn remove-no" onpointerdown={() => removeTrackId = null}>CANCEL</button>
  </div>
{/if}


<style>
  .step-grid {
    /* track-label(112) + gap(4) + sep(9) + gap(4) + btn-steps(20) + gap(4) + btn-scale(28) + gap(4) + btn-solo(20) + gap(4) + btn-mute(20) + pad-right(8) */
    --head-w: 237px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
  }
  .step-grid-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 4px 0;
  }

  /* ── Page bar (hardware-style 16-step paging) ── */
  .page-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 0;
    flex-shrink: 0;
  }
  .page-head {
    flex-shrink: 0;
  }
  .page-btn {
    width: 20px;
    height: 16px;
    border: 1px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    color: var(--color-olive);
    font-size: 8px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    &:active { opacity: 0.6; }
  }
  .page-btn.active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── Track group (wraps track-row + vel-row + piano-roll) ── */
  .track-group {
    border-bottom: 1px solid rgba(30,32,40,0.08);
    border-left: 3px solid transparent;
  }
  .track-group.selected {
    background: var(--color-surface);
    border-left-color: var(--color-olive);
  }
  .track-group.muted .steps,
  .track-group.solo-muted .steps {
    opacity: 0.35;
    background-image: repeating-linear-gradient(
      45deg,
      rgba(30,32,40,0.07) 0px, rgba(30,32,40,0.07) 1px,
      transparent 1px, transparent 6px
    );
  }

  /* ── 2-column layout: controls | sequencer ── */
  .track-cols {
    display: flex;
    padding: 0 8px;
  }
  .track-controls {
    width: var(--head-w);
    flex-shrink: 0;
    border-right: 1px solid rgba(30,32,40,0.10);
    padding-right: 8px;
  }
  .ctrl-main {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
  }
  .ctrl-vel {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
  }
  .ctrl-spacer {
    flex: 1;
  }
  .track-content {
    display: flex;
    flex: 1;
    min-width: 0;
    touch-action: none;
    padding-left: 4px;
  }
  .track-seq {
    flex: 1;
    min-width: 0;
  }
  .track-mix {
    width: 128px;
    flex-shrink: 0;
    border-left: 1px solid rgba(30,32,40,0.10);
    padding-left: 4px;
    margin-left: 4px;
  }
  .mix-knobs {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    height: 40px;
  }
  .send-knobs {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    height: 40px;
  }

  /* ── Track label (expand toggle) ── */
  .track-label {
    width: 112px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    transition: background 100ms;
  }
  .track-label:hover {
    background: rgba(30,32,40,0.06);
  }
  .track-label.expanded {
    background: rgba(30,32,40,0.08);
  }
  .track-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    line-height: 1;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    width: 10px;
    height: 6px;
    flex-shrink: 0;
    color: var(--color-muted);
    transition: color 100ms, transform 150ms ease-out;
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .track-label:hover .chevron {
    color: var(--color-fg);
  }
  .head-sep {
    width: 1px;
    height: 16px;
    flex-shrink: 0;
    background: rgba(30,32,40,0.12);
    margin: 0 4px;
  }

  /* ── Solo button ── */
  .btn-solo {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .solo-off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 9px;
  }
  .solo-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    font-size: 9px;
  }

  /* ── Mute button ── */
  .btn-mute {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .mute-off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 9px;
  }
  .mute-on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    font-size: 9px;
  }

  /* ── Steps ── */
  .steps {
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: none;
    height: 40px;
    padding: 6px 0;
    align-items: center;
  }

  .step {
    position: relative;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    padding: 0;
  }
  .step :global(.flip-card) {
    position: absolute;
    inset: 0;
  }

  .step-off {
    background: var(--color-bg);
    border: 1px solid rgba(30,32,40,0.5);
  }
  .step-on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
  }

  /* ── P-Lock indicators ── */
  .step.lock-selected .step-off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .step.lock-selected .step-on {
    box-shadow: inset 0 0 0 2px var(--color-bg);
  }
  .lock-dot {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-olive);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Playhead glow ── */
  .step.playhead {
    animation: ph-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  /* ── Inline velocity lane ── */
  .vel-tab {
    width: 36px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-muted);
    text-transform: uppercase;
    text-align: center;
    cursor: pointer;
    user-select: none;
    border: 1px solid rgba(30,32,40,0.15);
    padding: 3px 0;
    background: transparent;
    transition: color 80ms, border-color 80ms, background 80ms;
    line-height: 1;
  }
  .vel-tab.active {
    color: var(--tab-color, var(--color-fg));
    border-color: var(--tab-color, var(--color-fg));
    background: rgba(30,32,40,0.06);
  }
  .head-action {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    border: 1px solid var(--color-fg);
    background: transparent;
    padding: 3px 8px;
    line-height: 1;
    cursor: pointer;
    border-radius: 0;
    transition: color 80ms, border-color 80ms;
  }
  .head-action:hover {
    color: var(--color-fg);
    border-color: rgba(30,32,40,0.25);
  }
  .btn-scale {
    width: 28px;
    height: 20px;
    flex-shrink: 0;
    border: 1px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    font-size: 7px;
    font-weight: 700;
    padding: 0;
    color: var(--color-olive);
    cursor: pointer;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    justify-content: center;
    &:active { opacity: 0.6; }
  }
  .btn-steps {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    font-size: 8px;
    font-weight: 700;
    padding: 0;
    position: relative;
  }
  .steps-off {
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
  }
  .steps-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
  }
  .vel-bars {
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    height: 40px;
    padding: 4px 0;
    user-select: none;
    overflow: hidden;
  }
  .vel-cell {
    display: flex;
    align-items: flex-end;
    width: 24px;
    cursor: ns-resize;
  }
  .vel-fill {
    width: 100%;
    background: rgba(237,232,220,0.12);
    border-radius: 1px 1px 0 0;
    transition: height 180ms ease-out;
    min-height: 2px;
    transform-origin: bottom;
  }
  .vel-fill.active {
    background: var(--color-olive);
    opacity: 0.7;
  }
  .vel-bars.mounting .vel-fill.active {
    animation: vel-bar-grow 180ms ease-out;
  }
  .vel-fill.growing {
    animation: vel-bar-grow 180ms ease-out;
  }
  .vel-fill.shrinking {
    animation: vel-bar-shrink 180ms ease-out forwards;
  }

  @keyframes vel-bar-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
  @keyframes vel-bar-shrink {
    from { transform: scaleY(1); }
    to   { transform: scaleY(0); }
  }
  .vel-fill.playhead {
    animation: vel-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  /* ── Chance mode ── */
  .vel-bars.chance-mode .vel-fill.active {
    background: var(--color-chance);
  }
  /* ── P-Lock automation mode (ADR 093) ── */
  .vel-bars.plk-mode .vel-fill.active {
    background: var(--plk-color, var(--color-olive));
  }
  .chance-dot {
    position: absolute;
    bottom: 1px;
    left: 1px;
    width: 4px;
    height: 4px;
    background: var(--color-chance);
    transform: rotate(45deg);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Add track ── */
  .btn-add-track {
    width: 24px;
    height: 24px;
    margin: 4px 8px;
    border: 1px dashed rgba(30,32,40,0.2);
    background: transparent;
    color: var(--color-muted);
    font-size: 14px;
    cursor: pointer;
    transition: color 80ms, border-color 80ms;
  }
  .btn-add-track:hover {
    color: var(--color-olive);
    border-color: var(--color-olive);
  }

  /* ── Step-set mode ── */
  .step-set-mode {
    background: rgba(30, 32, 40, 0.04);
    border-radius: 0;
  }
  .step-set-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    border: 1px solid rgba(30, 32, 40, 0.2);
    cursor: pointer;
    transition: background 60ms, border-color 60ms;
  }
  .step-set-cell.active {
    background: rgba(120, 120, 69, 0.15);
    border-color: rgba(120, 120, 69, 0.4);
  }
  .step-set-cell.current-end {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .step-set-cell:hover {
    background: rgba(120, 120, 69, 0.3);
    border-color: var(--color-olive);
  }
  .step-set-cell.ext {
    border-style: dashed;
  }
  .step-set-num {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.5);
    pointer-events: none;
  }
  .step-set-cell.active .step-set-num {
    color: var(--color-olive);
  }
  .step-set-cell.current-end .step-set-num {
    color: var(--color-fg);
  }

  /* ── Remove track confirmation ── */
  .remove-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.15);
    z-index: 20;
  }
  .remove-confirm {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 21;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--color-fg);
    color: rgba(237,232,220,0.85);
    padding: 10px 16px;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .remove-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .remove-btn {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 12px;
    border: 1px solid rgba(237,232,220,0.2);
    background: transparent;
    color: rgba(237,232,220,0.6);
    cursor: pointer;
    border-radius: 0;
  }
  .remove-btn:hover {
    color: rgba(237,232,220,0.9);
    border-color: rgba(237,232,220,0.4);
  }
  .remove-yes {
    color: var(--color-danger);
    border-color: var(--danger-border);
  }
  .remove-yes:hover {
    background: var(--danger-bg-hover);
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

</style>
