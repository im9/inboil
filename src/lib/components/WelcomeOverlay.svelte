<script lang="ts">
  import { lang, prefs, savePrefs } from '../state.svelte.ts'
  import { fade } from 'svelte/transition'

  interface Props {
    onLoadDemo: () => void | Promise<void>
    onStartEmpty: () => void
  }
  let { onLoadDemo, onStartEmpty }: Props = $props()

  const docsBase = location.hostname === 'localhost'
    ? 'http://localhost:4321'
    : location.hostname.endsWith('.pages.dev')
      ? 'https://inboil-site.pages.dev'
      : 'https://inboil.app'

  const tutorialPath = $derived(
    lang.value === 'ja'
      ? '/ja/docs/getting-started/first-beat/'
      : '/docs/getting-started/first-beat/'
  )

  function dismiss() {
    prefs.visited = true
    savePrefs()
  }

  function handleDemo() {
    dismiss()
    onLoadDemo()
  }

  function handleEmpty() {
    dismiss()
    onStartEmpty()
  }
</script>

<div class="welcome-backdrop" transition:fade={{ duration: 150 }}>
  <div class="welcome-card">
    <!-- REFACTOR-OK: #a3a145 is the logo brand olive (brighter than --color-olive for visibility) -->
    <svg class="welcome-logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" fill="#a3a145"/>
      <rect x="14" y="4" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="4" y="14" width="8" height="8" fill="#a3a145" opacity="0.5"/>
      <rect x="14" y="14" width="8" height="8" fill="#a3a145"/>
    </svg>
    <h1 class="welcome-title">inboil</h1>
    <p class="welcome-sub">
      {lang.value === 'ja'
        ? 'ブラウザで動くグルーヴボックス'
        : 'A groove box in your browser'}
    </p>

    <div class="welcome-actions">
      <button class="welcome-btn primary" onpointerdown={handleDemo}>
        {lang.value === 'ja' ? 'デモを読み込む' : 'Load Demo'}
      </button>
      <button class="welcome-btn" onpointerdown={handleEmpty}>
        {lang.value === 'ja' ? '空のプロジェクトで始める' : 'Start Empty'}
      </button>
    </div>

    <a class="welcome-link" href="{docsBase}{tutorialPath}" target="_blank" rel="noopener">
      {lang.value === 'ja' ? 'チュートリアルを見る →' : 'Getting Started Tutorial →'}
    </a>
  </div>
</div>

<style>
  .welcome-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: var(--lz-text);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .welcome-card {
    background: var(--color-fg);
    color: var(--color-bg);
    border-radius: var(--radius-md);
    padding: 40px 36px 32px;
    text-align: center;
    max-width: 340px;
    width: 90vw;
  }

  .welcome-logo {
    width: 48px;
    height: 48px;
    margin-bottom: 8px;
  }

  .welcome-title {
    font-family: var(--font-display);
    font-size: 28px; /* display: welcome title */
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    font-weight: normal;
  }

  .welcome-sub {
    font-size: var(--fs-lg);
    opacity: 0.55;
    margin-bottom: 28px;
  }

  .welcome-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  .welcome-btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    width: 100%;
    padding: 10px 0;
    border-radius: var(--radius-md);
    font-family: var(--font-data);
    font-size: var(--fs-base);
    letter-spacing: 0.04em;
    border: 1px solid var(--dz-border);
    transition: background 80ms, border-color 80ms;
  }

  .welcome-btn:hover {
    border-color: var(--dz-border-strong);
    background: var(--dz-divider);
  }

  .welcome-btn.primary {
    background: var(--color-olive);
    color: var(--color-bg);
    border-color: transparent;
    font-weight: 600;
  }

  .welcome-btn.primary:hover {
    background: var(--color-olive);
    border-color: transparent;
  }

  .welcome-link {
    font-size: var(--fs-lg);
    color: var(--color-bg);
    opacity: 0.45;
    text-decoration: none;
    transition: opacity 80ms;
  }

  .welcome-link:hover {
    opacity: 0.75;
  }
</style>
