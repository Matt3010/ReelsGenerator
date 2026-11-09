// The files the app keeps (pictures, videos, uploads), in silo: an S3 store (a MinIO port), one bucket per context.
// The pages never ask the API for a file: they get a link signed for silo and nginx passes it on.
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand,
  S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CONFIG } from "./config.js";

/** a link signed for the page: its path and query, the page's own address in front */
export interface Upload { url: string; fields: Record<string, string> }

export interface Store {
  readonly bucket: string;
  put(key: string, file: string, contentType: string): Promise<void>;
  /** to a local file (a render needs its pictures on disk) */
  download(key: string, dst: string): Promise<void>;
  has(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** a GET link for the host the page came from; `filename`: downloaded under that name */
  signedGet(key: string, host: string, o?: { filename?: string }): Promise<string>;
  /** a form post straight to silo, for that key only, of a type starting with `contentType`, up to `maxBytes` */
  signedUpload(key: string, o: { maxBytes: number; contentType: string }): Promise<Upload>;
}

export interface SiloConfig { url: string; accessKey: string; secretKey: string }

/** one bucket per context: the library's pictures, the finished videos, the pictures the pages upload */
export const BUCKETS = { images: "reels-images", videos: "reels-videos", uploads: "reels-uploads" } as const;
export type Stores = { [K in keyof typeof BUCKETS]: S3Store };

/** a job's video in its bucket */
export const videoKey = (jobId: string) => `${jobId}.mp4`;

let shared: Stores | undefined;
/** the stores of the silo in the config, made once */
export function stores(): Stores {
  if (!shared) {
    const client = siloClient(CONFIG.silo);
    shared = { images: new S3Store(client, BUCKETS.images), videos: new S3Store(client, BUCKETS.videos),
      uploads: new S3Store(client, BUCKETS.uploads) };
  }
  return shared;
}

export const siloClient = (c: SiloConfig) => new S3Client({
  endpoint: c.url, region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
});

const HOUR = 3600_000;
/** a link signed at the top of the hour and good for two: the same all hour long (cacheable), never less than one */
const LINK_SECONDS = 2 * 3600;
const UPLOAD_SECONDS = 15 * 60;

/** the path and query of a URL: the page puts its own address (the one silo checks the signature against) in front */
const relative = (url: string) => { const u = new URL(url); return u.pathname + u.search; };

export class S3Store implements Store {
  /** a client per host the pages come from, only to sign (the signature covers the host) */
  private signers = new Map<string, S3Client>();

  constructor(private client: S3Client, readonly bucket: string, private now: () => Date = () => new Date()) {}

  private signer(host: string): S3Client {
    let s = this.signers.get(host);
    if (!s) {
      s = new S3Client({ endpoint: `http://${host}`, region: "us-east-1", forcePathStyle: true, credentials: this.client.config.credentials });
      this.signers.set(host, s);
    }
    return s;
  }

  async ensure(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, file: string, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(file),
      ContentLength: statSync(file).size, ContentType: contentType }));
  }

  async download(key: string, dst: string): Promise<void> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    mkdirSync(dirname(dst), { recursive: true });
    await pipeline(r.Body as Readable, createWriteStream(dst));
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedGet(key: string, host: string, o: { filename?: string } = {}): Promise<string> {
    const hour = new Date(Math.floor(this.now().getTime() / HOUR) * HOUR);
    const url = await getSignedUrl(this.signer(host), new GetObjectCommand({ Bucket: this.bucket, Key: key,
      ResponseContentDisposition: o.filename ? `attachment; filename="${o.filename}"` : undefined }),
    { expiresIn: LINK_SECONDS, signingDate: hour });
    return relative(url);
  }

  async signedUpload(key: string, o: { maxBytes: number; contentType: string }): Promise<Upload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket, Key: key, Expires: UPLOAD_SECONDS,
      Conditions: [["content-length-range", 1, o.maxBytes], ["starts-with", "$Content-Type", o.contentType]],
    });
    return { url: relative(url).replace(/\/$/, ""), fields };
  }
}
