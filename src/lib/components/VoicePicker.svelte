<script lang="ts">
  /**
   * Shared voice picker — category tabs + voice list dropdown.
   * Used by DockTrackEditor (desktop) and MobileParamOverlay.
   */
  import type { VoiceId } from '../types.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import { changeVoice } from '../stepActions.ts'

  const CATEGORIES: { id: VoiceCategory; label: string }[] = [
    { id: 'drum', label: 'DRUM' },
    { id: 'synth', label: 'SYNTH' },
    { id: 'sampler', label: 'SMPL' },
  ]

  interface Props {
    voiceId: VoiceId | null
    trackId: number
    variant?: 'dock' | 'mobile'
    onselect?: () => void
  }
  const { voiceId, trackId, variant = 'dock', onselect }: Props = $props()

  let voiceOpen = $state(false)
  $effect(() => { void trackId; voiceOpen = false })

  const currentCat = $derived(voiceId ? (VOICE_LIST.find(v => v.id === voiceId)?.category ?? 'drum') : 'drum')
  const voicesInCat = $derived(VOICE_LIST.filter(v => v.category === currentCat))
  const currentVoiceMeta = $derived(voiceId ? VOICE_LIST.find(v => v.id === voiceId) : null)

  export function close() { voiceOpen = false }

  function selectCategory(cat: VoiceCategory) {
    const first = VOICE_LIST.find(v => v.category === cat)!
    changeVoice(trackId, first.id as VoiceId)
    if (VOICE_LIST.filter(v => v.category === cat).length === 1) {
      voiceOpen = false
      onselect?.()
    }
  }

  function selectVoice(id: VoiceId) {
    changeVoice(trackId, id)
    voiceOpen = false
    onselect?.()
  }
</script>

<div class="voice-picker-wrap" class:mobile={variant === 'mobile'}>
  <button class="voice-current" onpointerdown={() => { voiceOpen = !voiceOpen; if (voiceOpen) onselect?.() }}
    data-tip="Change instrument" data-tip-ja="楽器を変更">
    <span class="voice-current-name">{currentVoiceMeta?.fullName ?? voiceId}</span>
    <span class="voice-current-arrow">{voiceOpen ? '▾' : '▸'}</span>
  </button>
  {#if voiceOpen}
    <div class="voice-dropdown">
      <div class="picker-cats">
        {#each CATEGORIES as cat}
          <button
            class="cat-btn"
            class:active={currentCat === cat.id}
            onpointerdown={() => selectCategory(cat.id)}
            data-tip={cat.label} data-tip-ja={cat.label}
          >{cat.label}</button>
        {/each}
      </div>
      <div class="picker-list">
        {#each voicesInCat as v}
          <button
            class="picker-item"
            class:selected={voiceId === v.id}
            onpointerdown={() => selectVoice(v.id)}
            data-tip={v.id} data-tip-ja={v.id}
          ><span class="picker-tag">{v.label}</span><span class="picker-name">{v.fullName}</span></button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .voice-picker-wrap {
    position: relative;
    z-index: 5;
  }
  .voice-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-fg);
    border: 1px solid var(--dz-border);
    border-top: none;
    box-shadow: 0 4px 12px var(--lz-text-hint);
  }
  /* Mobile: inline dropdown instead of absolute */
  .mobile .voice-dropdown {
    position: static;
    border: none;
    box-shadow: none;
  }
  .voice-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-strong);
    font-size: var(--fs-base);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 12px;
    cursor: pointer;
    margin-bottom: 6px;
    transition: border-color 80ms;
  }
  .voice-current:hover {
    border-color: var(--dz-border-strong);
  }
  .mobile .voice-current {
    padding: 8px 10px;
    cursor: default;
    transition: none;
  }
  .mobile .voice-current:hover {
    border-color: var(--dz-border);
  }
  .voice-current-name {
    text-transform: uppercase;
  }
  .voice-current-arrow {
    font-size: var(--fs-md);
    opacity: 0.4;
  }
  .mobile .voice-current-arrow {
    font-size: var(--fs-sm);
  }
  .picker-cats {
    display: flex;
    gap: 2px;
    padding: 4px;
    flex-wrap: wrap;
  }
  .mobile .picker-cats {
    padding: 0;
    margin-bottom: 4px;
  }
  .cat-btn {
    flex: 1;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-dim);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 7px 6px;
    cursor: pointer;
  }
  .mobile .cat-btn {
    color: var(--dz-transport-border);
    font-size: var(--fs-md);
    padding: 7px 5px;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-list {
    max-height: 200px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .mobile .picker-list {
    margin-bottom: 8px;
    border: 1px solid var(--dz-divider);
  }
  .picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dz-divider);
    background: transparent;
    color: var(--dz-text);
    font-size: var(--fs-base);
    padding: 7px 8px;
    text-align: left;
    cursor: pointer;
  }
  .picker-item:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-bright);
  }
  .mobile .picker-item {
    padding: 8px;
  }
  .mobile .picker-item:hover {
    background: transparent;
    color: var(--dz-text);
  }
  .picker-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-item.selected {
    background: var(--olive-bg);
    color: var(--dz-text-bright);
  }
  .picker-item.selected .picker-tag {
    color: var(--color-olive);
  }
  .picker-tag {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dz-text-dim);
    min-width: 32px;
    flex-shrink: 0;
  }
  .mobile .picker-tag {
    font-size: var(--fs-sm);
  }
  .picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
