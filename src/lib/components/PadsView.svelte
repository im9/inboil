<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import { song, ui, cellForTrack, activeCell, samplesByCell, sampleCellKey, playback, pushUndo, vkbd, trackDisplayName, perf, fxPad, fxFlavours, masterPad, masterLevels } from '../state.svelte.ts'
  import { engine, type EngineContext } from '../audio/engine.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import { captureValue, captureToggle } from '../sweepRecorder.svelte.ts'
  import { toggleTrig, toggleMute, toggleSolo, setTrigVelocity, setTrigChance, setParamLock, setTrackSteps, setTrackSend, isDrum, STEP_OPTIONS, resetSeqParams, cycleTrackScale, SCALE_OPTIONS } from '../stepActions.ts'
  import { trackPlkValue, trackPlkChange, isTrackPlkLocked } from '../paramHelpers.ts'
  import { relativeCoords, stepIndexFromX } from '../domHelpers.ts'
  import type { Trig } from '../types.ts'
  import SamplerWaveform from './SamplerWaveform.svelte'
  import VoiceViz from './VoiceViz.svelte'
  import SamplerPads from './SamplerPads.svelte'
  import PianoRoll from './PianoRoll.svelte'
  import Knob from './Knob.svelte'
  import { setTrigNote } from '../stepActions.ts'

  const trackId = $derived(ui.selectedTrack)
  const cell = $derived(cellForTrack(song.patterns[ui.currentPattern], trackId))
  const track = $derived(trackId >= 0 ? song.tracks[trackId] : null)
  const SAMPLER_VOICE_IDS: ReadonlySet<string> = new Set(['Sampler', 'Crash', 'Ride'])
  const isSampler = $derived(!!cell?.voiceId && SAMPLER_VOICE_IDS.has(cell.voiceId))
  const ph = $derived(trackId >= 0 ? activeCell(trackId) : null)

  // Auto-switch pad mode when voice type changes
  $effect(() => {
    if (isSampler && ui.padMode === 'note') {
      ui.padMode = 'slice'
    } else if (!isSampler && ui.padMode === 'slice') {
      ui.padMode = 'note'
    }
  })

  const availableModes = $derived(
    isSampler
      ? (['track', 'slice', 'note'] as const)
      : (['track', 'note'] as const)
  )

  // Current sample data for waveform (sampler only)
  const currentSample = $derived(
    isSampler ? samplesByCell[sampleCellKey(trackId, ui.currentPattern)] : undefined
  )

  // Built-in drum pool names for Crash/Ride
  const BUILTIN_POOL: Record<string, string> = { Crash: '909-crash', Ride: '909-ride' }
  // Waveform cache per voiceId/packId — avoids redundant OPFS reads across patterns
  const waveformCache = new Map<string, { name: string; waveform: Float32Array }>()

  // Auto-load waveform for Crash/Ride (builtin) and pack-based Sampler (Grand Piano etc.)
  $effect(() => {
    if (!isSampler || !cell) return
    const key = sampleCellKey(trackId, ui.currentPattern)
    if (samplesByCell[key]) return // already loaded
    const vid = cell.voiceId
    if (!vid) return

    const poolName = BUILTIN_POOL[vid]
    const packId = cell.sampleRef?.packId
    const cacheKey = poolName ?? packId
    if (!cacheKey) return

    // Reuse cached waveform if already loaded for another pattern
    const cached = waveformCache.get(cacheKey)
    if (cached) {
      samplesByCell[key] = { name: cached.name, waveform: cached.waveform, rawBuffer: new ArrayBuffer(0) }
      return
    }

    if (poolName) {
      // Crash/Ride: load from audio pool OPFS
      void (async () => {
        const { loadAllMeta, readSample, generateWaveform } = await import('../audioPool.ts')
        const { decodeToMonoOffline } = await import('../audio/engine.ts')
        const entries = await loadAllMeta()
        const entry = entries.find(e => e.name === poolName && e.folder.startsWith('factory/'))
        if (!entry) return
        const raw = await readSample(entry)
        if (!raw) return
        const result = await decodeToMonoOffline(raw)
        if (!result) return
        const waveform = generateWaveform(result.mono)
        waveformCache.set(cacheKey, { name: poolName, waveform })
        samplesByCell[sampleCellKey(trackId, ui.currentPattern)] = { name: poolName, waveform, rawBuffer: new ArrayBuffer(0) }
      })()
    } else if (packId) {
      // Pack-based sampler (Grand Piano etc.): load first zone waveform
      void (async () => {
        const { loadPackZones, generateWaveform } = await import('../audioPool.ts')
        const zones = await loadPackZones(packId)
        if (!zones.length) return
        const name = cell.sampleRef?.name ?? packId
        const waveform = generateWaveform(zones[0].buffer)
        waveformCache.set(cacheKey, { name, waveform })
        samplesByCell[sampleCellKey(trackId, ui.currentPattern)] = { name, waveform, rawBuffer: new ArrayBuffer(0) }
      })()
    }
  })

  const startVal = $derived(cell?.voiceParams?.start ?? 0)
  const endVal = $derived(cell?.voiceParams?.end ?? 1)
  const chopVal = $derived(cell?.voiceParams?.chopSlices ?? 0)

  function onChangeStart(v: number) {
    if (!cell) return
    pushUndo('Change sample start')
    cell.voiceParams.start = v
  }

  function onChangeEnd(v: number) {
    if (!cell) return
    pushUndo('Change sample end')
    cell.voiceParams.end = v
  }

  // Active slice index during playback (waveform overlay)
  const activeSlice = $derived.by(() => {
    if (!isSampler || chopVal <= 0 || !isViewingPlayingPattern()) return -1
    const head = playback.playheads[trackId]
    if (head == null) return -1
    const trig = cell?.trigs[head]
    if (!trig?.active) return -1
    const chopMode = cell?.voiceParams?.chopMode ?? 0
    if (chopMode === 0) {
      const rootNote = cell?.voiceParams?.rootNote ?? 60
      return (trig.note ?? 60) - rootNote
    }
    return head % chopVal
  })

  // Playing pads — highlight pads at playhead position for all modes
  const playingPads = $derived.by(() => {
    const set = new Set<number>()
    if (!isViewingPlayingPattern()) return set
    const mode = ui.padMode

    if (mode === 'track') {
      const pat = song.patterns[ui.currentPattern]
      const cells = pat?.cells ?? []
      for (let i = 0; i < cells.length && i < 16; i++) {
        const c = cells[i]
        if (!c) continue
        const head = playback.playheads[c.trackId]
        if (head == null) continue
        if (c.trigs[head]?.active) set.add(i)
      }
    } else if (mode === 'note' && ph) {
      const head = playback.playheads[trackId]
      if (head != null) {
        const trig = ph.trigs[head]
        if (trig?.active) {
          const base = (vkbd.octave + 1) * 12
          const padIdx = (trig.note ?? 60) - base
          if (padIdx >= 0 && padIdx < 16) set.add(padIdx)
        }
      }
    } else if (mode === 'slice') {
      if (activeSlice >= 0 && activeSlice < 16) set.add(activeSlice)
    }

    return set
  })

  // Pad tap → write note into selected step
  let engineReady = false
  async function ensureEngine() {
    if (engineReady) return
    await engine.init({ onLevels: (peakL, peakR, gr, cpu) => { masterLevels.peakL = peakL; masterLevels.peakR = peakR; masterLevels.gr = gr; masterLevels.cpu = cpu } })
    const ctx: EngineContext = { fxFlavours, masterPad, soloTracks: ui.soloTracks }
    engine.sendPatternByIndex(song, perf, fxPad, ctx, false, ui.currentPattern)
    engineReady = true
  }

  function onPadTap(_padIndex: number, note: number) {
    if (ui.selectedStep == null) return
    pushUndo('Set step note')
    setTrigNote(trackId, ui.selectedStep, note)
  }

  // Octave controls for NOTE mode
  function shiftOctave(dir: 1 | -1) {
    const next = vkbd.octave + dir
    if (next < 2 || next > 7) return
    vkbd.octave = next
  }

  // ── Step paging (sync with StepGrid via ui.stepPage) ──
  const STEP_CELL = 26
  let seqEl: HTMLDivElement | undefined = $state(undefined)

  $effect(() => {
    if (!seqEl) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      ui.stepPageSize = w >= STEP_CELL * 32 ? 32 : 16
    })
    ro.observe(seqEl)
    return () => ro.disconnect()
  })

  const pageSize = $derived(ui.stepPageSize)
  const steps = $derived(ph?.steps ?? 16)
  const totalPages = $derived(Math.ceil(steps / pageSize))

  const pageStart = $derived(ui.stepPage * pageSize)
  const pageEnd = $derived(Math.min(steps, pageStart + pageSize))
  const displayCount = $derived(Math.min(pageEnd - pageStart, steps - (pageStart % steps)))
  const isWrapped = $derived(pageStart >= steps)

  // Clamp page
  $effect(() => {
    const max = totalPages
    const cur = untrack(() => ui.stepPage)
    if (cur >= max) ui.stepPage = Math.max(0, max - 1)
  })

  // ── Step-set mode ──
  let stepSetActive = $state(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const STEP_SET_MAX = 16
  const EXT_STEPS = [24, 32, 48, 64] as const

  function cycleSteps() {
    if (!ph) return
    const current = ph.steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    setTrackSteps(trackId, STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length])
  }

  function stepBtnDown(_e: PointerEvent) {
    if (stepSetActive) { stepSetActive = false; return }
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      stepSetActive = true
    }, 300)
  }

  function stepBtnUp() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (!longPressTriggered && !stepSetActive) cycleSteps()
  }

  function stepBtnContext(e: Event) {
    e.preventDefault()
    stepSetActive = !stepSetActive
  }

  function pickStepCount(n: number) {
    setTrackSteps(trackId, n)
    stepSetActive = false
  }

  onDestroy(() => { if (longPressTimer) clearTimeout(longPressTimer) })

  // ── Step drag-to-paint ──
  let stepDragging = $state(false)
  let stepPaintOn = $state(true)
  let stepVisited = new Set<number>()
  let stepStepsEl: HTMLElement | null = null

  // ── Toggle with grow/shrink animation ──
  let growing: Set<string> = $state(new Set())
  let shrinking: Set<string> = $state(new Set())
  const timers = new Map<string, number>()
  onDestroy(() => { timers.forEach(id => clearTimeout(id)); timers.clear() })

  function handleToggle(stepIdx: number) {
    if (!ph) return
    const trig = ph.trigs[stepIdx]
    const key = `${trackId}-${stepIdx}`
    if (timers.has(key)) { clearTimeout(timers.get(key)!); timers.delete(key) }

    if (trig.active) {
      toggleTrig(trackId, stepIdx)
      shrinking = new Set([...shrinking, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        shrinking = new Set([...shrinking].filter(k => k !== key))
      }, 180))
    } else {
      toggleTrig(trackId, stepIdx)
      growing = new Set([...growing, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        growing = new Set([...growing].filter(k => k !== key))
      }, 180))
    }
  }

  function stepStartDrag(e: PointerEvent, stepIdx: number) {
    e.preventDefault()
    if (!ph) return
    if (ui.lockMode) {
      ui.selectedStep = ui.selectedStep === stepIdx && ui.selectedTrack === trackId ? null : stepIdx
      return
    }
    const trig = ph.trigs[stepIdx]
    stepPaintOn = !trig.active
    stepDragging = true
    stepVisited = new Set([stepIdx])
    stepStepsEl = (e.currentTarget as HTMLElement).closest('.steps') as HTMLElement
    stepStepsEl?.setPointerCapture(e.pointerId)
    handleToggle(stepIdx)
  }

  function stepOnMove(e: PointerEvent) {
    if (!stepDragging || !stepStepsEl || !ph) return
    const { x: relX } = relativeCoords(e, stepStepsEl)
    const visibleCount = pageEnd - pageStart
    const localIdx = stepIndexFromX(relX, 26, 0, visibleCount - 1)
    const idx = (pageStart + localIdx) % ph.steps
    if (stepVisited.has(idx)) return
    stepVisited.add(idx)
    const trig = ph.trigs[idx]
    if (stepPaintOn && !trig.active) handleToggle(idx)
    else if (!stepPaintOn && trig.active) handleToggle(idx)
  }

  function stepEndDrag() {
    stepDragging = false
    stepStepsEl = null
  }

  // ── Velocity / automation row ──
  type VelMode = 'VEL' | 'CHNC' | 'VOL' | 'PAN' | 'VERB' | 'DLY' | 'GLT' | 'GRN'
    | 'I1M' | 'I1X' | 'I1Y' | 'I2M' | 'I2X' | 'I2Y'

  const VEL_MODE_COLORS: Record<VelMode, string> = {
    VEL: '', CHNC: 'var(--color-blue)', VOL: 'var(--color-teal)', PAN: 'var(--color-teal)',
    VERB: 'var(--color-olive)', DLY: 'var(--color-blue)', GLT: 'var(--color-salmon)', GRN: 'var(--color-purple)',
    I1M: 'var(--color-teal)', I1X: 'var(--color-teal)', I1Y: 'var(--color-teal)',
    I2M: 'var(--color-purple)', I2X: 'var(--color-purple)', I2Y: 'var(--color-purple)',
  }
  const VEL_MODE_KEYS: Record<VelMode, string> = {
    VEL: '', CHNC: '', VOL: 'vol', PAN: 'pan',
    VERB: 'reverbSend', DLY: 'delaySend', GLT: 'glitchSend', GRN: 'granularSend',
    I1M: 'ins0mix', I1X: 'ins0x', I1Y: 'ins0y',
    I2M: 'ins1mix', I2X: 'ins1x', I2Y: 'ins1y',
  }

  let velContainer: HTMLDivElement | undefined = $state(undefined)
  let velDragging = $state(false)
  let velMode: VelMode = $state('VEL')
  const modeColor = $derived(VEL_MODE_COLORS[velMode])
  const isPlkMode = $derived(velMode !== 'VEL' && velMode !== 'CHNC')
  const MIX_MODES: VelMode[] = ['VOL', 'PAN']
  const FX_MODES: VelMode[] = ['VERB', 'DLY', 'GLT', 'GRN']
  const INS_MODES: VelMode[] = ['I1M', 'I1X', 'I1Y', 'I2M', 'I2X', 'I2Y']
  const isMixMode = $derived((MIX_MODES as readonly string[]).includes(velMode))
  const isFxMode = $derived((FX_MODES as readonly string[]).includes(velMode))
  const isInsMode = $derived((INS_MODES as readonly string[]).includes(velMode))

  function velNextMix() { const i = MIX_MODES.indexOf(velMode); velMode = MIX_MODES[(i + 1) % MIX_MODES.length] }
  function velNextFx() { const i = FX_MODES.indexOf(velMode); velMode = FX_MODES[(i + 1) % FX_MODES.length] }
  function velNextIns() { const i = INS_MODES.indexOf(velMode); velMode = INS_MODES[(i + 1) % INS_MODES.length] }

  function velReadValue(trig: Trig): number {
    switch (velMode) {
      case 'VEL': return trig.velocity
      case 'CHNC': return trig.chance ?? 1
      case 'PAN': return (trig.paramLocks?.pan ?? 0) * 0.5 + 0.5
      default: {
        const key = VEL_MODE_KEYS[velMode]
        return key ? (trig.paramLocks?.[key] ?? 0) : 0
      }
    }
  }

  function velStartDrag(e: PointerEvent, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    velDragging = true
    velApply(e, idx)
  }

  function velOnMove(e: PointerEvent) {
    if (!velDragging || !velContainer || !ph) return
    const { x: relX } = relativeCoords(e, velContainer)
    const visibleCount = pageEnd - pageStart
    const localIdx = stepIndexFromX(relX, 26, 0, visibleCount - 1)
    velApply(e, (pageStart + localIdx) % ph.steps)
  }

  function velApply(e: PointerEvent, idx: number) {
    if (!velContainer) return
    const displayPos = ((idx - pageStart) % (pageEnd - pageStart) + (pageEnd - pageStart)) % (pageEnd - pageStart)
    const velCell = velContainer.children[displayPos] as HTMLElement
    if (!velCell) return
    const rect = velCell.getBoundingClientRect()
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    if (velMode === 'VEL') setTrigVelocity(trackId, idx, v)
    else if (velMode === 'CHNC') setTrigChance(trackId, idx, v)
    else if (velMode === 'PAN') setParamLock(trackId, idx, 'pan', v * 2 - 1)
    else { const key = VEL_MODE_KEYS[velMode]; if (key) setParamLock(trackId, idx, key, v) }
  }

  function velEndDrag() { velDragging = false }

  // Vel-bar mount animation
  let velMounting = $state(true)
  $effect(() => {
    velMounting = true
    void ui.selectedTrack
    tick().then(() => { velMounting = false }).catch(() => { velMounting = false })
  })
</script>

<div class="pads-view">
  <!-- Voice visualization -->
  {#if isSampler}
    <SamplerWaveform
      sample={currentSample}
      start={startVal}
      end={endVal}
      chopSlices={chopVal}
      activeSlice={activeSlice}
      onchangestart={onChangeStart}
      onchangeend={onChangeEnd}
    />
  {:else if cell}
    <VoiceViz voiceId={cell.voiceId} voiceParams={cell.voiceParams ?? {}} />
  {/if}

  <!-- Pads + Single-Track Editor -->
  <div class="bottom-row">
    <div class="col-pads">
      <!-- Mode switch -->
      <div class="mode-switch">
        {#each availableModes as m}
          <button
            class="mode-btn"
            class:active={ui.padMode === m}
            onpointerdown={() => { ui.padMode = m }}
          >{m.toUpperCase()}</button>
        {/each}
        {#if ui.padMode === 'note'}
          <span class="oct-label">OCT</span>
          <button class="oct-btn" onpointerdown={() => shiftOctave(1)}>▲</button>
          <button class="oct-btn" onpointerdown={() => shiftOctave(-1)}>▼</button>
          <span class="oct-val">{vkbd.octave}</span>
        {/if}
      </div>
      <SamplerPads
        trackId={trackId}
        mode={ui.padMode}
        rootNote={cell?.voiceParams?.rootNote ?? 60}
        octave={vkbd.octave}
        {playingPads}
        onensureengine={ensureEngine}
        onpadtap={onPadTap}
      />
    </div>

    <!-- Single-Track Editor -->
    <div class="col-right">
      {#if ph && track}
        <!-- Track header -->
        <div class="track-header">
          <span class="track-name">{trackDisplayName(ph, ui.currentPattern)}{#if ph.insertFx?.[0]?.type || ph.insertFx?.[1]?.type}<span class="ins-fx-dot"></span>{/if}</span>
          <span class="head-sep"></span>
          <button
            class="btn-steps flip-host"
            onpointerdown={(e) => stepBtnDown(e)}
            onpointerup={() => stepBtnUp()}
            onpointerleave={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }}
            oncontextmenu={(e) => stepBtnContext(e)}
            data-tip="Tap: cycle · Hold: picker" data-tip-ja="タップ: 切替 · 長押し: 選択"
          >
            <span class="flip-card" class:flipped={stepSetActive}>
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
            onpointerdown={() => { toggleMute(trackId); captureToggle({ kind: 'mute', trackId }, track.muted ?? false) }}
            data-tip="Mute/unmute track" data-tip-ja="トラックをミュート"
          >
            <span class="flip-card" class:flipped={track.muted}>
              <span class="flip-face mute-off">M</span>
              <span class="flip-face back mute-on">M</span>
            </span>
          </button>
          <span class="header-spacer"></span>
          <span data-tip="Track volume" data-tip-ja="トラック音量">
            <Knob
              value={trackPlkValue('vol', track.volume)}
              label="VOL" size={24} light compact
              locked={isTrackPlkLocked('vol')}
              onchange={v => {
                trackPlkChange('vol', v, bv => { pushUndo('Set volume'); song.tracks[trackId].volume = bv })
                captureValue({ kind: 'track', trackId, param: 'volume' }, v)
              }}
            />
          </span>
          <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
            <Knob
              value={(trackPlkValue('pan', track.pan) + 1) / 2}
              label="PAN" size={24} light compact defaultValue={0.5}
              locked={isTrackPlkLocked('pan')}
              onchange={v => {
                trackPlkChange('pan', v * 2 - 1, bv => { pushUndo('Set pan'); song.tracks[trackId].pan = bv })
                captureValue({ kind: 'track', trackId, param: 'pan' }, v)
              }}
            />
          </span>
          <span class="knob-sep"></span>
          <span data-tip="Reverb send" data-tip-ja="リバーブセンド">
            <Knob value={trackPlkValue('reverbSend', ph.reverbSend)} label="VERB" size={24} light compact
              locked={isTrackPlkLocked('reverbSend')}
              onchange={v => { trackPlkChange('reverbSend', v, bv => setTrackSend(trackId, 'reverbSend', bv)); captureValue({ kind: 'send', trackId, param: 'reverbSend' }, v) }} />
          </span>
          <span data-tip="Delay send" data-tip-ja="ディレイセンド">
            <Knob value={trackPlkValue('delaySend', ph.delaySend)} label="DLY" size={24} light compact
              locked={isTrackPlkLocked('delaySend')}
              onchange={v => { trackPlkChange('delaySend', v, bv => setTrackSend(trackId, 'delaySend', bv)); captureValue({ kind: 'send', trackId, param: 'delaySend' }, v) }} />
          </span>
          <span data-tip="Glitch send" data-tip-ja="グリッチセンド">
            <Knob value={trackPlkValue('glitchSend', ph.glitchSend)} label="GLT" size={24} light compact
              locked={isTrackPlkLocked('glitchSend')}
              onchange={v => { trackPlkChange('glitchSend', v, bv => setTrackSend(trackId, 'glitchSend', bv)); captureValue({ kind: 'send', trackId, param: 'glitchSend' }, v) }} />
          </span>
          <span data-tip="Granular send" data-tip-ja="グラニュラーセンド">
            <Knob value={trackPlkValue('granularSend', ph.granularSend)} label="GRN" size={24} light compact
              locked={isTrackPlkLocked('granularSend')}
              onchange={v => { trackPlkChange('granularSend', v, bv => setTrackSend(trackId, 'granularSend', bv)); captureValue({ kind: 'send', trackId, param: 'granularSend' }, v) }} />
          </span>
        </div>

        <!-- Vel mode tabs (2-column layout aligned with editor-cols) -->
        <div class="vel-tabs">
          <div class="vel-tabs-spacer">
            <button class="head-action" onclick={() => resetSeqParams(trackId)}
              data-tip="Reset params to defaults" data-tip-ja="パラメータを初期値に戻す"
            >RST</button>
          </div>
          <div class="vel-tabs-seq">
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
            data-tip="Per-step FX sends (tap to cycle)" data-tip-ja="ステップごとのFXセンド（タップで切替）"
          >{isFxMode ? velMode : 'FX'}</button>
          <button class="vel-tab" class:active={isInsMode}
            style={isInsMode ? `--tab-color: ${modeColor}` : `--tab-color: ${VEL_MODE_COLORS.I1M}`}
            onpointerdown={() => { isInsMode ? velNextIns() : (velMode = 'I1M') }}
            data-tip="Per-step insert FX (tap to cycle)" data-tip-ja="ステップごとのインサートFX（タップで切替）"
          >{isInsMode ? velMode : 'INS'}</button>
          </div>
        </div>

        <!-- Step/vel editor: 2-column layout matching PianoRoll structure -->
        <div class="editor-cols">
          <div class="editor-spacer"></div>
          <div class="editor-seq" bind:this={seqEl}>
            {#if stepSetActive}
              <div class="steps step-set-mode" role="application" style="--steps: {STEP_SET_MAX + EXT_STEPS.length}">
                {#each { length: STEP_SET_MAX } as _, stepIdx}
                  {@const isActive = stepIdx < ph.steps}
                  <button
                    class="step step-set-cell"
                    class:active={isActive}
                    class:current-end={stepIdx === ph.steps - 1}
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
              <div
                class="steps"
                class:wrapped={isWrapped}
                role="application"
                style="--steps: {displayCount}"
                onpointermove={stepOnMove}
                onpointerup={stepEndDrag}
                onpointercancel={stepEndDrag}
              >
                {#each { length: displayCount } as _, i}
                  {@const sourceIdx = (pageStart + i) % steps}
                  {@const trig = ph.trigs[sourceIdx]}
                  {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === sourceIdx}
                  {@const isLockSel = ui.lockMode && ui.selectedStep === sourceIdx}
                  {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
                  <button
                    class="step flip-host"
                    class:playhead={isPlayhead}
                    class:lock-selected={isLockSel}
                    onpointerdown={(e) => stepStartDrag(e, sourceIdx)}
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

            <!-- Velocity bars -->
            <div
              class="vel-bars"
              class:plk-mode={isPlkMode}
              class:chance-mode={velMode === 'CHNC'}
              class:mounting={velMounting}
              class:wrapped={isWrapped}
              style="--steps: {displayCount}{modeColor ? `; --plk-color: ${modeColor}` : ''}"
              role="application"
              bind:this={velContainer}
              onpointermove={velOnMove}
              onpointerup={velEndDrag}
              onpointercancel={velEndDrag}
              data-tip={velMode === 'VEL' ? "Drag up/down to adjust velocity" : velMode === 'CHNC' ? "Drag to set step probability" : `Drag to set per-step ${velMode}`}
              data-tip-ja={velMode === 'VEL' ? "上下ドラッグでベロシティを調整" : velMode === 'CHNC' ? "ドラッグで発火確率を調整" : `ドラッグでステップごとの${velMode}を調整`}
            >
              {#each { length: displayCount } as _, i}
                {@const sourceIdx = (pageStart + i) % steps}
                {@const trig = ph.trigs[sourceIdx]}
                {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === sourceIdx}
                {@const isActive = trig.active || shrinking.has(`${trackId}-${sourceIdx}`)}
                {@const barHeight = isPlkMode ? velReadValue(trig) * 100 : (velMode === 'CHNC' && isActive ? (trig.chance ?? 1) * 100 : trig.velocity * 100)}
                {@const hasChance = trig.active && trig.chance != null && trig.chance < 1}
                <div
                  class="vel-cell"
                  role="slider"
                  tabindex="-1"
                  aria-valuenow={velReadValue(trig)}
                  onpointerdown={e => velStartDrag(e, sourceIdx)}
                >
                  <div
                    class="vel-fill"
                    class:active={isPlkMode ? barHeight > 0 : isActive}
                    class:growing={growing.has(`${trackId}-${sourceIdx}`)}
                    class:shrinking={shrinking.has(`${trackId}-${sourceIdx}`)}
                    class:playhead={isPlayhead}
                    style="height: {barHeight}%{velMode === 'VEL' && hasChance ? `; opacity: ${(0.3 + (trig.chance!) * 0.4).toFixed(2)}` : ''}"
                  ></div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Piano roll for melodic tracks -->
        {#if !isDrum(ph)}
          <PianoRoll {trackId} />
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .pads-view {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .bottom-row {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 200px;
    overflow: hidden;
  }

  .col-pads {
    flex-shrink: 0;
    height: 100%;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .col-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    background: var(--color-surface);
    border-left: 3px solid var(--color-olive);
    /* PianoRoll's .piano-spacer uses var(--head-w) for width.
       Content: brush-bar(1-col 20px + 2px gap) + oct-keys(28px) = 50px */
    --head-w: 50px;
  }
  /* PianoRoll's margin-right:135px compensates for StepGrid's track-mix column.
     PadsView has no track-mix column — knobs are in the header row. */
  .col-right :global(.piano-roll) {
    margin-right: 0;
  }
  /* Narrow brush-bar to single column in PadsView */
  .col-right :global(.brush-bar) {
    grid-template-columns: 20px;
  }

  /* ── Mode switch (olive tier) ── */
  .mode-switch {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .mode-btn {
    border: 1.5px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .mode-btn.active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── Octave controls ── */
  .oct-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lz-text-hint);
    margin-left: 8px;
  }

  .oct-btn {
    border: 1.5px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    color: var(--color-olive);
    font-size: 10px;
    width: 20px;
    height: 20px;
    padding: 0;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .oct-btn:active {
    background: var(--olive-bg-subtle);
  }

  .oct-val {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-olive);
    min-width: 12px;
    text-align: center;
  }

  /* ── Track header ── */
  .track-header {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid var(--lz-border);
    flex-shrink: 0;
  }

  .track-name {
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    line-height: 1;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ins-fx-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent, #4af);
    flex-shrink: 0;
  }

  .head-sep {
    width: 1px;
    height: 16px;
    flex-shrink: 0;
    background: var(--lz-border-mid);
    margin: 0 4px;
  }

  .header-spacer {
    flex: 1;
  }

  .knob-sep {
    width: 1px;
    height: 16px;
    flex-shrink: 0;
    background: var(--lz-border-mid);
    margin: 0 2px;
  }

  .btn-steps {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    font-size: var(--fs-min);
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
    font-size: var(--fs-min);
    font-weight: 700;
  }
  .steps-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fs-min);
    font-weight: 700;
  }

  .btn-scale {
    width: 28px;
    height: 20px;
    flex-shrink: 0;
    border: 1px solid var(--color-olive);
    border-radius: 0;
    background: transparent;
    font-size: var(--fs-min);
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
    font-size: var(--fs-sm);
  }
  .solo-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    font-size: var(--fs-sm);
  }

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
    font-size: var(--fs-sm);
  }
  .mute-on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    font-size: var(--fs-sm);
  }

  /* ── 2-column layout matching PianoRoll structure ── */
  .editor-cols {
    display: flex;
    gap: 4px;
    padding: 0 8px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--lz-border-subtle);
  }
  .editor-spacer {
    width: var(--head-w);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    border-right: 1px solid var(--lz-border);
  }
  .editor-seq {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

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
    border: 1px solid var(--lz-step-border);
  }
  .step-on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
  }

  .steps.wrapped .step-on { opacity: 0.5; }
  .steps.wrapped .step-off { opacity: 0.35; }

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

  .step.playhead {
    animation: ph-glow 180ms ease-out;
    filter: brightness(1.45);
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

  /* ── Step-set mode ── */
  .step-set-mode {
    background: var(--lz-bg-hover);
    border-radius: 0;
  }
  .step-set-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    border: 1px solid var(--lz-border-strong);
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
    font-size: var(--fs-min);
    font-weight: 700;
    color: var(--lz-text-mid);
    pointer-events: none;
  }
  .step-set-cell.active .step-set-num {
    color: var(--color-olive);
  }
  .step-set-cell.current-end .step-set-num {
    color: var(--color-fg);
  }

  /* ── Vel tabs ── */
  .vel-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--lz-border-subtle);
  }
  .vel-tabs-spacer {
    width: var(--head-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .vel-tabs-seq {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .vel-tab {
    width: 32px;
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-muted);
    text-transform: uppercase;
    text-align: center;
    cursor: pointer;
    user-select: none;
    border: 1px solid var(--lz-border-strong);
    padding: 3px 0;
    background: transparent;
    transition: color 80ms, border-color 80ms, background 80ms;
    line-height: 1;
  }
  .vel-tab.active {
    color: var(--tab-color, var(--color-fg));
    border-color: var(--tab-color, var(--color-fg));
    background: var(--lz-bg-hover);
  }

  .head-action {
    font-size: var(--fs-sm);
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
    border-color: var(--lz-border-strong);
  }

  /* ── Vel bars ── */
  .vel-bars {
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    grid-template-rows: 1fr;
    gap: 2px;
    min-height: 40px;
    max-height: 80px;
    padding: 4px 0;
    user-select: none;
    overflow: hidden;
    touch-action: none;
  }
  .vel-bars.wrapped .vel-fill { opacity: 0.5; }

  .vel-cell {
    display: flex;
    align-items: flex-end;
    width: 24px;
    cursor: ns-resize;
  }
  .vel-fill {
    width: 100%;
    background: var(--dz-bg-active);
    border-radius: 0;
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

  .vel-bars.chance-mode .vel-fill.active {
    background: var(--color-chance);
  }
  .vel-bars.plk-mode .vel-fill.active {
    background: var(--plk-color, var(--color-olive));
  }

  @media (max-width: 639px) {
    .pads-view {
      overflow-y: auto;
    }
    .bottom-row {
      flex-direction: column;
      height: auto;
    }
  }
</style>
