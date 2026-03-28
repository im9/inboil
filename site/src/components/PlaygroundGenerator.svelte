<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import { initTutorialPatterns } from './tutorialSetup.ts'
  import TuringSheet from '$app/lib/components/TuringSheet.svelte'
  import QuantizerSheet from '$app/lib/components/QuantizerSheet.svelte'
  import TonnetzSheet from '$app/lib/components/TonnetzSheet.svelte'
  import type { GenerativeEngine, TuringParams, QuantizerParams, TonnetzParams } from '$app/lib/types.ts'

  const { engine: engineType = 'turing' }: { engine?: GenerativeEngine } = $props()

  function defaultParams(e: GenerativeEngine): TuringParams | QuantizerParams | TonnetzParams {
    switch (e) {
      case 'turing': return { engine: 'turing', length: 8, lock: 0.5, range: [48, 72], mode: 'note' as const, density: 0.7 }
      case 'quantizer': return { engine: 'quantizer', scale: 'minor', root: 0, octaveRange: [3, 5] as [number, number] }
      case 'tonnetz': return { engine: 'tonnetz', startChord: [60, 64, 67] as [number, number, number], sequence: ['P', 'L', 'R'], voicing: 'close' as const }
    }
  }

  // Initialize: tutorial patterns + generator scene
  initTutorialPatterns()

  const patId = song.patterns[0]?.id ?? 'pat_00'
  const genId = 'pg_gen'
  const patNodeId = 'pg_pat'

  if (engineType === 'quantizer') {
    // Chain: Turing → Quantizer → Pattern
    const tmId = 'pg_tm'
    song.scene.nodes = [
      { id: tmId, type: 'generative', x: 0.44, y: 0.42, root: false,
        generative: { engine: 'turing', mergeMode: 'replace', targetTrack: 0, params: defaultParams('turing') } },
      { id: genId, type: 'generative', x: 0.56, y: 0.42, root: false,
        generative: { engine: 'quantizer', mergeMode: 'replace', targetTrack: 0, params: defaultParams('quantizer') } },
      { id: patNodeId, type: 'pattern', patternId: patId, x: 0.50, y: 0.58, root: true },
    ]
    song.scene.edges = [
      { id: 'pg_e1', from: tmId, to: genId, order: 0 },
      { id: 'pg_e2', from: genId, to: patNodeId, order: 0 },
    ]
  } else {
    song.scene.nodes = [
      { id: patNodeId, type: 'pattern', patternId: patId, x: 0.58, y: 0.45, root: true },
      { id: genId, type: 'generative', x: 0.42, y: 0.45, root: false,
        generative: { engine: engineType, mergeMode: 'replace', targetTrack: 0, params: defaultParams(engineType) } },
    ]
    song.scene.edges = [
      { id: 'pg_e1', from: genId, to: patNodeId, order: 0 },
    ]
  }
  song.scene.labels = []
  song.scene.stamps = []

  // Point each sheet to its generator node
  if (engineType === 'turing') ui.turingNodeId = genId
  else if (engineType === 'quantizer') ui.quantizerNodeId = genId
  else if (engineType === 'tonnetz') ui.tonnetzNodeId = genId
</script>

<div class="transport-demo not-content">
  <div class="playground pg-generator">
    {#if engineType === 'turing'}
      <TuringSheet onclose={() => {}} />
    {:else if engineType === 'quantizer'}
      <QuantizerSheet onclose={() => {}} />
    {:else}
      <TonnetzSheet onclose={() => {}} />
    {/if}
  </div>
</div>

<style>
  .transport-demo {
    border-radius: 12px;
    overflow: hidden;
  }

  .pg-generator {
    height: 480px;
    border-radius: 12px;
  }

  /* Hide close button inside playground — sheets are always visible here */
  .pg-generator :global(.t-close),
  .pg-generator :global(.q-close),
  .pg-generator :global(.tonnetz-close) {
    display: none;
  }
</style>
