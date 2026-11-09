import { describe, expect, it, vi } from 'vitest';
import { follow } from './events';

/** The server's events, as the browser's EventSource gives them. */
class Source extends EventTarget {
  static last: Source;
  closed = false;
  /** 0 connecting, 1 open, 2 closed for good. */
  readyState = 0;
  constructor(readonly url: string) {
    super();
    Source.last = this;
  }
  close() {
    this.closed = true;
  }
}

/** A page that can be shown and hidden. */
function page() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  return {
    doc: doc as unknown as Document,
    show(next: 'visible' | 'hidden') {
      doc.visibilityState = next;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

const start = (onChange: () => void, p = page()) => follow(onChange, Source as unknown as typeof EventSource, p.doc);

describe('the server events', () => {
  it('come from /api/events', () => {
    start(() => undefined);
    expect(Source.last.url).toBe('/api/events');
  });

  it('say each change', () => {
    const onChange = vi.fn();
    start(onChange);
    expect(onChange).not.toHaveBeenCalled();
    Source.last.dispatchEvent(new MessageEvent('message', { data: 'changed' }));
    Source.last.dispatchEvent(new MessageEvent('message', { data: 'changed' }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('count as a change once connected, again after a reconnect: what changed meanwhile is not lost', () => {
    const onChange = vi.fn();
    start(onChange);
    Source.last.dispatchEvent(new Event('open'));
    expect(onChange).toHaveBeenCalledTimes(1);
    Source.last.dispatchEvent(new Event('error'));
    Source.last.dispatchEvent(new Event('open'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('open again, 5 s later, when the browser gives up: an error answer (a deploy, a 502) closes an EventSource for good', () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      start(onChange);
      const first = Source.last;
      // still trying on its own: nothing to do
      first.dispatchEvent(new Event('error'));
      vi.advanceTimersByTime(60_000);
      expect(Source.last).toBe(first);
      first.readyState = 2;
      first.dispatchEvent(new Event('error'));
      vi.advanceTimersByTime(4_999);
      expect(Source.last).toBe(first);
      vi.advanceTimersByTime(1);
      expect(Source.last).not.toBe(first);
      expect(Source.last.url).toBe('/api/events');
      // the new one is followed like the first
      Source.last.dispatchEvent(new MessageEvent('message', { data: 'changed' }));
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('open none again once stopped, even with a retry on its way', () => {
    vi.useFakeTimers();
    try {
      const stop = start(() => undefined);
      const first = Source.last;
      first.readyState = 2;
      first.dispatchEvent(new Event('error'));
      stop();
      vi.advanceTimersByTime(60_000);
      expect(Source.last).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop the one opened again, not the first', () => {
    vi.useFakeTimers();
    try {
      const stop = start(() => undefined);
      Source.last.readyState = 2;
      Source.last.dispatchEvent(new Event('error'));
      vi.advanceTimersByTime(5_000);
      const second = Source.last;
      stop();
      expect(second.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('count as a change when the page comes back in sight, not when it goes away', () => {
    const onChange = vi.fn();
    const p = page();
    start(onChange, p);
    p.show('hidden');
    expect(onChange).not.toHaveBeenCalled();
    p.show('visible');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stop for good when told', () => {
    const onChange = vi.fn();
    const p = page();
    const stop = start(onChange, p);
    const source = Source.last;
    stop();
    expect(source.closed).toBe(true);
    p.show('visible');
    expect(onChange).not.toHaveBeenCalled();
  });
});
