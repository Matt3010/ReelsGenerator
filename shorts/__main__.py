"""CLI: python -m shorts "topic" [--voice en-US-GuyNeural] [--no-captions]"""
import argparse

from .pipeline import JOBS, Job, run_default

ap = argparse.ArgumentParser()
ap.add_argument("topic")
ap.add_argument("--voice", default="en-US-GuyNeural")
ap.add_argument("--no-captions", action="store_true")
a = ap.parse_args()
job = Job.create(JOBS, a.topic, a.voice, not a.no_captions)
print("job", job.dir)
run_default(job)
print(job.status())
