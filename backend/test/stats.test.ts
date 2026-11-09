import { describe, expect, it } from "vitest";
import { Sampler, parseMeminfo, parseNvidia, type SysReader } from "../src/stats.js";

describe("readers", () => {
  it("reads nvidia-smi's line", () => {
    expect(parseNvidia("NVIDIA GeForce GTX 1060 6GB, 93, 5274, 6144, 98.51, 71\n"))
      .toEqual({ name: "NVIDIA GeForce GTX 1060 6GB", util: 93, memUsed: 5274, memTotal: 6144, power: 98.51, temp: 71 });
    expect(parseNvidia("")).toBeNull();
    expect(parseNvidia("NVIDIA GeForce GTX 1060 6GB, [N/A], 5274, 6144, [N/A], 71")).toMatchObject({ util: 0, power: 0 });
  });

  it("reads the memory in MiB, what is in use being what is not available", () => {
    expect(parseMeminfo("MemTotal:       16341328 kB\nMemFree:  100 kB\nMemAvailable:   14982196 kB\n"))
      .toEqual({ used: Math.round((16341328 - 14982196) / 1024), total: Math.round(16341328 / 1024) });
  });
});

/** a machine whose /proc moves on between two samples */
function machine() {
  const m = {
    stat: "cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1\ncpu1 1 1 1 1\n",
    procs: {
      "41": "41 (sd-cli) R 1 1 1 0 -1 0 0 0 0 0 1000 200 0 0 20 0 1 0 5 0 25600",
      "7": "7 (node) S 1 1 1 0 -1 0 0 0 0 0 50 10 0 0 20 0 1 0 5 0 12800",
      "9": "9 (sh) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 5 0 100",
    } as Record<string, string>,
    nvidia: "NVIDIA GeForce GTX 1060 6GB, 90, 5000, 6144, 100.00, 70",
  };
  const read: SysReader = {
    file: (p) => {
      if (p === "/proc/stat") return m.stat;
      if (p === "/proc/meminfo") return "MemTotal: 2048 kB\nMemAvailable: 1024 kB\n";
      const pid = p.match(/^\/proc\/(\d+)\/stat$/)?.[1];
      if (pid && m.procs[pid]) return m.procs[pid];
      throw new Error("ENOENT");
    },
    pids: () => Object.keys(m.procs),
    nvidia: async () => m.nvidia,
  };
  return { m, read };
}

describe("Sampler", () => {
  it("measures CPU and each process between two samples, busiest first", async () => {
    const { m, read } = machine();
    let now = 0;
    const s = new Sampler(read, () => now);
    await s.sample();
    // 2 s later: the machine spent 300 of 400 ticks working; sd-cli 300 ticks (1.5 cores), node 20
    m.stat = "cpu  250 0 250 900 0 0 0 0 0 0\ncpu0 1 1 1 1\ncpu1 1 1 1 1\n";
    m.procs["41"] = "41 (sd-cli) R 1 1 1 0 -1 0 0 0 0 0 1250 250 0 0 20 0 1 0 5 0 25600";
    m.procs["7"] = "7 (node) S 1 1 1 0 -1 0 0 0 0 0 60 20 0 0 20 0 1 0 5 0 12800";
    now = 2000;
    const st = await s.sample();
    expect(st.cpu).toBe(75);
    expect(st.cores).toBe(2);
    expect(st.mem).toEqual({ used: 1, total: 2 });
    expect(st.gpu?.util).toBe(90);
    expect(st.procs.map((p) => [p.name, p.cpu])).toEqual([["sd-cli", 150], ["node", 10], ["sh", 0]]);
    expect(st.procs[0].mem).toBe(100); // 25600 pages of 4 KiB
  });

  it("goes on without a GPU, and forgets processes that ended", async () => {
    const { m, read } = machine();
    read.nvidia = async () => { throw new Error("no nvidia-smi"); };
    const s = new Sampler(read, () => 0);
    await s.sample();
    delete m.procs["41"];
    const st = await s.sample();
    expect(st.gpu).toBeNull();
    expect(st.procs.map((p) => p.name)).toEqual(["node", "sh"]);
  });
});
