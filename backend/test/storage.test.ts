import { describe, expect, it } from "vitest";
import { S3Store, siloClient } from "../src/storage.js";

const client = siloClient({ url: "http://silo:9000", accessKey: "key", secretKey: "secret-secret" });
const store = (now = new Date("2026-11-09T14:25:00Z")) => new S3Store(client, "reels-images", () => now);

describe("signed links", () => {
  it("are relative to the page's own address, so they pass through its nginx", async () => {
    const url = await store().signedGet("abc.png", "gen.example.work");
    expect(url.startsWith("/reels-images/abc.png?")).toBe(true);
    const q = new URL(url, "https://x").searchParams;
    expect(q.get("X-Amz-SignedHeaders")).toBe("host");
    expect(q.get("X-Amz-Credential")).toMatch(/^key\//);
  });

  it("stay the same for the whole hour, so the browser keeps the picture in its cache", async () => {
    const a = await store(new Date("2026-11-09T14:05:00Z")).signedGet("abc.png", "h");
    const b = await store(new Date("2026-11-09T14:55:00Z")).signedGet("abc.png", "h");
    const c = await store(new Date("2026-11-09T15:01:00Z")).signedGet("abc.png", "h");
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    const q = new URL(a, "https://x").searchParams;
    expect(q.get("X-Amz-Date")).toBe("20261109T140000Z");
    expect(Number(q.get("X-Amz-Expires"))).toBeGreaterThanOrEqual(3600);
  });

  it("are signed for the host the page came from: another host, another signature", async () => {
    const a = await store().signedGet("abc.png", "gen.example.work");
    const b = await store().signedGet("abc.png", "localhost:8765");
    expect(new URL(a, "https://x").searchParams.get("X-Amz-Signature"))
      .not.toBe(new URL(b, "https://x").searchParams.get("X-Amz-Signature"));
  });

  it("can name the file for a download", async () => {
    const url = await store().signedGet("j1.mp4", "h", { filename: "short.mp4" });
    expect(new URL(url, "https://x").searchParams.get("response-content-disposition")).toBe('attachment; filename="short.mp4"');
  });
});

describe("signed uploads", () => {
  it("let the page post one picture straight to silo: only that key, only images, only up to a size", async () => {
    const up = await store().signedUpload("u1.png", { maxBytes: 20 * 1024 * 1024, contentType: "image/" });
    expect(up.url).toBe("/reels-images");
    expect(up.fields.key).toBe("u1.png");
    const policy = JSON.parse(Buffer.from(up.fields.Policy, "base64").toString("utf8"));
    expect(policy.conditions).toEqual(expect.arrayContaining([
      ["content-length-range", 1, 20 * 1024 * 1024],
      ["starts-with", "$Content-Type", "image/"],
      { key: "u1.png" },
    ]));
  });
});
