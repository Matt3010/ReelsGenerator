/** jsdom has no EventSource: this one is opened by the app, and a test speaks for the server. */
export class FakeEventSource extends EventTarget {
  /** The ones open now, the newest last. */
  static open: FakeEventSource[] = [];

  constructor(readonly url: string) {
    super();
    FakeEventSource.open.push(this);
  }

  close(): void {
    FakeEventSource.open = FakeEventSource.open.filter((one) => one !== this);
  }
}

/** The server says something changed, on every source of the app's events it has open. */
export function serverSays(): void {
  for (const source of FakeEventSource.open.filter((one) => one.url === '/api/events')) source.dispatchEvent(new MessageEvent('message', { data: 'changed' }));
}

