<script lang="ts">
  import { song, playback, ui, pushUndo } from '../state.svelte.ts'
  import { sceneMoveStamp } from '../sceneActions.ts'
  import { TAP_THRESHOLD, PAD_INSET } from '../constants.ts'
  import { WORLD_W, WORLD_H, toNormScene } from '../sceneGeometry.ts'
  import { STAMP_LIBRARY } from '../stampLibrary.ts'

  import { sceneDeleteStamp } from '../sceneActions.ts'

  const { zoom, panX, panY, viewEl, eraserMode }: {
    zoom: number
    panX: number
    panY: number
    viewEl: HTMLDivElement
    eraserMode?: boolean
  } = $props()

  let draggingStamp: string | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }
  let dragStartNorm = { x: 0, y: 0 }
  let stampStartPositions = new Map<string, { x: number; y: number }>()

  function toNorm(e: PointerEvent) {
    if (!viewEl) return null
    return toNormScene(e.clientX, e.clientY, viewEl.getBoundingClientRect(), panX, panY, zoom)
  }

  /** Fixed particle positions (angle, distance, size, delay) seeded per index */
  const STAR_PARTICLES = [
    { angle: 30,  dist: 22, size: 5,  delay: 0 },
    { angle: 80,  dist: 28, size: 4,  delay: 2 },
    { angle: 140, dist: 20, size: 6,  delay: 5 },
    { angle: 200, dist: 26, size: 3,  delay: 1 },
    { angle: 260, dist: 24, size: 5,  delay: 4 },
    { angle: 320, dist: 30, size: 4,  delay: 3 },
    { angle: 55,  dist: 34, size: 3,  delay: 6 },
  ]
  const BIRD_PARTICLES = [
    { angle: 20,  dist: 28, delay: 0, flip: false },
    { angle: 90,  dist: 32, delay: 1, flip: true },
    { angle: 160, dist: 26, delay: 3, flip: false },
    { angle: 240, dist: 30, delay: 2, flip: true },
    { angle: 310, dist: 34, delay: 4, flip: false },
  ]
</script>

{#each (song.scene.stamps ?? []) as stamp (stamp.id)}
  {@const def = STAMP_LIBRARY[stamp.stampId]}
  {@const size = 24 * (stamp.scale ?? 1)}
  {@const isPlaying = playback.playing}
  {#if def}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scene-stamp"
      class:selected={ui.selectedSceneStamps[stamp.id]}
      class:playing={isPlaying}
      style="
        left: {PAD_INSET + stamp.x * (WORLD_W - PAD_INSET * 2)}px;
        top: {PAD_INSET + stamp.y * (WORLD_H - PAD_INSET * 2)}px;
        width: {size + 8}px;
        height: {size + 8}px;
        color: {def.color};
        {isPlaying ? `--beat: ${30 / song.bpm}s;` : ''}
      "
      onpointerdown={(e: PointerEvent) => {
        e.stopPropagation()
        if (eraserMode) {
          pushUndo('Delete stamp')
          sceneDeleteStamp(stamp.id)
          return
        }
        pushUndo('Move stamp')
        ui.selectedSceneNodes = {}
        ui.selectedSceneEdge = null
        ui.selectedSceneLabels = {}
        if (e.shiftKey) {
          if (ui.selectedSceneStamps[stamp.id]) {
            delete ui.selectedSceneStamps[stamp.id]
          } else {
            ui.selectedSceneStamps[stamp.id] = true
          }
        } else if (!ui.selectedSceneStamps[stamp.id]) {
          ui.selectedSceneStamps = { [stamp.id]: true }
        }
        draggingStamp = stamp.id
        dragMoved = false
        startPos = { x: e.clientX, y: e.clientY }
        const norm = toNorm(e)
        if (norm) dragStartNorm = norm
        stampStartPositions.clear()
        for (const id of Object.keys(ui.selectedSceneStamps)) {
          const s = song.scene.stamps.find(st => st.id === id)
          if (s) stampStartPositions.set(id, { x: s.x, y: s.y })
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onpointermove={(e: PointerEvent) => {
        if (draggingStamp !== stamp.id) return
        if (!dragMoved) {
          const dx = Math.abs(e.clientX - startPos.x)
          const dy = Math.abs(e.clientY - startPos.y)
          if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
        }
        if (dragMoved) {
          const pos = toNorm(e)
          if (!pos) return
          const deltaX = pos.x - dragStartNorm.x
          const deltaY = pos.y - dragStartNorm.y
          for (const [id, start] of stampStartPositions) {
            const nx = Math.max(0, Math.min(1, start.x + deltaX))
            const ny = Math.max(0, Math.min(1, start.y + deltaY))
            sceneMoveStamp(id, nx, ny)
          }
        }
      }}
      onpointerup={() => { draggingStamp = null }}
    >
      <div class="stamp-inner anim-{def.animation}">
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="var(--color-fg)" stroke-width="1" paint-order="stroke fill" stroke-linejoin="round" overflow="visible" aria-hidden="true">
          {@html def.svg}
        </svg>
      </div>

      <!-- Star particles (moon) -->
      {#if def.particles === 'stars' && isPlaying}
        {#each STAR_PARTICLES as p}
          <div
            class="particle star"
            style="
              left: calc(50% + {Math.cos(p.angle * Math.PI / 180) * p.dist}px);
              top: calc(50% + {Math.sin(p.angle * Math.PI / 180) * p.dist}px);
              font-size: {p.size}px;
              animation-delay: calc(var(--beat) * {p.delay});
            "
          >★</div>
        {/each}
      {/if}

      <!-- Bird particles (sun) -->
      {#if def.particles === 'birds' && isPlaying}
        {#each BIRD_PARTICLES as p}
          <div
            class="particle bird"
            style="
              left: calc(50% + {Math.cos(p.angle * Math.PI / 180) * p.dist}px);
              top: calc(50% + {Math.sin(p.angle * Math.PI / 180) * p.dist}px);
              animation-delay: calc(var(--beat) * {p.delay});
              {p.flip ? 'transform: scaleX(-1);' : ''}
            "
          >
            <svg viewBox="0 0 16 10" width="12" height="8" fill="var(--color-fg)" aria-hidden="true">
              <path d="M8 5 C6 1, 2 0, 0 2 C2 1.5, 5 2, 8 5Z M8 5 C10 1, 14 0, 16 2 C14 1.5, 11 2, 8 5Z"/>
            </svg>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{/each}

<style>
  .scene-stamp {
    position: absolute;
    transform: translate(-50%, -50%);
    cursor: grab;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    user-select: none;
    transition: color 80ms;
  }
  .scene-stamp:hover {
    filter: brightness(1.15);
  }
  .scene-stamp.selected {
    outline: 1.5px dashed var(--color-fg);
    outline-offset: 2px;
  }

  .stamp-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Particles ── */

  .particle {
    position: absolute;
    pointer-events: none;
    opacity: 0;
  }
  .particle.star {
    color: var(--color-blue);
    animation: star-twinkle calc(var(--beat) * 8) ease-in-out infinite;
  }
  .particle.bird {
    animation: bird-fly calc(var(--beat) * 6) ease-in-out infinite;
  }

  @keyframes star-twinkle {
    0%   { opacity: 0; transform: scale(0.5) rotate(0deg); }
    15%  { opacity: 0.8; transform: scale(1) rotate(20deg); }
    30%  { opacity: 0.3; transform: scale(0.7) rotate(40deg); }
    50%  { opacity: 1; transform: scale(1.1) rotate(60deg); }
    70%  { opacity: 0.4; transform: scale(0.8) rotate(80deg); }
    85%  { opacity: 0.9; transform: scale(1) rotate(100deg); }
    100% { opacity: 0; transform: scale(0.5) rotate(120deg); }
  }

  @keyframes bird-fly {
    0%   { opacity: 0; transform: translate(0, 0) rotate(0deg); }
    10%  { opacity: 0.7; }
    50%  { opacity: 0.9; transform: translate(8px, -6px) rotate(-10deg); }
    80%  { opacity: 0.5; transform: translate(14px, -2px) rotate(5deg); }
    100% { opacity: 0; transform: translate(18px, 2px) rotate(0deg); }
  }

  /* ════════════════════════════════════════════════════
   * Per-stamp animations — each stamp has unique motion.
   * All durations are multiples of --beat for music sync.
   * ════════════════════════════════════════════════════ */


  .playing .anim-melt {
    transform-origin: center 60%;
    animation: stamp-melt calc(var(--beat) * 8) ease-in-out infinite;
  }
  @keyframes stamp-melt {
    0%   { transform: scaleY(1) scaleX(1) skewX(0deg) translateY(0); }
    15%  { transform: scaleY(1.05) scaleX(0.97) skewX(2deg) translateY(2px); }
    35%  { transform: scaleY(1.14) scaleX(0.91) skewX(5deg) translateY(5px); }
    55%  { transform: scaleY(1.2) scaleX(0.86) skewX(6deg) translateY(7px); }
    70%  { transform: scaleY(1.12) scaleX(0.92) skewX(3deg) translateY(4px); }
    85%  { transform: scaleY(1.04) scaleX(0.97) skewX(1deg) translateY(1px); }
    100% { transform: scaleY(1) scaleX(1) skewX(0deg) translateY(0); }
  }

  .playing .anim-moon {
    animation: stamp-moon calc(var(--beat) * 16) ease-in-out infinite;
  }
  @keyframes stamp-moon {
    0%   { transform: translateX(0) rotate(0deg) scale(1); opacity: 0.8; }
    15%  { transform: translateX(-6px) rotate(-8deg) scale(1.02); opacity: 0.9; }
    30%  { transform: translateX(-3px) rotate(-3deg) scale(1.05); opacity: 1; }
    50%  { transform: translateX(0) rotate(0deg) scale(1.03); opacity: 0.85; }
    65%  { transform: translateX(6px) rotate(8deg) scale(1.02); opacity: 0.95; }
    80%  { transform: translateX(3px) rotate(3deg) scale(1.05); opacity: 1; }
    100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 0.8; }
  }

  .playing .anim-sun {
    animation:
      stamp-sun-spin calc(var(--beat) * 64) linear infinite,
      stamp-sun-pulse var(--beat) ease-out infinite;
  }
  @keyframes stamp-sun-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes stamp-sun-pulse {
    0%   { scale: 1; }
    15%  { scale: 1.12; }
    100% { scale: 1; }
  }

  .playing .anim-heartbeat {
    transform-origin: center center;
    animation: stamp-heartbeat calc(var(--beat) * 4) ease-out infinite;
  }
  @keyframes stamp-heartbeat {
    0%   { transform: scale(1); }
    7%   { transform: scale(1.25); }
    14%  { transform: scale(1); }
    21%  { transform: scale(1.18); }
    28%  { transform: scale(1); }
    100% { transform: scale(1); }
  }

  .playing .anim-flame {
    transform-origin: center bottom;
    animation: stamp-flame-sway calc(var(--beat) * 4) ease-in-out infinite;
    filter: blur(0.3px) contrast(1.3);
  }
  /* Outer flame glow — larger, slower */
  .playing .anim-flame::before {
    content: '';
    position: absolute;
    inset: -6px -4px -2px -4px;
    background: radial-gradient(ellipse at 50% 80%, rgba(255, 120, 20, 0.6), rgba(255, 60, 0, 0.3) 50%, transparent 75%);
    border-radius: 50% 50% 40% 40%;
    mix-blend-mode: screen;
    animation: flame-outer calc(var(--beat) * 2) ease-in-out infinite alternate;
    pointer-events: none;
  }
  /* Inner flame core — smaller, faster, brighter */
  .playing .anim-flame::after {
    content: '';
    position: absolute;
    inset: 0 2px 4px 2px;
    background: radial-gradient(ellipse at 50% 70%, rgba(255, 200, 50, 0.5), rgba(255, 120, 20, 0.2) 60%, transparent 80%);
    border-radius: 50% 50% 30% 30%;
    mix-blend-mode: screen;
    animation: flame-inner var(--beat) ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes stamp-flame-sway {
    0%   { transform: scaleY(1) translateX(0) rotate(0deg); }
    25%  { transform: scaleY(1.15) translateX(-2px) rotate(-3deg); }
    50%  { transform: scaleY(0.95) translateX(1px) rotate(2deg); }
    75%  { transform: scaleY(1.2) translateX(-1px) rotate(-2deg); }
    100% { transform: scaleY(1) translateX(0) rotate(0deg); }
  }
  @keyframes flame-outer {
    0%   { transform: scaleY(1) scaleX(1) translateY(0); opacity: 0.5; }
    50%  { transform: scaleY(1.2) scaleX(0.9) translateY(-3px); opacity: 0.8; }
    100% { transform: scaleY(1.1) scaleX(1.05) translateY(-1px); opacity: 0.6; }
  }
  @keyframes flame-inner {
    0%   { transform: scaleY(1) translateY(0); opacity: 0.4; }
    50%  { transform: scaleY(1.3) translateY(-4px); opacity: 0.7; }
    100% { transform: scaleY(1.1) translateY(-2px); opacity: 0.5; }
  }

  .playing .anim-ghost {
    animation: stamp-ghost calc(var(--beat) * 16) ease-in-out infinite;
  }
  @keyframes stamp-ghost {
    0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.9; }
    10%  { transform: translateY(-6px) translateX(2px) scale(1.02); opacity: 0.85; }
    25%  { transform: translateY(-14px) translateX(-3px) scale(1.05); opacity: 0.5; }
    35%  { transform: translateY(-18px) translateX(0) scale(1.03); opacity: 0.2; }
    45%  { transform: translateY(-12px) translateX(4px) scale(1); opacity: 0.15; }
    55%  { transform: translateY(-6px) translateX(2px) scale(0.98); opacity: 0.4; }
    70%  { transform: translateY(0) translateX(-2px) scale(1); opacity: 0.75; }
    85%  { transform: translateY(3px) translateX(1px) scale(1.01); opacity: 0.95; }
    100% { transform: translateY(0) translateX(0) scale(1); opacity: 0.9; }
  }
</style>
