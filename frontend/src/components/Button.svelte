<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * L'unico bottone dell'app: `primary`, `ghost`, `danger-solid`, `icon` (un quadrato da 30, come `sm`),
   * `avatar` (l'iniziale di chi è dentro, tonda e alta come `icon`) e `pill` (un'azione dentro a una riga
   * di testo, come «Riprova»).
   * `size` dà l'altezza ai tasti con parole: `sm` 30, normale 40, `lg` 44. `tone="danger"` lo tinge
   * di rosso; con `href` è un link. Chi lo ospita decide dove sta, mai com'è fatto.
   */
  type Look = 'primary' | 'ghost' | 'icon' | 'avatar' | 'pill' | 'danger-solid';

  let {
    look = 'ghost',
    tone,
    size,
    href,
    disabled = false,
    children,
    ...rest
  }: {
    look?: Look;
    tone?: 'danger';
    size?: 'sm' | 'lg';
    href?: string;
    disabled?: boolean;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const classes = $derived(
    ['btn', look, tone === 'danger' ? 'is-danger' : '', size ? `is-${size}` : '']
      .filter(Boolean)
      .join(' '),
  );
</script>

{#if href}
  <!-- un <a> non ha `disabled`: niente indirizzo, aria-disabled, e il CSS toglie i clic -->
  <a
    href={disabled ? undefined : href}
    aria-disabled={disabled ? 'true' : undefined}
    tabindex={disabled ? -1 : undefined}
    {...rest}
    class={classes}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    {disabled}
    {...rest}
    class={classes}
  >
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    box-sizing: border-box;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
  }

  /* i due modi di essere spento: quello vero dei bottoni e quello dei link */
  .btn:disabled, .btn[aria-disabled='true'] {
    cursor: default;
    pointer-events: none;
  }

  /* ----------------------------------------------------------------- size -- */
  /* l'altezza è fissa, bordo compreso: due tasti della stessa misura sono alti uguali, con o senza bordo */
  .primary, .ghost, .danger-solid { height: 40px; padding: 0 16px; }

  .is-sm { height: 30px; padding: 0 12px; font-size: 12.5px; }

  .is-lg { height: 44px; padding: 0 18px; font-size: 14.5px; }

  /* ------------------------------------------------------------- primary -- */
  .primary {
    border: 0;
    border-radius: var(--r-in);
    background: var(--accent-grad);
    color: var(--on-accent);
    font-weight: 560;
    letter-spacing: -0.008em;
    box-shadow: var(--shadow-1), inset 0 1px 0 rgb(255 255 255 / 0.14);
    transition: transform 0.14s var(--ease), box-shadow 0.2s, filter 0.2s;
  }

  @media (hover: hover) {
  .primary:hover { filter: brightness(1.08); box-shadow: var(--shadow-2); }
}
  .primary:active { transform: translateY(1px); }

  /* --------------------------------------------------------------- ghost -- */
  .ghost {
    border: 1px solid var(--hairline);
    border-radius: var(--r-in);
    background: transparent;
    color: var(--ink-2);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  @media (hover: hover) {
  .ghost:hover { background: var(--sunken); color: var(--ink); }
}

  .btn:disabled.primary, .btn:disabled.ghost, .btn:disabled.danger-solid { opacity: 0.6; }

  /* --------------------------------------------------------- danger-solid -- */
  /* la risposta a "lo elimino?": l'unica cosa rossa piena sullo schermo */
  .danger-solid {
    border: 0;
    border-radius: var(--r-in);
    background: var(--danger);
    color: #fff;
    font-weight: 560;
    letter-spacing: -0.008em;
    box-shadow: var(--shadow-1);
    transition: filter 0.15s, transform 0.14s var(--ease);
  }

  @media (hover: hover) {
  .danger-solid:hover { filter: brightness(1.1); }
}
  .danger-solid:active { transform: translateY(1px); }

  /* ---------------------------------------------------------------- icon -- */
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    /* uguale ovunque: a 13px dal bordo di una scheda, l'angolo segue il suo */
    border-radius: var(--r-in);
    /* uno sfondo anche a riposo: sul telefono non c'è hover, e senza sembrerebbe un'icona e non un tasto */
    background: var(--sunken);
    color: var(--ink-3);
    transition: background 0.15s, color 0.15s;
  }

  @media (hover: hover) {
  .icon:hover { background: var(--sunken-hover); color: var(--ink); }
}

  /* il dito che preme lo vede: sul telefono è l'unico segno, non c'è hover */
  .icon:active { background: var(--sunken-hover); }

  .icon:disabled, .icon[aria-disabled='true'] { opacity: 0.3; }

  /* -------------------------------------------------------------- avatar -- */
  /* chi sei: un cerchio con l'iniziale, alto quanto un tasto icona, nel colore dell'app */
  .avatar {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--accent-grad);
    color: var(--on-accent);
    font-size: 13px;
    font-weight: 650;
    transition: filter 0.15s;
  }

  @media (hover: hover) {
  .avatar:hover { filter: brightness(1.08); }
}
  .avatar:active { filter: brightness(0.9); }

  /* ---------------------------------------------------------------- pill -- */
  /* un'azione dentro a una riga di testo: prende il colore del testo intorno, chiaro o scuro che sia */
  .pill {
    flex: none;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 99px;
    background: color-mix(in srgb, currentColor 12%, transparent);
    color: inherit;
    font-size: 12.5px;
    font-weight: 560;
    transition: background 0.15s;
  }

  @media (hover: hover) {
  .pill:hover { background: color-mix(in srgb, currentColor 20%, transparent); }
}
  .pill:active { background: color-mix(in srgb, currentColor 20%, transparent); }

  /* ---------------------------------------------------------------- tono -- */
  .is-danger { color: color-mix(in srgb, var(--danger) 80%, transparent); }

  @media (hover: hover) {
  .is-danger:hover {
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 14%, transparent);
    }
}
</style>
