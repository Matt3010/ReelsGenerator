import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, drawPlan, modelById } from "../src/models.js";

describe("models", () => {
  it("offers DreamShaper, Z-Image Turbo, Krea 2 Turbo, Juggernaut XL and LUSTIFY, DreamShaper first", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["dreamshaper", "zimage", "krea2", "juggernaut", "lustify", "lustify-krea"]);
    expect(DEFAULT_MODEL).toBe("dreamshaper");
    for (const m of MODELS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.files.length).toBeGreaterThan(0);
    }
  });

  it("knows each model's weights and settings for sd.cpp", () => {
    const dream = modelById("dreamshaper").args("/m");
    expect(dream).toEqual(expect.arrayContaining(["-m", "/m/DreamShaperXL_Turbo_v2_1.safetensors", "--vae", "/m/sdxl.vae.safetensors"]));
    const z = modelById("zimage").args("/m");
    expect(z).toEqual(expect.arrayContaining(["--diffusion-model", "/m/z_image_turbo-Q4_K.gguf", "--llm", "/m/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
      "--vae", "/m/flux_ae.safetensors", "--offload-to-cpu"]));
    const k = modelById("krea2").args("/m");
    expect(k).toEqual(expect.arrayContaining(["--diffusion-model", "/m/Krea-2-Turbo-Q4_K_M.gguf", "--llm", "/m/Qwen3VL-4B-Instruct-Q4_K_M.gguf",
      "--vae", "/m/wan_2.1_vae.safetensors"]));
  });

  it("DreamShaper starts from a photo with euler_a: dpm++2m karras overcooks an img2img", () => {
    const at = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
    const plain = modelById("dreamshaper").args("/m");
    expect([at(plain, "--sampling-method"), at(plain, "--scheduler")]).toEqual(["dpm++2m", "karras"]);
    const fromPhoto = modelById("dreamshaper").args("/m", { init: true });
    expect([at(fromPhoto, "--sampling-method"), at(fromPhoto, "--scheduler")]).toEqual(["euler_a", "discrete"]);
  });

  it("the NSFW models draw only from text: no photo of a real person to start from", () => {
    expect(MODELS.filter((m) => !m.img2img).map((m) => m.id)).toEqual(["juggernaut", "lustify", "lustify-krea"]);
  });

  it("downloads the Civitai models with the account's key", () => {
    const lustify = modelById("lustify").files[0];
    expect(lustify.urls[0]).toMatch(/^https:\/\/civitai\.com\/api\/download\/models\//);
    expect(lustify.auth).toBe("civitai");
  });

  it("says which models listen to a negative prompt", () => {
    expect(modelById("dreamshaper").negative).toBe(true);
    expect(modelById("zimage").negative).toBe(false);
    expect(modelById("krea2").negative).toBe(false);
  });

  it("knows about how long each model takes at each resolution, longer as it grows", () => {
    for (const m of MODELS) {
      expect(m.minutes.standard).toBeGreaterThan(0);
      expect(m.minutes.fullhd).toBeGreaterThan(m.minutes.standard);
      expect(m.minutes["4k"]).toBeGreaterThan(m.minutes.fullhd);
    }
  });

  it("refuses an unknown model", () => {
    expect(() => modelById("nope")).toThrow(/nope/);
  });
});

describe("drawPlan", () => {
  it("draws at the native size for standard", () => {
    expect(drawPlan(modelById("dreamshaper"), "landscape", "standard")).toEqual({ size: [1344, 768], exact: [1344, 768] });
  });

  it("SDXL reaches Full HD with a hires fix", () => {
    expect(drawPlan(modelById("dreamshaper"), "landscape", "fullhd")).toEqual({ size: [1344, 768], hires: [1920, 1080], exact: [1920, 1080] });
  });

  it("SDXL reaches 4K with the hires fix and then ESRGAN", () => {
    expect(drawPlan(modelById("dreamshaper"), "portrait", "4k"))
      .toEqual({ size: [768, 1344], hires: [1080, 1920], upscale: true, exact: [2160, 3840] });
  });

  it("the newer models draw Full HD directly (multiples of 16), and only 4K needs ESRGAN", () => {
    expect(drawPlan(modelById("zimage"), "landscape", "fullhd")).toEqual({ size: [1920, 1088], exact: [1920, 1080] });
    expect(drawPlan(modelById("krea2"), "landscape", "4k")).toEqual({ size: [1920, 1088], upscale: true, exact: [3840, 2160] });
  });
});
