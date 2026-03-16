<script lang="ts">
  import { onMount } from 'svelte'
  import { ui, lang, prefs, toggleLang, factoryReset } from '../state.svelte.ts'
  import SidebarHelp from './SidebarHelp.svelte'
  import SidebarProject from './SidebarProject.svelte'
  import SidebarSettings from './SidebarSettings.svelte'

  const mode = $derived(ui.sidebar)
  const L = $derived(lang.value)

  // ── Open/close animation ──
  let closing = $state(false)
  let visibleMode = $state<'help' | 'system' | null>(null)
  $effect(() => {
    if (mode) {
      closing = false
      visibleMode = mode
    } else if (visibleMode) {
      closing = true
    }
  })

  function onAnimEnd() {
    if (closing) {
      closing = false
      visibleMode = null
    }
  }

  let confirmReset = $state(false)

  function handleReset() {
    factoryReset()
    confirmReset = false
  }

  // ── Hover guide ──
  let guideText = $state('')

  onMount(() => {
    function onOver(e: Event) {
      const el = (e.target as Element)?.closest?.('[data-tip]')
      if (!el) { guideText = ''; return }
      const tip = L === 'ja'
        ? (el.getAttribute('data-tip-ja') || el.getAttribute('data-tip'))
        : el.getAttribute('data-tip')
      guideText = tip || ''
    }
    document.addEventListener('mouseover', onOver)
    return () => document.removeEventListener('mouseover', onOver)
  })
</script>

{#if visibleMode}
  <div class="sidebar" class:closing onanimationend={onAnimEnd}>
    <div class="sidebar-head">
      <span class="sidebar-title">{visibleMode === 'help' ? 'HELP' : 'SYSTEM'}</span>
      <div class="sidebar-head-right">
        {#if visibleMode === 'help'}
          <button class="btn-lang" onpointerdown={toggleLang}>
            {L === 'ja' ? 'EN' : 'JP'}
          </button>
        {/if}
        <button class="btn-close" onpointerdown={() => { ui.sidebar = null }}>&times;</button>
      </div>
    </div>
    {#if visibleMode === 'system'}
      <div class="system-tabs">
        <button class="system-tab" class:active={ui.systemTab === 'project'} onpointerdown={() => { ui.systemTab = 'project' }}>PROJECT</button>
        <button class="system-tab" class:active={ui.systemTab === 'settings'} onpointerdown={() => { ui.systemTab = 'settings' }}>SETTINGS</button>
      </div>
    {/if}

      <div class="sidebar-body">
        {#if visibleMode === 'help'}
          <SidebarHelp />
        {:else}
          {#if ui.systemTab === 'project'}
            <SidebarProject />
          {:else}
            <SidebarSettings />
          {/if}
        {/if}
      </div>

    {#if visibleMode === 'system' && ui.systemTab === 'settings'}
      <div class="sidebar-footer">
        <a
          class="donate-link-app"
          href="https://ko-fi.com/inboil"
          target="_blank"
          rel="noopener"
        >&#9825; {L === 'ja' ? 'このプロジェクトを応援' : 'SUPPORT THIS PROJECT'}</a>
        <a
          class="footer-link"
          href="https://github.com/im9"
          target="_blank"
          rel="noopener"
        >GitHub</a>
        <span class="setting-label">{L === 'ja' ? 'リセット' : 'RESET'}</span>
        {#if confirmReset}
          <p class="reset-warn">{L === 'ja'
            ? 'すべてのパターン・設定が初期化されます。'
            : 'All patterns and settings will be reset.'}</p>
          <div class="reset-actions">
            <button class="btn-reset-confirm" onpointerdown={handleReset}>
              OK
            </button>
            <button class="btn-reset-cancel" onpointerdown={() => { confirmReset = false }}>
              CANCEL
            </button>
          </div>
        {:else}
          <button class="btn-reset" onpointerdown={() => { confirmReset = true }}>
            FACTORY RESET
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if guideText && prefs.showGuide}
  <div class="guide-float" class:shifted={!!visibleMode}>
    <span class="guide-label">GUIDE</span>
    <p class="guide-text">{guideText}</p>
  </div>
{/if}

<style>
  .sidebar {
    position: fixed;
    right: 0;
    bottom: 0;
    top: 104px;
    width: 280px;
    z-index: 110;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 16px rgba(0,0,0,0.3);
    overflow: hidden;
    animation: sidebar-in 50ms ease-out;
  }
  .sidebar.closing {
    animation: sidebar-out 50ms ease-in forwards;
  }
  @keyframes sidebar-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes sidebar-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(24px); }
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(237,232,220,0.1);
    flex-shrink: 0;
  }

  .sidebar-title {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
  }

  .sidebar-head-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-lang {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
  }
  .btn-lang:active {
    background: rgba(237,232,220,0.15);
  }

  .btn-close {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 16px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-close:active {
    background: rgba(237,232,220,0.15);
  }

  /* ── System tabs ── */
  .system-tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(237,232,220,0.1);
  }
  .system-tab {
    flex: 1;
    padding: 8px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: center;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(237,232,220,0.35);
    cursor: pointer;
    transition: color 40ms linear, border-color 40ms linear;
  }
  .system-tab:hover {
    color: rgba(237,232,220,0.55);
  }
  .system-tab.active {
    color: rgba(237,232,220,0.9);
    border-bottom-color: var(--color-olive);
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  /* ── Floating guide bar ── */
  :global(.guide-float) {
    position: fixed;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 480px;
    width: calc(100% - 32px);
    background: rgba(30,32,40,0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(237,232,220,0.1);
    border-radius: 6px;
    padding: 6px 12px;
    z-index: 120;
    display: flex;
    align-items: baseline;
    gap: 8px;
    animation: guide-in 80ms ease-out;
    pointer-events: none;
    transition: right 100ms;
  }
  :global(.guide-float.shifted) {
    /* no shift — guide is narrower than the gap and has higher z-index */
  }
  @keyframes guide-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  :global(.guide-float) .guide-label {
    font-size: 7px;
    letter-spacing: 0.1em;
    color: var(--color-olive);
    text-transform: uppercase;
    flex-shrink: 0;
  }
  :global(.guide-float) .guide-text {
    font-size: 10px;
    line-height: 1.4;
    color: rgba(237,232,220,0.7);
    margin: 0;
  }

  .sidebar-footer {
    flex-shrink: 0;
    padding: 12px 16px;
    border-top: 1px solid rgba(237,232,220,0.08);
    margin-top: auto;
  }

  .donate-link-app {
    display: block;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--olive);
    text-decoration: none;
    letter-spacing: 0.04em;
    padding-bottom: 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .donate-link-app:hover {
    text-decoration: underline;
    filter: brightness(1.2);
  }
  .footer-link {
    display: block;
    font-size: 10px;
    font-family: var(--font-mono);
    color: rgba(237,232,220,0.4);
    text-decoration: none;
    letter-spacing: 0.04em;
    padding-bottom: 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }
  .footer-link:hover {
    color: rgba(237,232,220,0.7);
  }

  .setting-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.5);
    text-transform: uppercase;
    display: block;
    margin-bottom: 8px;
  }
  .btn-reset {
    border: 1px solid var(--color-salmon);
    background: transparent;
    color: var(--color-salmon);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    width: 100%;
  }
  .btn-reset:active {
    background: var(--color-salmon);
    color: var(--color-bg);
  }
  .reset-warn {
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-salmon);
    margin: 0 0 8px;
  }
  .reset-actions {
    display: flex;
    gap: 8px;
  }
  .btn-reset-confirm {
    border: 1px solid var(--color-salmon);
    background: var(--color-salmon);
    color: var(--color-bg);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    flex: 1;
  }
  .btn-reset-cancel {
    border: 1px solid rgba(237,232,220,0.3);
    background: transparent;
    color: rgba(237,232,220,0.55);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    flex: 1;
  }
  .btn-reset-cancel:active {
    background: rgba(237,232,220,0.15);
  }

  /* ── Mobile: fullscreen overlay ── */
  @media (max-width: 639px) {
    .sidebar {
      inset: 0;
      width: 100%;
      z-index: 110;
    }
    :global(.guide-float) {
      max-width: calc(100% - 16px);
      width: auto;
    }
    :global(.guide-float.shifted) {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
    }
  }
</style>
