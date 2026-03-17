<script lang="ts">
  /**
   * Fatal error dialog (ADR 091).
   * Modal overlay for critical errors that need user acknowledgment.
   * Shows error code, bilingual message, optional action button, and copy-detail.
   */
  import { fatalError, dismissFatalError } from '../fatalError.svelte.ts'
  import { lang } from '../state.svelte.ts'
  import { showToast } from '../toast.svelte.ts'

  let copied = $state(false)

  function handleAction() {
    const action = fatalError.current?.action
    if (action === 'reload') {
      location.reload()
    } else if (action === 'export') {
      // Trigger JSON export via keyboard shortcut emulation
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }))
      dismissFatalError()
    }
  }

  function copyDetail() {
    if (!fatalError.current) return
    const err = fatalError.current
    const text = `Error: ${err.code}\n${err.en}\n${err.detail ?? '(no detail)'}`
    navigator.clipboard.writeText(text).then(() => {
      copied = true
      setTimeout(() => copied = false, 2000)
    }).catch(() => {
      showToast('Copy failed', 'warn')
    })
  }
</script>

{#if fatalError.current}
  {@const err = fatalError.current}
  {@const isJa = lang.value === 'ja'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="error-backdrop" onpointerdown={(e) => { if (e.target === e.currentTarget) dismissFatalError() }}>
    <div class="error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="err-title">
      <div class="error-header">
        <span class="error-icon">⚠</span>
        <code class="error-code" id="err-title">{err.code}</code>
      </div>
      <p class="error-message">{isJa ? err.ja : err.en}</p>
      {#if err.detail}
        <pre class="error-detail">{err.detail}</pre>
      {/if}
      <div class="error-actions">
        {#if err.action === 'reload'}
          <button class="btn-action" onclick={handleAction}>Reload</button>
        {:else if err.action === 'export'}
          <button class="btn-action" onclick={handleAction}>Export & Close</button>
        {/if}
        <button class="btn-copy" onclick={copyDetail}>{copied ? 'Copied' : 'Copy'}</button>
        <button class="btn-dismiss" onclick={dismissFatalError}>Dismiss</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .error-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .error-dialog {
    background: #1a1210;
    border: 1px solid var(--color-salmon, #E8A090);
    border-radius: 8px;
    max-width: 440px;
    width: 100%;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    font-family: var(--font-data, monospace);
  }
  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .error-icon {
    font-size: 18px;
    color: var(--color-salmon, #E8A090);
  }
  .error-code {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-salmon, #E8A090);
    letter-spacing: 0.05em;
  }
  .error-message {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(237, 232, 220, 0.85);
    margin: 0 0 12px;
  }
  .error-detail {
    font-size: 10px;
    line-height: 1.4;
    color: rgba(237, 232, 220, 0.4);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(237, 232, 220, 0.08);
    border-radius: 4px;
    padding: 8px;
    margin: 0 0 12px;
    max-height: 120px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .error-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .btn-action {
    font-size: 11px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--color-salmon, #E8A090);
    background: var(--color-salmon, #E8A090);
    color: #1a1210;
    cursor: pointer;
  }
  .btn-action:hover {
    filter: brightness(1.1);
  }
  .btn-copy {
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid rgba(237, 232, 220, 0.2);
    background: transparent;
    color: rgba(237, 232, 220, 0.6);
    cursor: pointer;
  }
  .btn-copy:hover {
    background: rgba(237, 232, 220, 0.06);
    color: rgba(237, 232, 220, 0.85);
  }
  .btn-dismiss {
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid rgba(237, 232, 220, 0.15);
    background: transparent;
    color: rgba(237, 232, 220, 0.4);
    cursor: pointer;
  }
  .btn-dismiss:hover {
    color: rgba(237, 232, 220, 0.7);
  }
</style>
