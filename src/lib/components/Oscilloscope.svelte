<script lang="ts">
  import { onMount } from 'svelte'
  import { engine } from '../audio/engine.ts'

  let canvasEl: HTMLCanvasElement | undefined = $state(undefined)
  let animId = 0
  let timeBuf: Uint8Array | null = null
  let opacity = 0        // current draw opacity (0–1)
  const FADE_IN = 0.15   // per-frame rise
  const FADE_OUT = 0.02  // per-frame decay — slow fade

  onMount(() => {
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  })

  function draw() {
    animId = requestAnimationFrame(draw)
    const analyser = engine.getAnalyser()
    if (!canvasEl) return

    const w = canvasEl.clientWidth
    const h = canvasEl.clientHeight
    if (w === 0 || h === 0) return

    const dpr = window.devicePixelRatio || 1
    if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
      canvasEl.width = w * dpr
      canvasEl.height = h * dpr
    }

    const ctx = canvasEl.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!analyser) { opacity = Math.max(0, opacity - FADE_OUT); return }

    if (!timeBuf) timeBuf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(timeBuf)

    // Detect signal level (max deviation from 128 center)
    const len = timeBuf.length
    let maxDev = 0
    for (let i = 0; i < len; i++) {
      const d = Math.abs(timeBuf[i] - 128)
      if (d > maxDev) maxDev = d
    }

    // Fade in/out based on signal
    if (maxDev > 2) {
      opacity = Math.min(1, opacity + FADE_IN)
    } else {
      opacity = Math.max(0, opacity - FADE_OUT)
    }

    if (opacity < 0.005) return  // fully faded — skip draw

    // Find a zero-crossing near the start for stable display
    let start = 0
    for (let i = 1; i < len / 2; i++) {
      if (timeBuf[i - 1] < 128 && timeBuf[i] >= 128) { start = i; break }
    }

    // Draw waveform
    const drawLen = Math.min(len - start, len / 2)
    const sliceW = w / drawLen
    const cy = h / 2

    ctx.beginPath()
    for (let i = 0; i < drawLen; i++) {
      const v = (timeBuf[start + i] - 128) / 128  // -1 to 1
      const y = cy - v * (h * 0.38)
      if (i === 0) ctx.moveTo(0, y)
      else ctx.lineTo(i * sliceW, y)
    }
    const a = (0.2 * opacity).toFixed(3)
    ctx.strokeStyle = `rgba(237, 232, 220, ${a})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
</script>

<canvas bind:this={canvasEl}></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
