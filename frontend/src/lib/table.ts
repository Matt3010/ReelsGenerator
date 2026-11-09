/** Una voce da scegliere: un identificativo, come si legge, e un'aggiunta. */
export interface Choice {
  id: string;
  label: string;
  /** Qualcosa da dire su quella voce: «Offline». */
  note?: string;
}
