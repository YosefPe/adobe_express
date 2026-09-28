#!/usr/bin/env node
// Builds one personalized voiceover WAV per member and a render-ready batch file.
//
//   node scripts/build-voiceover.mjs members.sample.json members.render.json
//
// Each line is synthesized separately with Kokoro (npx hyperframes tts) and placed at a
// fixed scene start, so the voice stays in sync with the visuals for every member.
// Requires ffmpeg/ffprobe and a Python with kokoro-onnx (set HYPERFRAMES_PYTHON).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const [, , inFile = "members.sample.json", outFile = "members.render.json"] = process.argv;
const VOICE = process.env.VO_VOICE || "af_heart";
const BASE_SPEED = Number(process.env.VO_SPEED || "1.0");
const MAX_SPEED = 1.25;
const TOTAL = 26;
const SILVER_MIN = 2500;
const GOLD_MIN = 8000;
const SILVER_RATE = 11;
const VO_DIR = "assets/vo";
const TMP = join(VO_DIR, ".tmp");

// Scene windows mirror the visual timeline in index.html: [start, latest end].
const lines = (m) => [
  [0.9, 3.8, `Bonjour, ${m.firstName}.`],
  [4.4, 7.8, "As a Club Clarins Silver member, you're one step from Gold."],
  [8.5, 12.8, `You have ${words(m.pts)} points. Just ${words(m.gap)} more to Gold.`],
  [13.3, 17.3, `That's about ${words(m.dollars)} dollars in your Clarins favorites.`],
  [17.8, 21.8, "Gold earns twelve points per dollar, with priority customer care."],
  [22.3, 25.8, `${m.firstName}, Gold is within reach.`],
];

function words(n) {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const under100 = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? "-" + ones[x % 10] : ""));
  const under1000 = (x) => {
    const h = Math.floor(x / 100), r = x % 100;
    return [h ? ones[h] + " hundred" : "", r || !h ? under100(r) : ""].filter(Boolean).join(" ");
  };
  if (n < 1000) return under1000(n);
  const th = Math.floor(n / 1000), r = n % 1000;
  return under1000(th) + " thousand" + (r ? " " + under1000(r) : "");
}

const duration = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

function tts(text, speed, out) {
  execFileSync("npx", ["--yes", "hyperframes@0.8.82", "tts", text, "-v", VOICE, "-s", String(speed), "-o", out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  return duration(out);
}

const input = JSON.parse(readFileSync(inFile, "utf8"));
const rows = Array.isArray(input) ? input : input.rows;
mkdirSync(TMP, { recursive: true });

const outRows = rows.map((row) => {
  const pts = Math.max(SILVER_MIN, Math.min(GOLD_MIN - 1, Math.round(Number(row.currentPoints))));
  const gap = GOLD_MIN - pts;
  const m = { firstName: row.firstName, pts, gap, dollars: Math.ceil(gap / SILVER_RATE) };
  const id = String(row.memberId || row.firstName).replace(/[^A-Za-z0-9_.-]/g, "_");

  const segs = lines(m).map(([start, end, text], i) => {
    const f = join(TMP, `${id}-${i}.wav`);
    const window = end - start;
    let speed = BASE_SPEED;
    let d = tts(text, speed, f);
    while (d > window && speed < MAX_SPEED) {
      speed = +Math.min(MAX_SPEED, speed + 0.05).toFixed(2);
      d = tts(text, speed, f);
    }
    if (d > window) throw new Error(`${id} line ${i + 1} is ${d.toFixed(2)}s, window ${window.toFixed(1)}s: "${text}"`);
    console.log(`${id} ${i + 1}: ${d.toFixed(2)}s / ${window.toFixed(1)}s @${speed}x  ${text}`);
    return { f, start };
  });

  // Place each line at its scene start on a silent 26s bed; normalize for speech.
  const out = join(VO_DIR, `${id}.wav`);
  const args = ["-y", "-loglevel", "error"];
  segs.forEach((s) => args.push("-i", s.f));
  const delays = segs.map((s, i) => `[${i}]adelay=${Math.round(s.start * 1000)}:all=1[d${i}]`).join(";");
  const mix = segs.map((_, i) => `[d${i}]`).join("") +
    `amix=inputs=${segs.length}:normalize=0,apad=whole_dur=${TOTAL},atrim=0:${TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`;
  args.push("-filter_complex", `${delays};${mix}`, "-map", "[out]", "-ac", "2", out);
  execFileSync("ffmpeg", args);

  return { ...row, memberId: id, voiceover: out };
});

rmSync(TMP, { recursive: true, force: true });
writeFileSync(outFile, JSON.stringify({ rows: outRows }, null, 2) + "\n");
console.log(`Wrote ${outRows.length} voiceovers and ${outFile}`);
