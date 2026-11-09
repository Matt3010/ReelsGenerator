<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Un campo di un modulo: il nome piccolo sopra, il controllo sotto. */
  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="field">
  <span class="eyebrow">{label}</span>
  {@render children()}
</div>
