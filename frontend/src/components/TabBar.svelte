<script lang="ts">
  import { nav } from '../lib/nav.svelte';
  import { PHOTOS_PATH, VIDEO_PATH, type Route } from '../lib/routing';
  import type { IconName } from '../lib/icons';
  import Icon from './Icon.svelte';

  /** Le sezioni dell'app, in fondo allo schermo dove arriva il pollice. */
  const SECTIONS: { href: string; label: string; icon: IconName; owns: Route['kind'][] }[] = [
    { href: VIDEO_PATH, label: 'Video', icon: 'logo', owns: ['video'] },
    { href: PHOTOS_PATH, label: 'Immagini', icon: 'photo', owns: ['photos'] },
  ];
</script>

<nav class="bar" aria-label="Sezioni">
  {#each SECTIONS as section (section.href)}
    {@const here = section.owns.includes(nav.route.kind)}
    <a href={section.href} class:here aria-current={here ? 'page' : undefined}>
      <span class="pill"><Icon name={section.icon} size="lg" bold={here} /></span>
      <span>{section.label}</span>
    </a>
  {/each}
</nav>

<style>
  /* un'isola che galleggia sopra la pagina, staccata dai bordi e dal fondo */
  .bar {
    position: fixed;
    left: var(--island-side);
    right: var(--island-side);
    bottom: var(--island-gap);
    z-index: var(--z-bar);
    max-width: 300px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    height: 64px;
    padding: 0 6px;
    border: 1px solid var(--bar-line);
    border-radius: 32px;
    background: var(--bar-glass);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    backdrop-filter: blur(28px) saturate(180%);
    box-shadow: var(--shadow-2);
  }

  @supports not (backdrop-filter: blur(1px)) {
    .bar { background: var(--bar-glass-strong); }
  }

  a {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 2px;
    min-width: 0;
    color: var(--ink-3);
    text-decoration: none;
    font-size: 10.5px;
    font-weight: 560;
    letter-spacing: 0.01em;
    transition: color 0.16s;
  }

  a span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* l'icona sta in una pastiglia, accesa per la sezione in cui sei */
  .pill {
    display: grid;
    place-items: center;
    width: 52px;
    height: 28px;
    border-radius: 14px;
    transition: background 0.16s;
  }

  a.here .pill { background: var(--sunken-hover); }

  @media (hover: hover) {
  a:hover { color: var(--ink-2); }
}

  a.here { color: var(--ink); }
</style>
