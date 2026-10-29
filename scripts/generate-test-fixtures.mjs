import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// Generate only disposable, deterministic files. The output directory is
// ignored and is safe to remove between runs.
const root = process.cwd();
const output = path.join(root, "tmp", "fixtures");
mkdirSync(output, { recursive: true });

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const audioSamples = Buffer.alloc(800, 0x80);
const audio = Buffer.alloc(44 + audioSamples.length);
audio.write("RIFF", 0);
audio.writeUInt32LE(audio.length - 8, 4);
audio.write("WAVEfmt ", 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24);
audio.writeUInt32LE(8000, 28);
audio.writeUInt16LE(1, 32);
audio.writeUInt16LE(8, 34);
audio.write("data", 36);
audio.writeUInt32LE(audioSamples.length, 40);
audioSamples.copy(audio, 44);
const files = {
  "sample-image.png": png,
  "sample-video.mp4": Buffer.from("000000186674797069736f6d00000200", "hex"),
  "sample-audio.wav": audio,
  "sample-document.pdf": Buffer.from("255044462d312e370a", "ascii"),
};
for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(output, name), bytes);

writeFileSync(
  path.join(output, "active-codes.json"),
  JSON.stringify(
    {
      generatedAt: "2026-01-01T00:00:00.000Z",
      codes: [
        { slug: "DEMO000001", type: "text", body: "deterministic fixture" },
        { slug: "DEMO000002", type: "url", url: "https://example.com/tp-qr" },
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log(`Generated ${Object.keys(files).length + 1} fixture files in ${path.relative(root, output)}`);
