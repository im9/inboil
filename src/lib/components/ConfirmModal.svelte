<script lang="ts">
  /**
   * In-app confirm dialog — replaces browser confirm().
   * Usage: <ConfirmModal bind:this={ref} /> then ref.ask("message", onConfirm)
   */
  import { fade, fly } from 'svelte/transition'

  let open = $state(false)
  let message = $state('')
  let callback = $state<(() => void) | null>(null)

  export function ask(msg: string, onConfirm: () => void) {
    message = msg
    callback = onConfirm
    open = true
  }

  function confirm() {
    open = false
    callback?.()
    callback = null
  }

  function cancel() {
    open = false
    callback = null
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="confirm-backdrop" transition:fade={{ duration: 100 }} onpointerdown={cancel}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="confirm-card" transition:fly={{ y: 8, duration: 100 }} onpointerdown={e => e.stopPropagation()}>
      <p class="confirm-msg">{message}</p>
      <div class="confirm-actions">
        <button class="btn-cancel" onpointerdown={cancel}>CANCEL</button>
        <button class="btn-confirm" onpointerdown={confirm}>OK</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .confirm-card {
    background: var(--color-fg);
    border: 1px solid var(--dz-border);
    padding: 16px;
    min-width: 240px;
    max-width: 320px;
  }
  .confirm-msg {
    font-size: var(--fs-base);
    color: var(--dz-text-strong);
    margin: 0 0 16px;
    line-height: 1.4;
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .btn-cancel,
  .btn-confirm {
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 16px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-mid);
    cursor: pointer;
  }
  .btn-cancel:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .btn-confirm {
    border-color: var(--danger-border);
    color: var(--color-danger);
  }
  .btn-confirm:hover {
    background: var(--danger-bg-hover);
  }
</style>
