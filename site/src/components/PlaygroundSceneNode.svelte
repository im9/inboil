<script lang="ts">
  import '../styles/playground.css'
  import { ICON } from '$app/lib/icons.ts'

  /** Which node category to display */
  let { show = 'all' }: { show?: 'all' | 'pattern' | 'modifiers' | 'generators' | 'sweep' } = $props()

  const showPattern    = show === 'all' || show === 'pattern'
  const showModifiers  = show === 'all' || show === 'modifiers'
  const showGenerators = show === 'all' || show === 'generators'
  const showSweep      = show === 'all' || show === 'sweep'
</script>

<div class="playground sn-showcase">
  {#if showPattern}
    <div class="sn-group">
      <span class="sn-category">Pattern</span>
      <div class="sn-row">
        <div class="sn-pat sn-root" style="--nc: #787845">Verse</div>
        <div class="sn-pat" style="--nc: #4472B4">Chorus</div>
      </div>
    </div>
  {/if}

  {#if showModifiers}
    <div class="sn-group">
      <span class="sn-category">Modifier</span>
      <div class="sn-row">
        <div class="sn-mod">
          <svg viewBox="0 0 14 14" width="20" height="20" fill="currentColor" aria-hidden="true">{@html ICON.transpose}</svg>
          <span class="sn-mod-label">+5</span>
        </div>
        <div class="sn-mod">
          <svg viewBox="0 0 14 14" width="20" height="20" fill="currentColor" aria-hidden="true">{@html ICON.repeat}</svg>
          <span class="sn-mod-label">×4</span>
        </div>
        <div class="sn-mod">
          <svg viewBox="0 0 14 14" width="20" height="20" fill="currentColor" aria-hidden="true">{@html ICON.tempo}</svg>
          <span class="sn-mod-label">140</span>
        </div>
        <div class="sn-mod">
          <div class="sn-fx-stack">
            <svg class="sn-fx-layer" style="color: var(--color-olive); --fx-i: 0; --fx-n: 2" viewBox="0 0 14 14" width="18" height="18" fill="currentColor" aria-hidden="true">{@html ICON.fx}</svg>
            <svg class="sn-fx-layer" style="color: var(--color-blue); --fx-i: 1; --fx-n: 2" viewBox="0 0 14 14" width="18" height="18" fill="currentColor" aria-hidden="true">{@html ICON.fx}</svg>
          </div>
          <span class="sn-mod-label">V·D</span>
        </div>
      </div>
    </div>
  {/if}

  {#if showGenerators}
    <div class="sn-group">
      <span class="sn-category">Generator</span>
      <div class="sn-row sn-row-gen">
        <!-- Turing Machine -->
        <div class="sn-gen" style="--nc: #8a9432">
          <div class="sn-gen-fp">
            <div class="sn-turing-bits">
              {#each [true, false, true, true, false, false, true, false] as on}
                <span class="sn-turing-bit" class:on></span>
              {/each}
            </div>
            <div class="sn-gen-label-row">
              <span class="sn-gen-label">TM 8×0.5</span>
            </div>
            <div class="sn-gen-controls"><span class="sn-gen-btn">GEN</span></div>
          </div>
        </div>
        <!-- Quantizer -->
        <div class="sn-gen" style="--nc: #2a9485">
          <div class="sn-gen-fp">
            <div class="sn-quant-keys">
              {#each [0,1,2,3,4,5,6,7,8,9,10,11] as pc}
                {@const isBlack = [1,3,6,8,10].includes(pc)}
                {@const active = [0,2,4,5,7,9,11].includes(pc)}
                <span class="sn-quant-key" class:black={isBlack} class:active></span>
              {/each}
            </div>
            <div class="sn-gen-label-row">
              <span class="sn-gen-label">Q Cmaj</span>
            </div>
            <div class="sn-gen-controls"><span class="sn-gen-btn">GEN</span></div>
          </div>
        </div>
        <!-- Tonnetz -->
        <div class="sn-gen" style="--nc: #9456b0">
          <div class="sn-gen-fp">
            <div class="sn-tonnetz-ops">
              <span class="sn-tonnetz-op current">P</span>
              <span class="sn-tonnetz-op">R</span>
              <span class="sn-tonnetz-op">L</span>
              <span class="sn-tonnetz-op">P</span>
              <span class="sn-tonnetz-op">R</span>
            </div>
            <div class="sn-gen-label-row">
              <span class="sn-gen-label">Tonnetz</span>
            </div>
            <div class="sn-gen-controls"><span class="sn-gen-btn">GEN</span></div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showSweep}
    <div class="sn-group">
      <span class="sn-category">Sweep</span>
      <div class="sn-row">
        <div class="sn-sweep-wrap">
          <div class="sn-gen" style="--nc: #c47a2a">
            <button class="sn-rec-btn" aria-label="Record">
              <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
                <circle cx="6" cy="6" r="5"/>
              </svg>
            </button>
            <div class="sn-gen-fp">
              <div class="sn-sweep-preview">
                <svg viewBox="0 0 104 36" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <line x1="0" y1="18" x2="104" y2="18" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
                  <polyline
                    points="0,26 13,24 26,18 39,10 52,8 65,12 78,18 91,22 104,18"
                    stroke="#8a9432"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    opacity="0.7"
                  />
                  <polyline
                    points="0,18 20,14 40,20 60,10 80,16 104,6"
                    stroke="#4472B4"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    opacity="0.7"
                  />
                </svg>
              </div>
              <div class="sn-gen-label-row">
                <span class="sn-gen-label">→ P01</span>
                <span class="sn-gen-target">2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── Light zone tokens (scoped — playground.css doesn't include these) ── */
  .sn-showcase {
    --lz-bg-active:     rgba(30,32,40, 0.08);
    --lz-border:        rgba(30,32,40, 0.10);
    --lz-border-strong: rgba(30,32,40, 0.15);
    --lz-bg-hover:      rgba(30,32,40, 0.06);
    --lz-text-strong:   rgba(30,32,40, 0.70);

    padding: 16px;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
    width: fit-content;
  }

  .sn-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .sn-category {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(30,32,40, 0.4);
  }
  .sn-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .sn-row-gen {
    gap: 8px;
  }

  /* ── Pattern pill ── */
  .sn-pat {
    min-width: 72px;
    height: 32px;
    border: 1px solid var(--lz-border);
    background: var(--nc);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .sn-pat.sn-root {
    border: 2px solid var(--color-fg);
  }

  /* ── Modifier satellite ── */
  .sn-mod {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    color: var(--color-fg);
    filter: drop-shadow(0 1px 2px var(--lz-border-strong));
  }
  .sn-mod-label {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.03em;
    opacity: 0.6;
    line-height: 1;
  }
  .sn-fx-stack {
    position: relative;
    width: 28px;
    height: 22px;
  }
  .sn-fx-layer {
    position: absolute;
    left: calc((var(--fx-i, 0) - (var(--fx-n, 1) - 1) / 2) * 5px + 50% - 9px);
    top: calc(var(--fx-i, 0) * -1.5px + 2px);
  }

  /* ── Generator faceplate ── */
  .sn-gen {
    width: 120px;
    height: 72px;
    border-radius: var(--radius-md);
    background: rgba(245, 240, 230, 0.95);
    color: rgba(30, 32, 40, 0.85);
    border: 2px solid var(--nc, var(--color-fg));
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }
  .sn-gen-fp {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
  }
  .sn-gen-label-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .sn-gen-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(30, 32, 40, 0.8);
  }
  .sn-gen-target {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    color: rgba(30, 32, 40, 0.4);
    white-space: nowrap;
  }
  .sn-gen-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sn-gen-btn {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border: 1px solid rgba(30, 32, 40, 0.2);
    background: var(--lz-bg-hover);
    color: var(--lz-text-strong);
  }

  /* ── Turing bits ── */
  .sn-turing-bits {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }
  .sn-turing-bit {
    width: 8px;
    height: 8px;
    background: rgba(30, 32, 40, 0.1);
    flex-shrink: 0;
  }
  .sn-turing-bit.on {
    background: rgba(30, 32, 40, 0.7);
  }

  /* ── Quantizer keys ── */
  .sn-quant-keys {
    display: flex;
    gap: 1px;
    height: 16px;
  }
  .sn-quant-key {
    flex: 1;
    background: var(--lz-bg-active);
  }
  .sn-quant-key.black {
    background: var(--lz-border-strong);
    margin-top: 2px;
  }
  .sn-quant-key.active {
    background: rgba(30, 32, 40, 0.5);
  }
  .sn-quant-key.black.active {
    background: rgba(30, 32, 40, 0.65);
  }

  /* ── Tonnetz ops ── */
  .sn-tonnetz-ops {
    display: flex;
    gap: 3px;
  }
  .sn-tonnetz-op {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    padding: 1px 3px;
    background: var(--lz-bg-active);
    color: rgba(30, 32, 40, 0.6);
  }
  .sn-tonnetz-op.current {
    background: rgba(30, 32, 40, 0.7);
    color: rgba(245, 240, 230, 0.9);
  }

  /* ── Sweep preview ── */
  .sn-sweep-wrap .sn-gen {
    position: relative;
  }
  .sn-rec-btn {
    position: absolute;
    left: -11px;
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #e8a090;
    background: rgba(255, 255, 255, 0.95);
    color: #e8a090;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .sn-sweep-preview {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .sn-sweep-preview svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
