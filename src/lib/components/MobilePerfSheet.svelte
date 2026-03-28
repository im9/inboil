<script lang="ts">
  // NOTE: Large file by design — canvas viz + motion sensors + perf zones share 10+ reactive perf values
  import { onMount, onDestroy } from 'svelte'
  import { perf, playback, song, fxPad, masterLevels } from '../state.svelte.ts'
  import { isGuest, guestPerf } from '../multiDevice/guest.ts'

  type PerfAction = 'fill' | 'reverse' | 'break'
  type GlitchAction = 'stutter' | 'half' | 'tape'
  type FilterAction = 'lpf' | 'hpf' | 'dj'
  type MotionAction = 'tilt' | 'shake' | 'chop'
  type ZoneAction = PerfAction | GlitchAction | FilterAction | MotionAction

  const perfZones: { id: PerfAction; label: string; sub: string }[] = [
    { id: 'fill', label: 'FILL', sub: 'Density ↕  Velocity ↔' },
    { id: 'reverse', label: 'REV', sub: 'Reverse playback' },
    { id: 'break', label: 'BRK', sub: 'Duty ↕  Subdivide ↔' },
  ]
  const glitchZones: { id: GlitchAction; label: string; sub: string }[] = [
    { id: 'stutter', label: 'STTR', sub: 'Rate ↕' },
    { id: 'half', label: 'HALF', sub: 'Half speed' },
    { id: 'tape', label: 'TAPE', sub: 'Tape stop / start' },
  ]
  const filterZones: { id: FilterAction; label: string; sub: string }[] = [
    { id: 'lpf', label: 'LPF', sub: 'Cutoff ↕  Reso ↔' },
    { id: 'hpf', label: 'HPF', sub: 'Cutoff ↕  Reso ↔' },
    { id: 'dj', label: 'DJ', sub: 'LP ↓ HP ↑  Reso ↔' },
  ]
  const motionZones: { id: MotionAction; label: string; sub: string }[] = [
    { id: 'tilt', label: 'TILT', sub: 'Tilt → filter sweep' },
    { id: 'shake', label: 'SHKE', sub: 'Shake → fill burst' },
    { id: 'chop', label: 'CHOP', sub: 'Flick ↓ → mute' },
  ]

  const tabs = ['PERF', 'GLITCH', 'FILTER', 'MOTION'] as const
  type TabId = typeof tabs[number]
  let activeTab: TabId = $state('PERF')

  let padEl: HTMLDivElement | undefined = $state(undefined)
  let activeZone: ZoneAction | null = $state(null)
  let touchX = $state(0.5)
  let touchY = $state(0.5)
  let hasTilt = $state(false)

  const currentZones = $derived(
    activeTab === 'PERF' ? perfZones :
    activeTab === 'GLITCH' ? glitchZones :
    activeTab === 'FILTER' ? filterZones :
    activeTab === 'MOTION' && hasTilt ? motionZones : []
  )

  const stopped = $derived(!playback.playing)

  const isFilter = (a: ZoneAction): a is FilterAction => a === 'lpf' || a === 'hpf' || a === 'dj'

  // ── Shake detection state ──
  let shakeArmed = false
  let shakeFillTimer: ReturnType<typeof setTimeout> | null = null
  let savedGain = 0.8
  let chopActive = false

  function setEffect(action: ZoneAction, on: boolean) {
    if (action === 'fill') { if (isGuest()) { guestPerf('fill', on); return }; perf.filling = on }
    else if (action === 'reverse') { if (isGuest()) { guestPerf('reverse', on); return }; perf.reversing = on }
    else if (action === 'break') { if (isGuest()) { guestPerf('break', on); return }; perf.breaking = on }
    else if (action === 'stutter') perf.stuttering = on
    else if (action === 'half') perf.halfSpeed = on
    else if (action === 'tape') perf.tapeStop = on
    else if (isFilter(action)) fxPad.filter.on = on
    else if (action === 'tilt') {
      // Hold to engage tilt → filter. Tilt data routes in the orientation handler.
      fxPad.filter.on = on
    }
    else if (action === 'shake') {
      shakeArmed = on
      if (!on && shakeFillTimer) { clearTimeout(shakeFillTimer); shakeFillTimer = null; perf.filling = false }
    }
    else if (action === 'chop') {
      if (on) { savedGain = perf.masterGain }
      else if (chopActive) { perf.masterGain = savedGain; chopActive = false }
    }
  }

  /** Map filter zone + touchY → djFilter x parameter */
  function filterX(action: FilterAction, y: number): number {
    if (action === 'lpf') return y * 0.45          // 0=deep LP, 1=nearly flat
    if (action === 'hpf') return 0.55 + y * 0.45   // 0=nearly flat, 1=deep HP
    return y                                        // DJ: full 0–1 sweep
  }

  function updateXY(e: PointerEvent) {
    if (!padEl) return
    const rect = padEl.getBoundingClientRect()
    touchX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    touchY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))

    if (activeZone && isFilter(activeZone)) {
      // Route to existing DJFilter via fxPad state
      fxPad.filter.x = filterX(activeZone, touchY)
      fxPad.filter.y = touchX  // X-axis = resonance
    } else {
      perf.perfX = touchX
      perf.perfY = touchY
      perf.perfTouching = true
    }
  }

  function getZone(e: PointerEvent): ZoneAction {
    if (!padEl) return currentZones[0]?.id ?? 'fill'
    const rect = padEl.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const zones = currentZones
    const idx = Math.min(zones.length - 1, Math.floor(relX * zones.length))
    return zones[idx]?.id ?? 'fill'
  }

  function onPadDown(e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const zone = getZone(e)
    activeZone = zone
    setEffect(zone, true)
    updateXY(e)
  }

  function onPadMove(e: PointerEvent) {
    if (activeZone === null) return
    updateXY(e)
  }

  function onPadUp() {
    if (activeZone !== null) {
      setEffect(activeZone, false)
      if (!isFilter(activeZone)) perf.perfTouching = false
      activeZone = null
    } else {
      perf.perfTouching = false
    }
  }

  // ── Canvas visualizer ──
  let vizCanvas: HTMLCanvasElement | undefined = $state(undefined)
  let vizRaf = 0
  let beatPhase = 0
  let lastBeatTime = 0
  // Particle pool for FILL effect
  let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = []

  const COLORS = {
    blue:   [78, 132, 196],
    salmon: [232, 160, 144],
    teal:   [74, 155, 155],
    purple: [155, 107, 160],
    cream:  [237, 232, 220],
  } as const

  function zoneColor(zone: ZoneAction | null): readonly [number, number, number] {
    if (!zone) return COLORS.cream
    if (zone === 'fill' || zone === 'stutter') return COLORS.blue
    if (zone === 'break' || zone === 'tape') return COLORS.salmon
    if (zone === 'lpf' || zone === 'hpf' || zone === 'dj') return COLORS.teal
    if (zone === 'tilt' || zone === 'shake' || zone === 'chop') return COLORS.purple
    return COLORS.cream
  }

  function drawViz() {
    const canvas = vizCanvas
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) * 0.44
    const peak = Math.max(masterLevels.peakL, masterLevels.peakR)
    const bpm = song.bpm || 120
    const now = performance.now()

    // BPM phase (0..1 per beat)
    const msPerBeat = 60000 / bpm
    beatPhase = ((now % msPerBeat) / msPerBeat)
    const beatPulse = Math.pow(1 - beatPhase, 3) // sharp attack, slow decay

    const zone = activeZone
    const [cr, cg, cb] = zoneColor(zone)
    const engaged = zone !== null

    // Tilt / touch position for ball
    const vizX = hasTilt ? perf.tiltX : (touchX - 0.5) * 2
    const vizY = hasTilt ? perf.tiltY : (touchY - 0.5) * 2

    // ── Background ring pulse (always, BPM-synced + level-reactive) ──
    const ringAlphas = [0.04, 0.06, 0.08]
    for (let i = 0; i < 3; i++) {
      const r = maxR * (0.33 + i * 0.33)
      const levelBoost = peak * 0.08
      const bpmBoost = engaged ? beatPulse * 0.12 : beatPulse * 0.04
      const alpha = ringAlphas[i] + levelBoost + bpmBoost
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = engaged
        ? `rgba(${cr},${cg},${cb},${alpha})`
        : `rgba(237,232,220,${alpha})`
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Crosshair axes ──
    const axAlpha = engaged ? 0.06 + peak * 0.04 : 0.03
    ctx.strokeStyle = `rgba(237,232,220,${axAlpha})`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke()

    // ── Effect-specific visuals ──
    if (zone === 'fill') {
      // Spawn particles on each beat pulse peak
      if (beatPhase < 0.05 && now - lastBeatTime > msPerBeat * 0.5) {
        lastBeatTime = now
        const count = 3 + Math.floor(peak * 8)
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2
          const speed = 0.5 + Math.random() * 2
          particles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: `rgba(${cr},${cg},${cb},`,
          })
        }
      }
      // Draw & update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy; p.life -= 0.02
        if (p.life <= 0) { particles.splice(i, 1); continue }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2 + p.life * 2, 0, Math.PI * 2)
        ctx.fillStyle = p.color + (p.life * 0.6).toFixed(2) + ')'
        ctx.fill()
      }
    } else if (zone === 'reverse') {
      // Rotating arcs going backwards
      const rot = -(now / 800) % (Math.PI * 2)
      for (let i = 0; i < 3; i++) {
        const r = maxR * (0.4 + i * 0.2)
        const alpha = 0.1 + peak * 0.15
        ctx.beginPath()
        ctx.arc(cx, cy, r, rot + i * 2.1, rot + i * 2.1 + 1.2)
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
        ctx.lineWidth = 2
        ctx.stroke()
      }
    } else if (zone === 'break') {
      // Strobe segments — on/off based on beat subdivision
      const sub = Math.floor(beatPhase * 4) % 2
      if (sub === 0) {
        const alpha = 0.08 + peak * 0.15
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`
        ctx.fillRect(0, 0, w, h)
      }
    } else if (zone === 'stutter') {
      // Rapid concentric ring bursts
      const stutterPhase = (now / 120) % 1
      for (let i = 0; i < 4; i++) {
        const r = maxR * stutterPhase * (0.3 + i * 0.25)
        const alpha = (1 - stutterPhase) * 0.2
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    } else if (zone === 'half') {
      // Slow wave ripple
      const slowPhase = (now / 2000) % 1
      for (let i = 0; i < 3; i++) {
        const ph = (slowPhase + i * 0.33) % 1
        const r = maxR * ph
        const alpha = (1 - ph) * 0.12
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
        ctx.lineWidth = 2
        ctx.stroke()
      }
    } else if (zone === 'tape') {
      // Spiral collapse inward
      const spiral = (now / 300) % (Math.PI * 6)
      ctx.beginPath()
      for (let a = 0; a < Math.PI * 4; a += 0.05) {
        const r = maxR * (1 - a / (Math.PI * 5)) * (0.3 + peak * 0.3)
        const px = cx + Math.cos(a + spiral) * r
        const py = cy + Math.sin(a + spiral) * r
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.15)`
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else if (zone === 'lpf' || zone === 'hpf' || zone === 'dj') {
      // Sweep arc — angle represents cutoff
      const sweep = touchY * Math.PI * 1.5
      const startAngle = -Math.PI * 0.75
      const alpha = 0.15 + peak * 0.15
      ctx.beginPath()
      ctx.arc(cx, cy, maxR * 0.8, startAngle, startAngle + sweep)
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
      ctx.lineWidth = 3
      ctx.stroke()
      // Reso ring
      const resoR = maxR * 0.3 * touchX
      ctx.beginPath()
      ctx.arc(cx, cy, resoR + maxR * 0.2, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.06 + touchX * 0.1})`
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Level meter bars (subtle, bottom) ──
    if (playback.playing) {
      const barW = w * 0.3
      const barH = 3
      const barY = h - 12
      // Left
      ctx.fillStyle = `rgba(237,232,220,${0.06 + peak * 0.15})`
      ctx.fillRect(cx - barW - 2, barY, barW * masterLevels.peakL, barH)
      // Right
      ctx.fillRect(cx + 2, barY, barW * masterLevels.peakR, barH)
    }

    // ── Ball ──
    const ballX = cx + vizX * maxR * 0.85
    const ballY = cy - vizY * maxR * 0.85
    const ballR = 7 + peak * 4
    // Glow
    if (engaged) {
      const grad = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, ballR * 3)
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.25)`)
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      ctx.fillStyle = grad
      ctx.fillRect(ballX - ballR * 3, ballY - ballR * 3, ballR * 6, ballR * 6)
    }
    ctx.beginPath()
    ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2)
    ctx.fillStyle = engaged
      ? `rgba(${cr},${cg},${cb},${0.5 + peak * 0.3})`
      : `rgba(237,232,220,${0.1 + peak * 0.1})`
    ctx.fill()

    // ── Label ──
    if (zone) {
      ctx.font = '700 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `rgba(237,232,220,0.3)`
      ctx.fillText(zone.toUpperCase(), cx, h - 24)
    }

    vizRaf = requestAnimationFrame(drawViz)
  }

  // ── Sensors ──
  let cleanups: (() => void)[] = []

  async function initMotion() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        'requestPermission' in DeviceMotionEvent &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceMotionEvent as any).requestPermission()
        if (perm !== 'granted') return
      } catch { return }
    }

    // Orientation → tilt data (all tabs) + filter routing (TILT zone)
    const orientHandler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0
      const gamma = e.gamma ?? 0
      perf.tiltX = Math.max(-1, Math.min(1, gamma / 45))
      perf.tiltY = Math.max(-1, Math.min(1, (beta - 45) / 45))
      hasTilt = true

      // When TILT zone is held, route tilt to DJ filter
      if (activeZone === 'tilt') {
        // Map tiltX (-1..1) → filter x (0..1): left=LP, center=flat, right=HP
        fxPad.filter.x = (perf.tiltX + 1) * 0.5
        // Map tiltY (-1..1) → resonance (0..1): tilt forward = more reso
        fxPad.filter.y = Math.max(0, Math.min(1, (perf.tiltY + 1) * 0.5))
      }
    }
    window.addEventListener('deviceorientation', orientHandler)
    cleanups.push(() => window.removeEventListener('deviceorientation', orientHandler))

    // Acceleration → shake + chop detection (MOTION tab)
    const SHAKE_THRESHOLD = 25  // m/s² — firm shake
    const CHOP_THRESHOLD = 18   // m/s² downward — quick flick
    let lastShakeTime = 0

    const motionHandler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity
      if (!acc) return
      const x = acc.x ?? 0, y = acc.y ?? 0, z = acc.z ?? 0
      const mag = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()

      // Shake → fill burst (armed when SHAKE zone held)
      if (shakeArmed && mag > SHAKE_THRESHOLD && now - lastShakeTime > 500) {
        lastShakeTime = now
        perf.filling = true
        // Auto-release after ~1 bar (4 beats)
        if (shakeFillTimer) clearTimeout(shakeFillTimer)
        const msPerBar = (60_000 / (song.bpm || 120)) * 4
        shakeFillTimer = setTimeout(() => { perf.filling = false; shakeFillTimer = null }, msPerBar)
      }

      // Chop → momentary mute (armed when CHOP zone held)
      // Detect strong downward acceleration (positive Z spike beyond gravity)
      if (activeZone === 'chop' && !chopActive && z > CHOP_THRESHOLD) {
        chopActive = true
        perf.masterGain = 0
        // Restore after 100ms for punchy beat-repeat feel
        setTimeout(() => {
          if (chopActive) { perf.masterGain = savedGain; chopActive = false }
        }, 100)
      }
    }
    window.addEventListener('devicemotion', motionHandler)
    cleanups.push(() => window.removeEventListener('devicemotion', motionHandler))
  }

  onMount(() => {
    initMotion()
    vizRaf = requestAnimationFrame(drawViz)
  })
  onDestroy(() => {
    cancelAnimationFrame(vizRaf)
    cleanups.forEach(fn => fn())
    perf.perfTouching = false
    fxPad.filter.on = false
  })
</script>

<div class="perf-content">
  <!-- Tab bar -->
  <div class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab}
        class:disabled={tab === 'MOTION' && !hasTilt}
        onpointerdown={() => { if (tab !== 'MOTION' || hasTilt) activeTab = tab }}
      >{tab}</button>
    {/each}
  </div>

  {#if currentZones.length > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="kaoss-pad"
      class:stopped
      bind:this={padEl}
      onpointerdown={onPadDown}
      onpointermove={onPadMove}
      onpointerup={onPadUp}
      onpointercancel={onPadUp}
    >
      <!-- Zone labels -->
      {#each currentZones as zone, i}
        {@const isActive = activeZone === zone.id}
        {@const zoneWidth = 100 / currentZones.length}
        <div
          class="zone"
          class:active={isActive}
          class:accent-blue={zone.id === 'fill' || zone.id === 'stutter'}
          class:accent-salmon={zone.id === 'break' || zone.id === 'tape'}
          class:accent-teal={zone.id === 'lpf' || zone.id === 'hpf' || zone.id === 'dj'}
          class:accent-purple={zone.id === 'tilt' || zone.id === 'shake' || zone.id === 'chop'}
          style="left:{i * zoneWidth}%;width:{zoneWidth}%"
        >
          <span class="zone-label">{zone.label}</span>
          <span class="zone-sub">{zone.sub}</span>
        </div>
      {/each}

      <!-- Crosshair -->
      {#if activeZone !== null}
        <div class="crosshair-h" style="top:{(1 - touchY) * 100}%"></div>
        <div class="crosshair-v" style="left:{touchX * 100}%"></div>
        <div class="touch-dot" style="left:{touchX * 100}%;top:{(1 - touchY) * 100}%"></div>
      {/if}

      <!-- Zone dividers -->
      {#each currentZones.slice(1) as _, i}
        {@const pos = ((i + 1) / currentZones.length) * 100}
        <div class="divider" style="left:{pos}%"></div>
      {/each}

      <!-- Tilt indicator -->
      {#if hasTilt}
        <div class="tilt-indicator"
          style="left:{50 + perf.tiltX * 40}%;top:{50 - perf.tiltY * 40}%"
        ></div>
      {/if}
    </div>

    <!-- Info bar -->
    <div class="info-bar">
      {#if activeTab === 'FILTER' && activeZone && isFilter(activeZone)}
        <span class="info-item">CUTOFF {(touchY * 100).toFixed(0)}%</span>
        <span class="info-item">RESO {(touchX * 100).toFixed(0)}%</span>
      {:else if activeTab === 'MOTION' && activeZone === 'tilt'}
        <span class="info-item">PAN {(perf.tiltX > 0 ? 'R' : 'L')}{Math.abs(perf.tiltX * 100).toFixed(0)}</span>
        <span class="info-item">RESO {((perf.tiltY + 1) * 50).toFixed(0)}%</span>
      {:else}
        <span class="info-item">X {(touchX * 100).toFixed(0)}%</span>
        <span class="info-item">Y {(touchY * 100).toFixed(0)}%</span>
      {/if}
      {#if hasTilt && activeTab !== 'MOTION'}
        <span class="info-item">TILT {(perf.tiltX > 0 ? 'R' : 'L')}{Math.abs(perf.tiltX * 100).toFixed(0)}</span>
      {/if}
      <span class="info-item" class:active-label={activeZone !== null}>
        {activeZone ? activeZone.toUpperCase() : activeTab === 'MOTION' ? 'HOLD + MOVE' : 'TOUCH TO PLAY'}
      </span>
    </div>

    <!-- Canvas visualizer -->
    <canvas class="perf-viz" bind:this={vizCanvas}></canvas>
  {:else}
    <div class="coming-soon">{activeTab === 'MOTION' ? 'No motion sensor detected' : 'Coming soon'}</div>
  {/if}
</div>

<style>
  .perf-content {
    padding: 0 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    gap: 2px;
  }
  .tab-btn {
    flex: 1;
    padding: 8px 0;
    border: none;
    background: var(--dz-divider);
    color: var(--dz-transport-border);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    transition: background 80ms, color 80ms;
  }
  .tab-btn:first-child { border-radius: var(--radius-md) 0 0 var(--radius-md); }
  .tab-btn:last-child { border-radius: 0 var(--radius-md) var(--radius-md) 0; }
  .tab-btn.active {
    background: var(--dz-bg-press);
    color: var(--dz-text-bright);
  }
  .tab-btn.disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* ── Kaoss Pad ── */
  .kaoss-pad {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 2;
    background: var(--color-bg);
    border-radius: var(--radius-md);
    overflow: hidden;
    touch-action: none;
    user-select: none;
    cursor: crosshair;
    flex-shrink: 0;
  }
  .kaoss-pad.stopped {
    opacity: 0.4;
    pointer-events: none;
  }

  /* ── Zones ── */
  .zone {
    position: absolute;
    top: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 60ms;
  }
  .zone.active { background: var(--dz-bg-hover); }
  .zone.active.accent-blue { background: var(--blue-bg); }
  .zone.active.accent-salmon { background: var(--salmon-bg-key); }
  .zone.active.accent-teal { background: var(--teal-bg); }
  .zone.active.accent-purple { background: var(--purple-bg); }

  .zone-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px; /* display: perf display value */
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dz-border);
    pointer-events: none;
  }
  .zone.active .zone-label { color: var(--dz-text-mid); }
  .zone.accent-blue .zone-label { color: var(--blue-bg); }
  .zone.accent-blue.active .zone-label { color: var(--color-blue); }
  .zone.accent-salmon .zone-label { color: var(--salmon-bg-key); }
  .zone.accent-salmon.active .zone-label { color: var(--color-salmon); }
  .zone.accent-teal .zone-label { color: var(--teal-bg); }
  .zone.accent-teal.active .zone-label { color: var(--color-teal); }
  .zone.accent-purple .zone-label { color: var(--purple-bg); }
  .zone.accent-purple.active .zone-label { color: var(--color-purple); }

  .zone-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--fs-min);
    color: var(--dz-bg-active);
    letter-spacing: 0.04em;
    pointer-events: none;
  }
  .zone.active .zone-sub { color: var(--dz-border-strong); }

  /* ── Dividers ── */
  .divider {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    background: var(--dz-bg-hover);
    pointer-events: none;
  }

  /* ── Crosshair ── */
  .crosshair-h {
    position: absolute;
    left: 0;
    width: 100%;
    height: 1px;
    background: var(--dz-border-mid);
    pointer-events: none;
  }
  .crosshair-v {
    position: absolute;
    top: 0;
    height: 100%;
    width: 1px;
    background: var(--dz-border-mid);
    pointer-events: none;
  }
  .touch-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--dz-text-mid);
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-shadow: 0 0 12px var(--dz-border-strong);
  }

  /* ── Tilt indicator ── */
  .tilt-indicator {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--dz-border);
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: left 80ms, top 80ms;
  }

  /* ── Info bar ── */
  .info-bar {
    display: flex;
    gap: 12px;
    justify-content: center;
    padding: 4px 0;
  }
  .info-item {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-border-mid);
  }
  .info-item.active-label {
    color: var(--dz-text-mid);
  }

  /* ── Canvas visualizer ── */
  .perf-viz {
    width: 100%;
    min-height: 80px;
    max-height: 160px;
    background: var(--color-bg);
    border-radius: var(--radius-md);
    flex-shrink: 1;
  }

  .coming-soon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dz-border);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--fs-lg);
    letter-spacing: 0.06em;
    min-height: 200px;
  }
</style>
