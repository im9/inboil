<script lang="ts">
  interface Props {
    value: number       // 0.0–1.0
    label: string
    size?: number       // SVG px
    light?: boolean     // true = dark strokes for cream background
    compact?: boolean   // true = SVG only, no value/label text
    locked?: boolean    // true = P-Lock active (olive value arc)
    onchange: (v: number) => void
  }
  let { value, label, size = 32, light = false, compact = false, locked = false, onchange }: Props = $props()

  const trackStroke = $derived(light ? 'rgba(30,32,40,0.15)' : 'rgba(237,232,220,0.18)')
  const valueStroke = $derived(
    locked ? 'var(--color-olive, #6C7744)'
    : light ? 'rgba(30,32,40,0.75)' : 'rgba(237,232,220,0.82)'
  )

  // Arc geometry
  const r    = size / 2 - 4        // radius
  const cx   = size / 2
  const cy   = size / 2
  const circ = 2 * Math.PI * r
  const arcFull = circ * 270 / 360  // 270° travel

  const dash    = $derived(value * arcFull)
  const dashArr = $derived(`${dash} 1000`)

  // Drag state
  let dragging = false
  let startY   = 0
  let startVal = 0

  function onPointerDown(e: PointerEvent) {
    dragging = true
    startY   = e.clientY
    startVal = value
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const delta = (startY - e.clientY) / 100
    onchange(Math.min(1, Math.max(0, startVal + delta)))
  }
  function onPointerUp() { dragging = false }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="knob-wrap"
  class:dragging
  class:light
  role="slider"
  aria-valuenow={Math.round(value * 100)}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={label}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <!-- Track arc (full 270° range) -->
    <circle
      {cx} {cy} r={r}
      fill="none"
      stroke={trackStroke}
      stroke-width="2"
      stroke-dasharray="{arcFull} 1000"
      stroke-linecap="round"
      transform="rotate(-135 {cx} {cy})"
    />
    <!-- Value arc -->
    <circle
      {cx} {cy} r={r}
      fill="none"
      stroke={valueStroke}
      stroke-width="2"
      stroke-dasharray={dashArr}
      stroke-linecap="round"
      transform="rotate(-135 {cx} {cy})"
    />
  </svg>
  {#if !compact}<span class="val">{Math.round(value * 100)}</span>{/if}
  <span class="lbl">{label}</span>
</div>

<style>
  .knob-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    cursor: ns-resize;
    user-select: none;
    touch-action: none;
  }
  .knob-wrap.dragging { cursor: grabbing; }
  .val {
    font-size: 10px;
    color: rgba(237,232,220,0.88);
    white-space: nowrap;
    line-height: 1;
  }
  .light .val { color: rgba(30,32,40,0.8); }
  .lbl {
    font-size: 8px;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.38);
    text-transform: uppercase;
    white-space: nowrap;
    line-height: 1;
  }
  .light .lbl { color: rgba(30,32,40,0.4); }
</style>
