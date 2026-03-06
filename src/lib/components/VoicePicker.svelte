<script lang="ts">
  import type { VoiceId } from '../state.svelte.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'

  const {
    pos,
    currentVoiceId,
    onpick,
    onclose,
  }: {
    pos: { x: number; y: number }
    currentVoiceId: VoiceId
    onpick: (id: VoiceId) => void
    onclose: () => void
  } = $props()

  const CATEGORIES: { id: VoiceCategory; label: string }[] = [
    { id: 'drum', label: 'DRUM' },
    { id: 'bass', label: 'BASS' },
    { id: 'lead', label: 'LEAD' },
  ]

  let selectedCat = $state<VoiceCategory>(
    VOICE_LIST.find(v => v.id === currentVoiceId)?.category ?? 'drum'
  )

  const filtered = $derived(VOICE_LIST.filter(v => v.category === selectedCat))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker-backdrop" onpointerdown={e => { e.stopPropagation(); onclose() }}></div>

<div class="voice-picker" style="left:{pos.x}px;top:{pos.y}px">
  <!-- Category tabs -->
  <div class="cat-tabs">
    {#each CATEGORIES as cat}
      <button
        class="cat-tab"
        class:active={selectedCat === cat.id}
        onpointerdown={e => { e.stopPropagation(); selectedCat = cat.id }}
      >{cat.label}</button>
    {/each}
  </div>

  <!-- Voice items in radial layout -->
  <div class="voice-ring">
    {#each filtered as voice, i}
      {@const count = filtered.length}
      {@const angle = -Math.PI / 2 + (i - (count - 1) / 2) * (count <= 4 ? 0.8 : 0.6)}
      {@const radius = 52}
      {@const bx = Math.cos(angle) * radius}
      {@const by = Math.sin(angle) * radius}
      <button
        class="voice-item"
        class:current={voice.id === currentVoiceId}
        style="
          transform: translate({bx}px, {by}px);
          transition-delay: {i * 25}ms;
        "
        data-tip={voice.id} data-tip-ja={voice.id}
        onpointerdown={e => { e.stopPropagation(); onpick(voice.id) }}
      >
        {voice.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
  }

  .voice-picker {
    position: fixed;
    z-index: 200;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .cat-tabs {
    position: absolute;
    top: -56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    pointer-events: auto;
  }

  .cat-tab {
    padding: 3px 8px;
    border: 1px solid rgba(237,232,220,0.2);
    border-radius: 4px;
    background: rgba(30,32,40,0.8);
    color: rgba(237,232,220,0.5);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    transition: all 100ms;
  }
  .cat-tab.active {
    background: rgba(30,32,40,0.95);
    color: rgba(237,232,220,0.9);
    border-color: var(--color-olive);
  }

  .voice-ring {
    position: relative;
    width: 0;
    height: 0;
  }

  .voice-item {
    position: absolute;
    left: -20px;
    top: -14px;
    min-width: 40px;
    height: 28px;
    padding: 0 8px;
    border-radius: 14px;
    border: 1.5px solid rgba(237,232,220,0.2);
    background: rgba(30,32,40,0.85);
    color: rgba(237,232,220,0.8);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    animation: voice-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    white-space: nowrap;
  }
  .voice-item.current {
    border-color: var(--color-olive);
    color: var(--color-olive);
  }
  .voice-item:hover {
    background: rgba(30,32,40,0.95);
    color: white;
    transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) scale(1.1);
  }
  .voice-item:active {
    transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) scale(0.95);
  }

  @keyframes voice-pop {
    from { opacity: 0; scale: 0.3; }
    to   { opacity: 1; scale: 1; }
  }

  @media (pointer: coarse) {
    .voice-item { min-width: 48px; height: 32px; font-size: 11px; }
    .cat-tab { padding: 4px 10px; font-size: 10px; }
  }
</style>
