<script lang="ts">
  import PlaygroundTransport from './PlaygroundTransport.svelte'
  import FxPad from '$app/lib/components/FxPad.svelte'
  import { ui } from '$app/lib/state.svelte.ts'

  ui.phraseView = 'fx'
</script>

<PlaygroundTransport height={320} view="fx">
  <FxPad />
</PlaygroundTransport>
