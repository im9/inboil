<script lang="ts">
  import { song, ui, primarySelectedNode } from '../state.svelte.ts'
  import { PAD_INSET } from '../constants.ts'
  import { decoratorLabel } from '../sceneGeometry.ts'

  // ── Pattern node with decorators ──
  const selectedPatNode = $derived.by(() => {
    const primary = primarySelectedNode()
    if (!primary || Object.keys(ui.selectedSceneNodes).length !== 1) return null
    const n = song.scene.nodes.find(n => n.id === primary)
    if (!n || n.type !== 'pattern') return null
    return (n.decorators && n.decorators.length > 0) ? n : null
  })
</script>

<!-- Decorator summary on pattern node (ADR 069: read-only, editing in DockPanel) -->
{#if selectedPatNode}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dec-popup" style="
    left: calc({PAD_INSET}px + {selectedPatNode.x} * (100% - {PAD_INSET * 2}px) + 42px);
    top: calc({PAD_INSET}px + {selectedPatNode.y} * (100% - {PAD_INSET * 2}px) + 18px);
  " onpointerdown={e => e.stopPropagation()}>
    <div class="dec-label-row">
      {#each selectedPatNode.decorators ?? [] as dec}
        <span class="dec-tag-ro">{decoratorLabel(dec)}</span>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* ── Decorator read-only popup (ADR 069) ── */
  .dec-popup {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 4px;
    padding: 3px 5px;
    z-index: 6;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
    animation: dec-popup-in 100ms ease-out;
    cursor: pointer;
  }
  @keyframes dec-popup-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .dec-label-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .dec-tag-ro {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.5);
    letter-spacing: 0.04em;
    background: rgba(30, 32, 40, 0.06);
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
  }

  @media (max-width: 639px) {
    .dec-popup { display: none; }
  }
</style>
