// Where things live. Defaults are the repo folders (running on the PC); Docker sets the environment.
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("../..", import.meta.url));

export interface Config {
  models: string; jobs: string; library: string; llamaServer: string; sdCli: string; host: string; port: number;
  /** the S3 store (silo) for pictures, videos and uploads */
  silo: { url: string; accessKey: string; secretKey: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, repo = REPO): Config {
  const data = env.DATA_DIR ?? repo;
  const exe = process.platform === "win32" ? ".exe" : "";
  return {
    models: env.MODELS_DIR ?? join(repo, "models"),
    jobs: join(data, "jobs"),
    library: join(data, "library"),
    llamaServer: env.LLAMA_SERVER ?? join(repo, "tools", "llama", `llama-server${exe}`),
    sdCli: env.SD_CLI ?? join(repo, "tools", "sd", `sd-cli${exe}`),
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3000),
    silo: { url: env.SILO_URL ?? "http://127.0.0.1:9000", accessKey: env.SILO_ACCESS_KEY ?? "", secretKey: env.SILO_SECRET_KEY ?? "" },
  };
}

export const CONFIG = loadConfig();
