<script lang="ts">
  interface Props {
    value: number       // 0.0–1.0
    label: string
    size?: number       // SVG px
    light?: boolean     // true = dark strokes for cream background
    compact?: boolean   // true = SVG only, no value/label text
    locked?: boolean    // true = P-Lock active (olive value arc)
    steps?: number      // number of discrete positions (e.g. 5 for 0-4) — snaps knob
    displayValue?: string // override displayed value text (e.g. "UP", "OFF")
    defaultValue?: number // value to reset to on double-click (0.0–1.0); also shows tick mark when set
    onchange: (v: number) => void
  }
  let { value, label, size = 32, light = false, compact = false, locked = false, steps = 0, displayValue, defaultValue, onchange }: Props = $props()

  function snap(v: number): number {
    if (steps < 2) return v
    const n = steps - 1
    return Math.round(v * n) / n
  }

  const trackStroke = $derived(light ? 'rgba(30,32,40,0.15)' : 'rgba(237,232,220,0.18)')
  const valueStroke = $derived(
    locked ? 'var(--color-olive, #6C7744)'
    : light ? 'rgba(30,32,40,0.75)' : 'rgba(237,232,220,0.82)'
  )

  // Arc geometry
  const r    = $derived(size / 2 - 4)        // radius
  const cx   = $derived(size / 2)
  const cy   = $derived(size / 2)
  const circ = $derived(2 * Math.PI * r)
  const arcFull = $derived(circ * 270 / 360)  // 270° travel

  const dash    = $derived(value * arcFull)
  const dashArr = $derived(`${dash} 1000`)

  // Default-value tick mark (only when explicitly provided and not at extremes)
  const showTick = $derived(defaultValue != null && defaultValue > 0 && defaultValue < 1)
  const tickAngle = $derived((-135 + (defaultValue ?? 0) * 270) * Math.PI / 180)
  const tickX1 = $derived(cx + (r - 2) * Math.cos(tickAngle))
  const tickY1 = $derived(cy + (r - 2) * Math.sin(tickAngle))
  const tickX2 = $derived(cx + (r + 2) * Math.cos(tickAngle))
  const tickY2 = $derived(cy + (r + 2) * Math.sin(tickAngle))

  // Drag state
  let dragging = $state(false)
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
    const sensitivity = e.shiftKey ? 400 : 100
    const delta = (startY - e.clientY) / sensitivity
    const raw = Math.min(1, Math.max(0, startVal + delta))
    onchange(snap(raw))
  }
  function onPointerUp() { dragging = false }
  function onDblClick() { if (defaultValue != null) onchange(snap(defaultValue)) }
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
  ondblclick={onDblClick}
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
    <!-- Default-value tick -->
    {#if showTick}
      <line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2}
        stroke={trackStroke} stroke-width="1.5" />
    {/if}
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
  {#if !compact}<span class="val">{displayValue ?? Math.round(value * 100)}</span>{/if}
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
    font-size: 11px;
    color: rgba(237,232,220,0.85);
    white-space: nowrap;
    line-height: 1;
  }
  .light .val { color: rgba(30,32,40,0.7); }
  .lbl {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.55);
    text-transform: uppercase;
    white-space: nowrap;
    line-height: 1;
  }
  .light .lbl { color: rgba(30,32,40,0.35); }
</style>
