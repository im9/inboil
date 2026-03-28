<script lang="ts">
  import type { QuantizerParams, QuantizerChord, HarmonyVoice } from '../types.ts'
  import { song, ui, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, autoGenerateFromNode } from '../sceneActions.ts'
  import { SCALE_MAP, SCALE_NAMES } from '../generative.ts'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const { onclose }: { onclose: () => void } = $props()

  const nodeId = $derived(ui.quantizerNodeId)
  const node = $derived(nodeId ? song.scene.nodes.find(n => n.id === nodeId) : null)
  const params = $derived(node?.generative?.params as QuantizerParams | undefined)
  const mode = $derived(params?.mode ?? 'scale')

  // Build scale pitch classes for keyboard display
  const scaleIntervals = $derived(SCALE_MAP[params?.scale ?? 'major'] ?? SCALE_MAP.major)
  const scalePcs = $derived(new Set(scaleIntervals.map(i => ((i + (params?.root ?? 0)) % 12))))

  // Active chord PCs (chord mode)
  const chordPcs = $derived.by(() => {
    if (mode !== 'chord' || !params?.chords?.length) return new Set<number>()
    return new Set(params.chords[0].notes.map(n => ((n % 12) + 12) % 12))
  })

  // Tonnetz node names for chordSource selector
  const tonnetzNodes = $derived(
    song.scene.nodes.filter(n => n.generative?.engine === 'tonnetz')
  )

  function update(patch: Partial<QuantizerParams>) {
    if (!nodeId) return
    pushUndo('Update quantizer')
    sceneUpdateGenerativeParams(nodeId, patch)
    autoGenerateFromNode(nodeId)
  }

  // ── Keyboard rendering ──
  const KBD_OCT_LO = 3
  const KBD_OCT_HI = 5
  const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]
  const BLACK_KEYS = [1, 3, 6, 8, 10]
  const BLACK_KEY_OFFSETS: Record<number, number> = { 1: 0.6, 3: 1.7, 6: 3.65, 8: 4.7, 10: 5.75 }

  const WK_W = 28
  const WK_H = 100
  const BK_W = 18
  const BK_H = 60

  interface KeyInfo { pc: number; midi: number; x: number; w: number; h: number; isBlack: boolean }

  const keyboardKeys = $derived.by(() => {
    const keys: KeyInfo[] = []
    for (let oct = KBD_OCT_LO; oct <= KBD_OCT_HI; oct++) {
      const octOffset = (oct - KBD_OCT_LO) * 7 * WK_W
      for (let wi = 0; wi < WHITE_KEYS.length; wi++) {
        const pc = WHITE_KEYS[wi]
        keys.push({ pc, midi: oct * 12 + pc, x: octOffset + wi * WK_W, w: WK_W, h: WK_H, isBlack: false })
      }
      for (const pc of BLACK_KEYS) {
        const x = octOffset + BLACK_KEY_OFFSETS[pc] * WK_W
        keys.push({ pc, midi: oct * 12 + pc, x, w: BK_W, h: BK_H, isBlack: true })
      }
    }
    return keys
  })

  const kbdWidth = $derived((KBD_OCT_HI - KBD_OCT_LO + 1) * 7 * WK_W)

  function keyFill(key: KeyInfo): string {
    const inChord = chordPcs.has(key.pc)
    const inScale = scalePcs.has(key.pc)
    if (mode === 'chord' && inChord) return 'var(--color-olive)'
    if (inScale) return key.isBlack ? 'rgba(30, 32, 40, 0.7)' : 'rgba(138, 148, 50, 0.18)'
    return key.isBlack ? 'rgba(30, 32, 40, 0.85)' : 'rgba(237, 232, 220, 0.6)'
  }

  function keyStroke(key: KeyInfo): string {
    if (mode === 'chord' && chordPcs.has(key.pc)) return 'var(--color-olive)'
    return 'rgba(30, 32, 40, 0.25)'
  }

  // ── Chord editor helpers ──
  function chordName(notes: number[]): string {
    if (notes.length < 3) return notes.map(n => NOTE_NAMES[((n % 12) + 12) % 12]).join('-')
    const pcs = notes.map(n => ((n % 12) + 12) % 12)
    for (const root of pcs) {
      const ints = pcs.map(p => ((p - root) % 12 + 12) % 12).sort((a, b) => a - b)
      if (ints.length >= 3 && ints[1] === 4 && ints[2] === 7) {
        const label = NOTE_NAMES[root]
        return ints.length >= 4 && (ints[3] === 11) ? label + 'maj7' : ints.length >= 4 && (ints[3] === 10) ? label + '7' : label
      }
      if (ints.length >= 3 && ints[1] === 3 && ints[2] === 7) {
        const label = NOTE_NAMES[root] + 'm'
        return ints.length >= 4 && (ints[3] === 10) ? label + '7' : label
      }
    }
    return pcs.map(p => NOTE_NAMES[p]).join('-')
  }

  function addChord() {
    if (!params) return
    const existing = params.chords ?? []
    const lastStep = existing.length > 0 ? existing[existing.length - 1].step + 16 : 0
    const newChord: QuantizerChord = { step: lastStep, notes: [0, 4, 7] }
    update({ chords: [...existing, newChord] })
  }

  function removeChord(idx: number) {
    if (!params?.chords) return
    const chords = params.chords.filter((_, i) => i !== idx)
    update({ chords })
  }

  function cycleChordRoot(idx: number, delta: number) {
    if (!params?.chords) return
    const chord = params.chords[idx]
    const notes = chord.notes.map(n => ((n + delta) % 12 + 12) % 12)
    const chords = params.chords.map((c, i) => i === idx ? { ...c, notes } : c)
    update({ chords })
  }

  // ── Harmony voice helpers ──
  function addHarmonyVoice() {
    if (!params) return
    const existing = params.harmonyVoices ?? []
    if (existing.length >= 3) return
    const newVoice: HarmonyVoice = { interval: 3, direction: 'above' }
    update({ harmonyVoices: [...existing, newVoice] })
  }

  function removeHarmonyVoice(idx: number) {
    if (!params?.harmonyVoices) return
    const voices = params.harmonyVoices.filter((_, i) => i !== idx)
    update({ harmonyVoices: voices })
  }

  function updateHarmonyVoice(idx: number, patch: Partial<HarmonyVoice>) {
    if (!params?.harmonyVoices) return
    const voices = params.harmonyVoices.map((v, i) => i === idx ? { ...v, ...patch } : v)
    update({ harmonyVoices: voices })
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.code === 'Escape') { e.preventDefault(); onclose() }
  }
</script>

<svelte:window {onkeydown} />

{#if params && nodeId}
<div class="quantizer-sheet">
  <!-- Header (matches Tonnetz) -->
  <div class="q-header">
    <span class="q-title">QUANTIZER</span>
    <span class="q-info">{NOTE_NAMES[params.root]} {params.scale}</span>
    <button class="q-close" onpointerdown={onclose}>×</button>
  </div>

  <!-- Controls -->
  <div class="q-controls">
    <!-- Mode selector -->
    <div class="q-row">
      <span class="ctl-label">MODE</span>
      <div class="mode-pills">
        {#each ['scale', 'chord', 'harmony'] as m}
          <button
            class="mode-pill"
            class:active={mode === m}
            onpointerdown={() => update({ mode: m as QuantizerParams['mode'] })}
          >{m.toUpperCase()}</button>
        {/each}
      </div>
    </div>

    <!-- Scale + Root -->
    <div class="q-row">
      <span class="ctl-label">SCALE</span>
      <select class="ctl-select"
        value={params.scale}
        onchange={e => update({ scale: (e.target as HTMLSelectElement).value })}
      >
        {#each SCALE_NAMES as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
      <span class="ctl-label">ROOT</span>
      <select class="ctl-select"
        value={String(params.root)}
        onchange={e => update({ root: parseInt((e.target as HTMLSelectElement).value) })}
      >
        {#each NOTE_NAMES as name, i}
          <option value={i}>{name}</option>
        {/each}
      </select>
      <span class="ctl-label">OCT</span>
      <span class="ctl-val">{params.octaveRange[0]}–{params.octaveRange[1]}</span>
    </div>

    <!-- Mode-specific controls -->
    {#if mode === 'chord'}
      {#if params.chordSource}
        <div class="q-row">
          <span class="ctl-label">SOURCE</span>
          <select class="ctl-select"
            value={params.chordSource.nodeId}
            onchange={e => {
              const val = (e.target as HTMLSelectElement).value
              if (val === '__none__') update({ chordSource: undefined })
              else update({ chordSource: { nodeId: val } })
            }}
          >
            <option value="__auto__">Auto (first Tonnetz)</option>
            {#each tonnetzNodes as tn}
              <option value={tn.id}>{tn.id}</option>
            {/each}
            <option value="__none__">Manual chords</option>
          </select>
        </div>
      {:else}
        <div class="q-row">
          <span class="ctl-label">CHORDS</span>
          <div class="chord-pills">
            {#each params.chords ?? [] as chord, idx}
              <div class="chord-badge">
                <span class="chord-badge-name">{chordName(chord.notes)}</span>
                <span class="chord-badge-step">@{chord.step}</span>
                <button class="badge-btn" onpointerdown={() => cycleChordRoot(idx, -1)}>−</button>
                <button class="badge-btn" onpointerdown={() => cycleChordRoot(idx, 1)}>+</button>
                <button class="badge-btn badge-rm" onpointerdown={() => removeChord(idx)}>×</button>
              </div>
            {/each}
            <button class="pill-btn" onpointerdown={addChord}>+</button>
          </div>
        </div>
        <div class="q-row">
          <span class="ctl-label"></span>
          <button class="pill-btn" style="width: auto; padding: 2px 8px"
            onpointerdown={() => update({ chordSource: { nodeId: '__auto__' } })}
          >Use Tonnetz</button>
        </div>
      {/if}
    {:else if mode === 'harmony'}
      <div class="q-row">
        <span class="ctl-label">VOICES</span>
        <div class="chord-pills">
          {#each params.harmonyVoices ?? [] as voice, idx}
            <div class="chord-badge">
              <select class="badge-select"
                value={voice.interval}
                onchange={e => updateHarmonyVoice(idx, { interval: parseInt((e.target as HTMLSelectElement).value) })}
              >
                {#each [3, 4, 5, 6] as iv}
                  <option value={iv}>{iv === 3 ? '3rd' : iv === 4 ? '4th' : iv === 5 ? '5th' : '6th'}</option>
                {/each}
              </select>
              <select class="badge-select"
                value={voice.direction}
                onchange={e => updateHarmonyVoice(idx, { direction: (e.target as HTMLSelectElement).value as HarmonyVoice['direction'] })}
              >
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
              <button class="badge-btn badge-rm" onpointerdown={() => removeHarmonyVoice(idx)}>×</button>
            </div>
          {/each}
          {#if (params.harmonyVoices?.length ?? 0) < 3}
            <button class="pill-btn" onpointerdown={addHarmonyVoice}>+</button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="q-row hint">
        <span>Notes are snapped to the nearest scale degree</span>
      </div>
    {/if}
  </div>

  <!-- Keyboard visualization (centered like Tonnetz lattice) -->
  <div class="q-keyboard">
    <svg width={kbdWidth} height={WK_H + 4} viewBox="0 0 {kbdWidth} {WK_H + 4}">
      <!-- White keys -->
      {#each keyboardKeys.filter(k => !k.isBlack) as key}
        <rect
          x={key.x + 1} y={2} width={key.w - 2} height={key.h}
          rx="3"
          fill={keyFill(key)}
          stroke={keyStroke(key)}
          stroke-width="1"
        />
        {#if scalePcs.has(key.pc)}
          <circle
            cx={key.x + key.w / 2} cy={key.h - 12} r="4"
            fill={chordPcs.has(key.pc) ? 'var(--color-olive)' : 'var(--color-fg)'}
            opacity={chordPcs.has(key.pc) ? 1 : 0.35}
          />
        {/if}
        <text
          x={key.x + key.w / 2} y={key.h - 24}
          text-anchor="middle"
          class="key-label"
        >{NOTE_NAMES[key.pc]}</text>
      {/each}
      <!-- Black keys -->
      {#each keyboardKeys.filter(k => k.isBlack) as key}
        <rect
          x={key.x + 1} y={2} width={key.w - 2} height={key.h}
          rx="3"
          fill={keyFill(key)}
          stroke={keyStroke(key)}
          stroke-width="1"
        />
        {#if scalePcs.has(key.pc)}
          <circle
            cx={key.x + key.w / 2} cy={key.h - 10} r="3"
            fill={chordPcs.has(key.pc) ? 'var(--color-olive)' : 'rgba(237, 232, 220, 0.7)'}
          />
        {/if}
      {/each}
    </svg>
  </div>
</div>
{/if}

<style>
  .quantizer-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
  }

  /* ── Header (matches tonnetz-header) ── */
  .q-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--lz-border);
  }
  .q-title {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .q-info {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    color: var(--color-olive);
  }
  .q-close {
    width: 24px; height: 24px;
    border: 1px solid var(--color-fg);
    background: transparent; color: inherit;
    font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    margin-left: auto;
  }

  /* ── Controls (matches tonnetz-controls) ── */
  .q-controls {
    padding: 8px 12px;
    border-bottom: 1px solid var(--lz-border);
    display: flex; flex-direction: column; gap: 6px;
  }
  .q-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .q-row.hint {
    opacity: 0.4;
    font-family: var(--font-data);
    font-size: 8px;
  }
  .ctl-label {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    letter-spacing: 0.06em; opacity: 0.6;
    min-width: 36px;
  }
  .ctl-select {
    font-family: var(--font-data); font-size: var(--fs-lg);
    padding: 2px 4px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
  }
  .ctl-val {
    font-family: var(--font-data); font-size: var(--fs-lg);
    font-weight: 700;
  }

  /* Mode pills (like seq-pills in Tonnetz) */
  .mode-pills {
    display: flex; gap: 3px;
  }
  .mode-pill {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    padding: 2px 8px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    cursor: pointer; opacity: 0.5;
  }
  .mode-pill.active {
    border-color: var(--color-olive);
    color: var(--color-olive);
    opacity: 1;
  }

  /* Chord badges (like anchor-badge in Tonnetz) */
  .chord-pills {
    display: flex; gap: 4px; flex-wrap: wrap; align-items: center;
  }
  .chord-badge {
    font-family: var(--font-data); font-size: var(--fs-md);
    padding: 1px 6px;
    border: 1px solid var(--color-olive);
    color: var(--color-olive);
    display: flex; align-items: center; gap: 4px;
  }
  .chord-badge-name { font-weight: 700; }
  .chord-badge-step { opacity: 0.6; }
  .badge-btn {
    background: none; border: none; color: inherit;
    font-size: 10px; cursor: pointer; padding: 0; line-height: 1;
  }
  .badge-rm { opacity: 0.5; }
  .badge-rm:hover { opacity: 1; }
  .badge-select {
    font-family: var(--font-data); font-size: var(--fs-md);
    background: transparent; border: none; color: inherit;
    padding: 0; cursor: pointer;
  }
  .pill-btn {
    width: 20px; height: 20px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    font-size: var(--fs-lg); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .pill-btn:hover { background: var(--lz-bg-hover); }

  /* ── Keyboard (matches tonnetz-lattice) ── */
  .q-keyboard {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    touch-action: none;
  }
  .key-label {
    font-family: var(--font-data);
    font-size: 9px; font-weight: 700;
    fill: var(--color-fg);
    text-anchor: middle;
    pointer-events: none; user-select: none;
    opacity: 0.4;
  }
</style>
