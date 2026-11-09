/* Una foto dal dispositivo, mandata direttamente a silo (come in SendLater): l'API firma il modulo, i byte non passano da lei. */

/** Quanto prende silo per una foto (lo dice anche il modulo firmato). */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Il tipo dal nome, quando il telefono non lo dice (certi selettori di Android). */
const BY_NAME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const typeOf = ({ type, name }: File): string => type || (BY_NAME[name.split('.').slice(1).pop()?.toLowerCase() ?? ''] ?? '');

/** Perché non si può usare, detto prima di caricare niente; null se va bene. */
export function photoProblem(file: File): string | null {
  if (!TYPES.includes(typeOf(file))) return 'Solo foto JPG, PNG o WebP.';
  return file.size > MAX_PHOTO_BYTES ? 'La foto è troppo grande: al massimo 20 MB.' : null;
}

/** Il modulo firmato dall'API: dove mandarlo, i campi da rimandare tali e quali, e la chiave della foto in silo. */
export interface SignedUpload { key: string; url: string; fields: Record<string, string> }

/** Quanto può durare il caricamento: una rete che si ferma non tiene la modale in attesa per sempre. */
const UPLOAD_MS = 5 * 60_000;

/** Carica la foto: l'API firma il modulo, il browser lo manda a silo (il file per ultimo). Torna la sua chiave. */
export async function uploadPhoto(file: File, sign: () => Promise<SignedUpload>, post: typeof fetch = fetch): Promise<string> {
  const problem = photoProblem(file);
  if (problem !== null) throw new Error(problem);
  const { key, url, fields } = await sign();
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('Content-Type', typeOf(file));
  form.append('file', file);
  try {
    if ((await post(url, { method: 'POST', body: form, signal: AbortSignal.timeout(UPLOAD_MS) })).ok) return key;
  } catch {
    // silo non raggiunto: lo dice la riga qui sotto, come un no di silo
  }
  throw new Error('Il caricamento della foto non è riuscito: riprova.');
}
