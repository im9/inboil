<script lang="ts">
  import '../styles/playground.css'
  import { song } from '$app/lib/state.svelte.ts'
  import DockDecoratorEditor from '$app/lib/components/DockDecoratorEditor.svelte'

  if (song.scene.nodes.length === 0) {
    song.scene.nodes = [
      { id: 'demo-n1', type: 'pattern', patternId: song.patterns[0]?.id ?? 'pat_00', x: 150, y: 100, decorators: [] },
    ]
  }
  const node = song.scene.nodes[0]
  if (node.decorators.length === 0) {
    node.decorators = [
      { type: 'transpose', params: { mode: 0, semitones: 3 } },
      { type: 'tempo', params: { bpm: 140 } },
      { type: 'repeat', params: { count: 2 } },
    ]
  }
</script>

<div class="playground dark-zone" style="padding: 8px 12px;">
  <DockDecoratorEditor {node} />
</div>
