import { join } from "node:path";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

it("uses the repo folders by default", () => {
  const c = loadConfig({}, "/repo");
  expect(c.models).toBe(join("/repo", "models"));
  expect(c.jobs).toBe(join("/repo", "jobs"));
  expect(c.library).toBe(join("/repo", "library"));
  expect(c.port).toBe(3000);
});

it("takes paths, binaries and the address from the environment (Docker)", () => {
  const c = loadConfig({ MODELS_DIR: "/models", DATA_DIR: "/data", LLAMA_SERVER: "/opt/llama-server",
    SD_CLI: "/opt/sd-cli", HOST: "0.0.0.0", PORT: "4000" }, "/repo");
  expect(c).toMatchObject({ models: "/models", jobs: join("/data", "jobs"), library: join("/data", "library"),
    llamaServer: "/opt/llama-server", sdCli: "/opt/sd-cli", host: "0.0.0.0", port: 4000 });
});
