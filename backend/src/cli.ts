// CLI: npm run short -- "topic" [--voice en-US-GuyNeural] [--no-captions]
import { parseArgs } from "node:util";
import { JOBS, Job, defaultEngines, runJob } from "./pipeline.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  voice: { type: "string", default: "en-US-GuyNeural" }, "no-captions": { type: "boolean", default: false } } });
if (!positionals[0]) {
  console.error('usage: npm run short -- "topic" [--voice en-US-GuyNeural] [--no-captions]');
  process.exit(2);
}
const job = Job.create(JOBS, { topic: positionals[0], voice: values.voice!, captions: !values["no-captions"] });
console.log("job", job.dir);
await runJob(job, defaultEngines());
console.log(job.status());
