// Running the external programs (sd.cpp, ffmpeg) without a console window.
import { spawn } from "node:child_process";

export interface RunResult { code: number; output: string }
export type Run = (cmd: string[], opts?: { cwd?: string }) => Promise<RunResult>;

/** runs a program to completion; output is stdout + stderr (the tail is what matters on failure) */
export const run: Run = (cmd, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd[0], cmd.slice(1), { cwd: opts.cwd, windowsHide: true });
  let output = "";
  const keep = (b: Buffer) => { output = (output + b.toString("utf8")).slice(-20000); };
  p.stdout.on("data", keep);
  p.stderr.on("data", keep);
  p.on("error", reject);
  p.on("close", (code) => resolve({ code: code ?? -1, output }));
});
