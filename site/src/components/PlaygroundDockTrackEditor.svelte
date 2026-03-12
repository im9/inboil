<script lang="ts">
  import '../styles/playground.css'
  import { ui } from '$app/lib/state.svelte.ts'
  import DockTrackEditor from '$app/lib/components/DockTrackEditor.svelte'

  ui.selectedTrack = 0
</script>

<div class="playground dark-zone" style="min-height: 200px;">
  <DockTrackEditor />
</div>
