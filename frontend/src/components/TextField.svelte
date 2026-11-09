<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Un campo di testo (o `multiline`, un textarea); il vestito sta nel foglio dei controlli.
   * `password` ha dentro il suo occhio, per leggere quello che si è scritto.
   */
  type Kind = 'text' | 'email' | 'password' | 'multiline';

  let {
    value = $bindable(''),
    kind = 'text',
    placeholder,
    label,
    maxlength = 140,
    autocomplete,
    required = false,
    autofocus = false,
    element = $bindable(),
    ...rest
  }: {
    value?: string;
    kind?: Kind;
    placeholder?: string;
    /** Come si chiama questo campo, per chi non lo vede. */
    label?: string;
    maxlength?: number;
    autocomplete?: AutoFill;
    required?: boolean;
    autofocus?: boolean;
    /** Per chi deve metterci il fuoco da fuori. */
    element?: HTMLInputElement | HTMLTextAreaElement;
    [key: string]: unknown;
  } = $props();

  let mostra = $state(false);
</script>

{#if kind === 'multiline'}
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    class="text-field"
    bind:this={element}
    bind:value
    {placeholder}
    {maxlength}
    {required}
    {autofocus}
    aria-label={label}
    {...rest}
  ></textarea>
{:else if kind === 'password'}
  <span class="peek">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type={mostra ? 'text' : 'password'}
      class="text-field"
      bind:this={element}
      bind:value
      {placeholder}
      {maxlength}
      {required}
      {autofocus}
      {autocomplete}
      aria-label={label}
      {...rest}
    />
    <span class="occhio">
      <Button
        look="icon"
        title={mostra ? 'Nascondi' : 'Mostra'}
        aria-label={mostra ? 'Nascondi la password' : 'Mostra la password'}
        aria-pressed={mostra}
        onclick={() => (mostra = !mostra)}
      >
        <Icon name={mostra ? 'eyeOff' : 'eye'} />
      </Button>
    </span>
  </span>
{:else}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type={kind}
    class="text-field"
    bind:this={element}
    bind:value
    {placeholder}
    {maxlength}
    {required}
    {autofocus}
    {autocomplete}
    aria-label={label}
    {...rest}
  />
{/if}

<style>
  /* l'occhio sta dentro al campo, all'altezza del testo: a 5px dal bordo, e il testo non ci va sotto */
  .peek { position: relative; display: block; }
  .peek input { width: 100%; padding-right: 40px; }
  /* a metà del campo, qualunque sia l'altezza del tasto */
  .occhio { position: absolute; top: 50%; right: 5px; display: flex; transform: translateY(-50%); }
</style>
