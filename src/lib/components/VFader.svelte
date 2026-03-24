<script lang="ts">
  interface Props {
    value: number       // 0.0–1.0
    label: string
    height?: number     // track height in px
    displayValue?: string
    defaultValue?: number
    onchange: (v: number) => void
  }
  let { value, label, height = 80, displayValue, defaultValue = 0.5, onchange }: Props = $props()

  const trackWidth = 4
  const thumbSize = 10

  // Drag state
  let dragging = $state(false)
  let startY = 0
  let startVal = 0

  function onPointerDown(e: PointerEvent) {
    dragging = true
    startY = e.clientY
    startVal = value
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const sensitivity = e.shiftKey ? height * 4 : height
    const delta = (startY - e.clientY) / sensitivity
    onchange(Math.min(1, Math.max(0, startVal + delta)))
  }
  function onPointerUp() { dragging = false }
  function onDblClick() { onchange(defaultValue) }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="vfader-wrap"
  class:dragging
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
  <span class="lbl">{label}</span>
  <div class="track" style="height: {height}px;">
    <div class="track-bg" style="width: {trackWidth}px;"></div>
    <div class="track-fill" style="width: {trackWidth}px; height: {value * 100}%;"></div>
    <div class="thumb" style="bottom: calc({value * 100}% - {thumbSize / 2}px); width: {thumbSize}px; height: {thumbSize}px;"></div>
  </div>
  <span class="val">{displayValue ?? Math.round(value * 100)}</span>
</div>

<style>
  .vfader-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: ns-resize;
    user-select: none;
    touch-action: none;
    min-width: 28px;
  }
  .vfader-wrap.dragging { cursor: grabbing; }
  .lbl {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-dim);
    text-transform: uppercase;
    white-space: nowrap;
    line-height: 1;
  }
  .track {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .track-bg {
    position: absolute;
    bottom: 0;
    height: 100%;
    border-radius: 0;
    background: var(--dz-bg-active);
  }
  .track-fill {
    position: absolute;
    bottom: 0;
    border-radius: 0;
    background: var(--dz-text);
    transition: height 30ms linear;
  }
  .thumb {
    position: absolute;
    border-radius: 50%;
    background: var(--dz-text-bright);
    box-shadow: 0 0 4px var(--lz-text-hint);
    transition: bottom 30ms linear;
  }
  .val {
    font-size: var(--fs-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--dz-text);
    white-space: nowrap;
    line-height: 1;
  }
</style>
