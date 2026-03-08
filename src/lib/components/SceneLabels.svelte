<script lang="ts">
  import { song, ui } from '../state.svelte.ts'
  import { sceneUpdateLabel, sceneMoveLabel, sceneResizeLabel } from '../sceneActions.ts'
  import { TAP_THRESHOLD, PAD_INSET } from '../constants.ts'
  import { WORLD_W, WORLD_H } from '../sceneGeometry.ts'

  const { zoom, panX, panY, viewEl }: {
    zoom: number
    panX: number
    panY: number
    viewEl: HTMLDivElement
  } = $props()

  let editingLabelId: string | null = $state(null)
  let draggingLabel: string | null = $state(null)
  let resizingLabel: string | null = $state(null)
  let resizeStartY = 0
  let resizeStartSize = 1
  let dragMoved = false
  let startPos = { x: 0, y: 0 }
  let lastTapTime = 0
  let lastTapId = ''

  function toNorm(e: PointerEvent) {
    if (!viewEl) return null
    const rect = viewEl.getBoundingClientRect()
    const canvasX = (e.clientX - rect.left - panX) / zoom
    const canvasY = (e.clientY - rect.top - panY) / zoom
    const x = Math.max(0, Math.min(1, (canvasX - PAD_INSET) / (WORLD_W - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, (canvasY - PAD_INSET) / (WORLD_H - PAD_INSET * 2)))
    return { x, y }
  }

  export function clearEditing() {
    editingLabelId = null
  }

  export function startEditing(id: string) {
    editingLabelId = id
  }
</script>

{#each (song.scene.labels ?? []) as label (label.id)}
  {@const fontSize = 10 * (label.size ?? 1)}
  {#if editingLabelId === label.id}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="scene-label-edit"
      style="
        left: {PAD_INSET + label.x * (WORLD_W - PAD_INSET * 2)}px;
        top: {PAD_INSET + label.y * (WORLD_H - PAD_INSET * 2)}px;
        font-size: {fontSize}px;
      "
      type="text"
      value={label.text}
      maxlength={32}
      autofocus
      onpointerdown={(e: PointerEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        if (e.key === 'Escape') { editingLabelId = null }
      }}
      onblur={(e: FocusEvent) => {
        sceneUpdateLabel(label.id, (e.currentTarget as HTMLInputElement).value)
        editingLabelId = null
      }}
    />
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="scene-label"
      class:selected={ui.selectedSceneLabel === label.id}
      style="
        left: {PAD_INSET + label.x * (WORLD_W - PAD_INSET * 2)}px;
        top: {PAD_INSET + label.y * (WORLD_H - PAD_INSET * 2)}px;
        font-size: {fontSize}px;
      "
      onpointerdown={(e: PointerEvent) => {
        e.stopPropagation()
        ui.selectedSceneNodes = {}
        ui.selectedSceneEdge = null
        ui.selectedSceneLabel = label.id
        draggingLabel = label.id
        dragMoved = false
        startPos = { x: e.clientX, y: e.clientY }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onpointermove={(e: PointerEvent) => {
        if (draggingLabel !== label.id) return
        if (!dragMoved) {
          const dx = Math.abs(e.clientX - startPos.x)
          const dy = Math.abs(e.clientY - startPos.y)
          if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
        }
        if (dragMoved) {
          const pos = toNorm(e)
          if (pos) sceneMoveLabel(label.id, pos.x, pos.y)
        }
      }}
      onpointerup={() => {
        if (draggingLabel === label.id && !dragMoved) {
          const now = Date.now()
          if (lastTapId === label.id && now - lastTapTime < 300) {
            editingLabelId = label.id
            lastTapTime = 0
            lastTapId = ''
          } else {
            lastTapTime = now
            lastTapId = label.id
          }
        }
        draggingLabel = null
      }}
    >{label.text || '…'}{#if ui.selectedSceneLabel === label.id}<!-- svelte-ignore a11y_no_static_element_interactions --><span
          class="label-resize-handle"
          onpointerdown={(e: PointerEvent) => {
            e.stopPropagation()
            resizingLabel = label.id
            resizeStartY = e.clientY
            resizeStartSize = label.size ?? 1
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onpointermove={(e: PointerEvent) => {
            if (resizingLabel !== label.id) return
            const dy = resizeStartY - e.clientY
            const newSize = Math.max(0.5, Math.min(4, resizeStartSize + dy / 50))
            sceneResizeLabel(label.id, newSize - (label.size ?? 1))
          }}
          onpointerup={() => { resizingLabel = null }}
        ></span>{/if}</span>
  {/if}
{/each}

<style>
  .scene-label {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: var(--font-data);
    color: rgba(30, 32, 40, 0.35);
    white-space: nowrap;
    cursor: grab;
    z-index: 1;
    padding: 2px 6px;
    border-radius: 3px;
    user-select: none;
    transition: color 80ms, background 80ms;
  }
  .scene-label:hover {
    color: rgba(30, 32, 40, 0.6);
    background: rgba(30, 32, 40, 0.04);
  }
  .scene-label.selected {
    color: rgba(30, 32, 40, 0.7);
    background: rgba(30, 32, 40, 0.06);
    outline: 1px solid rgba(30, 32, 40, 0.15);
  }
  .label-resize-handle {
    position: absolute;
    right: -5px;
    top: -5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(30, 32, 40, 0.3);
    cursor: ns-resize;
    touch-action: none;
  }
  .label-resize-handle:hover {
    background: rgba(30, 32, 40, 0.6);
    transform: scale(1.3);
  }
  .scene-label-edit {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: var(--font-data);
    color: var(--color-fg);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.25);
    border-radius: 3px;
    padding: 2px 6px;
    width: 100px;
    text-align: center;
    outline: none;
    z-index: 8;
  }
</style>
