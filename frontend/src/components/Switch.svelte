<script lang="ts">
  /** Un interruttore acceso/spento: tutta la riga si tocca, il nome è il suo, la riga sotto lo spiega. */
  let {
    checked,
    label,
    hint,
    disabled = false,
    onchange,
  }: {
    checked: boolean;
    label: string;
    /** Una riga che dice a cosa serve. */
    hint?: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  } = $props();

  const id = $props.id();
</script>

<button
  type="button"
  role="switch"
  class="switch"
  aria-checked={checked}
  aria-labelledby="{id}-label"
  aria-describedby={hint ? `${id}-hint` : undefined}
  {disabled}
  onclick={() => onchange(!checked)}
>
  <span class="text">
    <span class="label" id="{id}-label">{label}</span>
    {#if hint}<span class="hint" id="{id}-hint">{hint}</span>{/if}
  </span>
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</button>

<style>
  .switch {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin: 0;
    padding: 8px 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .switch:disabled { cursor: default; opacity: 0.6; }

  .text { flex: 1; min-width: 0; display: grid; gap: 2px; }

  .label { font-size: 13.5px; font-weight: 560; letter-spacing: -0.012em; color: var(--ink); }

  .hint { font-size: 12.5px; line-height: 1.4; color: var(--ink-3); }

  .track {
    position: relative;
    flex: none;
    width: 40px;
    height: 24px;
    border-radius: 99px;
    background: var(--sunken-hover);
    box-shadow: inset 0 0 0 1px var(--hairline);
    transition: background 0.18s var(--ease);
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    transition: transform 0.18s var(--ease);
  }

  .switch[aria-checked='true'] .track { background: var(--accent); box-shadow: none; }

  .switch[aria-checked='true'] .knob { transform: translateX(16px); background: var(--on-accent); }
</style>
