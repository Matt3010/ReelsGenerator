// How busy the machine is, like htop: the GPU (nvidia-smi), and the CPU, memory and processes of the Linux machine
// the API runs in (/proc: in Docker Desktop, its VM; there sd.cpp and llama.cpp do their work).
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

export interface GpuStats { name: string; util: number; memUsed: number; memTotal: number; power: number; temp: number }
/** a process: cpu as htop says it (100 = one core busy), memory in MiB */
export interface ProcStats { pid: number; name: string; cpu: number; mem: number }
export interface Stats {
  gpu: GpuStats | null;
  /** of all the cores together, 0-100 */
  cpu: number;
  cores: number;
  /** MiB */
  mem: { used: number; total: number };
  /** the busiest first */
  procs: ProcStats[];
}

/** where the numbers come from (the tests give their own) */
export interface SysReader {
  file: (path: string) => string;
  pids: () => string[];
  nvidia: () => Promise<string>;
}

const GPU_QUERY = "--query-gpu=name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu";

export const linuxReader: SysReader = {
  file: (path) => readFileSync(path, "utf8"),
  pids: () => readdirSync("/proc").filter((n) => /^\d+$/.test(n)),
  nvidia: () => new Promise((resolve, reject) =>
    execFile("nvidia-smi", [GPU_QUERY, "--format=csv,noheader,nounits"], { timeout: 5000 }, (e, out) => (e ? reject(e) : resolve(out)))),
};

const num = (s: string | undefined) => {
  const n = Number.parseFloat(s ?? "");
  return Number.isFinite(n) ? n : 0;
};

/** the first GPU's line; null when there is none */
export function parseNvidia(text: string): GpuStats | null {
  const line = text.split("\n").find((l) => l.trim());
  if (!line) return null;
  const [name, util, memUsed, memTotal, power, temp] = line.split(",").map((f) => f.trim());
  return { name, util: num(util), memUsed: num(memUsed), memTotal: num(memTotal), power: num(power), temp: num(temp) };
}

/** in use is what is not available (the page cache gives itself back), in MiB */
export function parseMeminfo(text: string): { used: number; total: number } {
  const kb = (key: string) => num(text.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1]);
  const total = kb("MemTotal");
  return { used: Math.round((total - kb("MemAvailable")) / 1024), total: Math.round(total / 1024) };
}

/** the whole CPU's ticks: all of them, and those idle (waiting on the disk counts as idle) */
function cpuTicks(stat: string): { total: number; idle: number; cores: number } {
  const all = stat.split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const cores = stat.split("\n").filter((l) => /^cpu\d+\s/.test(l)).length;
  return { total: all.reduce((a, b) => a + b, 0), idle: (all[3] ?? 0) + (all[4] ?? 0), cores };
}

const TICKS_PER_SECOND = 100; // Linux's USER_HZ
const PAGE_MIB = 4096 / 1024 / 1024;

/** a process's name, its CPU ticks so far and its memory; null when it ended meanwhile */
function procTicks(text: string): { name: string; ticks: number; mem: number } | null {
  const close = text.lastIndexOf(")");
  if (close < 0) return null;
  const name = text.slice(text.indexOf("(") + 1, close);
  const f = text.slice(close + 2).split(" "); // from the 3rd field (state) on
  return { name, ticks: num(f[11]) + num(f[12]), mem: Math.round(num(f[21]) * PAGE_MIB) };
}

/** samples the machine; the CPU of the whole and of each process is what it did since the sample before */
export class Sampler {
  private cpuBefore: { total: number; idle: number } | null = null;
  private procsBefore = new Map<string, number>();
  private at: number | null = null;

  constructor(private read: SysReader = linuxReader, private now: () => number = Date.now, private top = 8) {}

  async sample(): Promise<Stats> {
    const t = this.now();
    const seconds = this.at === null ? 0 : (t - this.at) / 1000;
    const cpu = cpuTicks(this.read.file("/proc/stat"));
    const before = this.cpuBefore;
    const busy = before && cpu.total > before.total
      ? Math.round(100 * (1 - (cpu.idle - before.idle) / (cpu.total - before.total))) : 0;

    const procs: ProcStats[] = [];
    const seen = new Map<string, number>();
    for (const pid of this.read.pids()) {
      let p;
      try { p = procTicks(this.read.file(`/proc/${pid}/stat`)); } catch { continue; } // it ended meanwhile
      if (!p) continue;
      seen.set(pid, p.ticks);
      const was = this.procsBefore.get(pid);
      const share = was !== undefined && seconds > 0 ? Math.round((100 * (p.ticks - was)) / TICKS_PER_SECOND / seconds) : 0;
      procs.push({ pid: Number(pid), name: p.name, cpu: share, mem: p.mem });
    }
    this.cpuBefore = cpu;
    this.procsBefore = seen;
    this.at = t;

    const gpu = await this.read.nvidia().then(parseNvidia, () => null);
    return {
      gpu, cpu: busy, cores: cpu.cores, mem: parseMeminfo(this.read.file("/proc/meminfo")),
      procs: procs.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, this.top),
    };
  }
}
