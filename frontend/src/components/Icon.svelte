<script lang="ts">
  import { createElement } from 'lucide';
  import { ICONS, type IconName } from '../lib/icons';

  /**
   * Quattro misure: `xs` 10 (sopra una foto), `sm` 12 (le frecce dentro ai campi), normale 16, `lg` 20 (la barra delle sezioni).
   * Il colore è quello del testo intorno, o `tone` (`light`, bianco, sopra una foto); `bold` per quella scelta.
   */
  let {
    name,
    size,
    tone,
    bold = false,
  }: { name: IconName; size?: 'xs' | 'sm' | 'lg'; tone?: 'muted' | 'soft' | 'danger' | 'warn' | 'light'; bold?: boolean } = $props();

  // Lucide hands back an SVG element; we only ever draw our own icon set.
  const markup = $derived.by(() => {
    const svg = createElement(ICONS[name]);
    svg.setAttribute('class', ['ico', size && `is-${size}`, tone && `is-${tone}`, bold && 'is-bold'].filter(Boolean).join(' '));
    svg.setAttribute('aria-hidden', 'true');
    return svg.outerHTML;
  });
</script>

{@html markup}
