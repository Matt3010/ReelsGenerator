<script lang="ts">
  /** Una barra che si riempie a passi: `value` di `max`, detta a voce da `label`; `tone="ok"` verde, a cosa fatta. */
  let { value, max, label, tone = 'neutral' }: { value: number; max: number; label: string; tone?: 'neutral' | 'ok' } = $props();
</script>

<span class="bar" class:is-ok={tone === 'ok'} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
  <span class="fill" style:width={`${(value / max) * 100}%`}></span>
</span>

<style>
  .bar { display: block; height: 4px; border-radius: 2px; background: var(--hairline); overflow: hidden; }

  .fill { display: block; height: 100%; border-radius: 2px; background: var(--ink-2); transition: width 0.4s var(--ease); }

  .is-ok .fill { background: var(--ok); }
</style>
