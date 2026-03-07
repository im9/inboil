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

  const currentCat = VOICE_LIST.find(v => v.id === currentVoiceId)?.category ?? 'drum'
  let selectedCat = $state<VoiceCategory | null>(null)

  const filtered = $derived(selectedCat ? VOICE_LIST.filter(v => v.category === selectedCat) : [])

  function selectCategory(e: PointerEvent, cat: VoiceCategory) {
    e.stopPropagation()
    selectedCat = cat
  }

  function goBack(e: PointerEvent) {
    e.stopPropagation()
    selectedCat = null
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker-backdrop" onpointerdown={e => { e.stopPropagation(); onclose() }}></div>

<div class="voice-picker" style="left:{pos.x}px;top:{pos.y}px">
  {#if selectedCat === null}
    <!-- Level 1: Category bubbles -->
    <div class="voice-ring">
      {#each CATEGORIES as cat, i}
        {@const count = CATEGORIES.length}
        {@const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.8}
        {@const radius = 52}
        {@const bx = Math.cos(angle) * radius}
        {@const by = Math.sin(angle) * radius}
        <button
          class="voice-item cat-bubble"
          class:home={cat.id === currentCat}
          style="
            transform: translate({bx}px, {by}px);
            transition-delay: {i * 25}ms;
          "
          onpointerdown={e => selectCategory(e, cat.id)}
        >
          {cat.label}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Level 2: Voice bubbles within category -->
    <div class="voice-ring">
      <!-- Back button at center -->
      <button
        class="back-btn"
        onpointerdown={goBack}
        data-tip="Back to categories" data-tip-ja="カテゴリに戻る"
      >&larr;</button>
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
  {/if}
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
  .voice-item.home {
    border-color: var(--color-olive);
    color: var(--color-olive);
  }
  .voice-item.cat-bubble {
    min-width: 48px;
    height: 32px;
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  .voice-item:hover {
    background: rgba(30,32,40,0.95);
    color: white;
    transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) scale(1.1);
  }
  .voice-item:active {
    transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) scale(0.95);
  }

  .back-btn {
    position: absolute;
    left: -12px;
    top: -12px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid rgba(237,232,220,0.2);
    background: rgba(30,32,40,0.85);
    color: rgba(237,232,220,0.6);
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: voice-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .back-btn:hover {
    background: rgba(30,32,40,0.95);
    color: white;
    border-color: rgba(237,232,220,0.4);
  }

  @keyframes voice-pop {
    from { opacity: 0; scale: 0.3; }
    to   { opacity: 1; scale: 1; }
  }

  @media (pointer: coarse) {
    .voice-item { min-width: 48px; height: 32px; font-size: 11px; }
    .voice-item.cat-bubble { min-width: 56px; height: 36px; font-size: 12px; }
    .back-btn { width: 32px; height: 32px; font-size: 14px; }
  }
</style>
