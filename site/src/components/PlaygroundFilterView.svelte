<script lang="ts">
  import PlaygroundTransport from './PlaygroundTransport.svelte'
  import FilterView from '$app/lib/components/FilterView.svelte'
</script>

<PlaygroundTransport height={280} view="eq">
  <FilterView />
</PlaygroundTransport>
