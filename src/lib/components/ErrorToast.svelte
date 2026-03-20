<script lang="ts">
  import { toasts, dismissToast } from '../toast.svelte.ts'
  import { fly } from 'svelte/transition'
</script>

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div
        class="toast toast-{toast.type}"
        transition:fly={{ y: 20, duration: 200 }}
      >
        <span class="toast-icon">
          {#if toast.type === 'error'}✕
          {:else if toast.type === 'warn'}⚠
          {:else}ℹ
          {/if}
        </span>
        <span class="toast-msg">{toast.message}</span>
        <button class="toast-close" onclick={() => dismissToast(toast.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: min(420px, calc(100vw - 32px));
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-family: var(--font-data, monospace);
    font-size: 12px;
    line-height: 1.4;
    pointer-events: auto;
    box-shadow: 0 4px 16px rgba(30,32,40,0.35);
  }
  .toast-error {
    background: rgba(248,113,113,0.15);
    border: 1px solid var(--color-salmon, #E8A090);
    color: var(--color-salmon, #E8A090);
  }
  .toast-warn {
    background: rgba(120,120,69,0.15);
    border: 1px solid var(--color-olive);
    color: var(--color-olive);
  }
  .toast-info {
    background: rgba(68,114,180,0.13);
    border: 1px solid var(--color-blue, #4472B4);
    color: var(--color-blue, #4472B4);
  }
  .toast-icon {
    flex-shrink: 0;
    font-size: 14px;
  }
  .toast-msg {
    flex: 1;
  }
  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: inherit;
    font-size: 16px;
    cursor: pointer;
    opacity: 0.6;
    padding: 0 2px;
  }
  .toast-close:hover { opacity: 1; }
</style>
