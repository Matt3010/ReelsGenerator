import { render, screen } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import { FakeEventSource } from '../test/event-source';
import SystemPage from './SystemPage.svelte';

const STATS = {
  gpu: { name: 'NVIDIA GeForce GTX 1060 6GB', util: 93, memUsed: 5274, memTotal: 6144, power: 98.5, temp: 71 },
  cpu: 42, cores: 16, mem: { used: 9830, total: 15958 },
  procs: [{ pid: 41, name: 'sd-cli', cpu: 150, mem: 3277 }, { pid: 7, name: 'node', cpu: 3, mem: 690 }],
};

const says = (data: unknown) => {
  for (const s of FakeEventSource.open.filter((one) => one.url === '/api/stats')) s.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
};

afterEach(() => { FakeEventSource.open = []; });

it('shows the GPU, the CPU, the memory and the busiest processes as they come', async () => {
  render(SystemPage);
  says(STATS);
  expect(await screen.findByText('NVIDIA GeForce GTX 1060 6GB')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'GPU' })).toHaveAttribute('aria-valuenow', '93');
  expect(screen.getByText('5,2 / 6,0 GB')).toBeInTheDocument();
  expect(screen.getByText('71 °C · 99 W')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'CPU' })).toHaveAttribute('aria-valuenow', '42');
  expect(screen.getByText('9,6 / 15,6 GB')).toBeInTheDocument();
  const sd = screen.getByRole('row', { name: /sd-cli/ });
  expect(sd).toHaveTextContent('150%');
  expect(sd).toHaveTextContent('3,2 GB');
  says({ ...STATS, cpu: 7 });
  expect(await screen.findByRole('progressbar', { name: 'CPU' })).toHaveAttribute('aria-valuenow', '7');
});

it('says when there is no GPU', async () => {
  render(SystemPage);
  says({ ...STATS, gpu: null });
  expect(await screen.findByText(/nessuna gpu/i)).toBeInTheDocument();
});

it('stops listening when it goes away', () => {
  const { unmount } = render(SystemPage);
  expect(FakeEventSource.open.some((s) => s.url === '/api/stats')).toBe(true);
  unmount();
  expect(FakeEventSource.open.some((s) => s.url === '/api/stats')).toBe(false);
});
