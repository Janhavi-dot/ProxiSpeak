import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWavBuffer({ durationSeconds = 3, sampleRate = 44100, generateSample }) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = Buffer.alloc(totalSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(totalSize - 8, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, generateSample(t, durationSeconds, i)));
    const int16 = Math.floor(sample * 32767);
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }

  return buffer;
}

// 1. Corporate Announcement Chime (C5 -> E5 -> G5 bell chime with decay)
function generateAnnouncement(t, totalDuration) {
  // 3-note harmonic chime
  const notes = [
    { start: 0.0, freq: 523.25, dur: 1.2 }, // C5
    { start: 0.5, freq: 659.25, dur: 1.2 }, // E5
    { start: 1.0, freq: 783.99, dur: 1.8 }, // G5
  ];

  let val = 0;
  for (const n of notes) {
    if (t >= n.start && t < n.start + n.dur) {
      const dt = t - n.start;
      const env = Math.exp(-3.2 * dt); // bell decay envelope
      // Fundamental + 2nd overtone for bell richness
      const wave = Math.sin(2 * Math.PI * n.freq * dt) * 0.7 + Math.sin(2 * Math.PI * n.freq * 2 * dt) * 0.3;
      val += wave * env * 0.6;
    }
  }
  return val;
}

// 2. Dev Standup Voice Memo (Speech-like vocal formant tones with natural cadence)
function generateStandupMemo(t, totalDuration) {
  if (t > totalDuration - 0.2) return 0;
  // Natural speech cadence modulation (~4Hz syllables)
  const cadence = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.8 * t);
  // Voice formant base (180 Hz male vocal pitch + 750 Hz vowel resonance)
  const f0 = 180 + 15 * Math.sin(2 * Math.PI * 1.5 * t);
  const v1 = Math.sin(2 * Math.PI * f0 * t);
  const v2 = Math.sin(2 * Math.PI * 720 * t) * 0.4;
  const v3 = Math.sin(2 * Math.PI * 1440 * t) * 0.2;
  // Pause between clauses (at 1.4s - 1.8s)
  const pause = t >= 1.4 && t <= 1.75 ? 0.05 : 1.0;
  return (v1 + v2 + v3) * cadence * pause * 0.5;
}

// 3. Lounge Ambient Chords (Gentle Cmaj7 synth pad)
function generateLoungeMusic(t, totalDuration) {
  const freqs = [261.63, 329.63, 392.0, 493.88]; // C4, E4, G4, B4
  // Smooth swell envelope
  const attack = Math.min(1, t / 0.8);
  const release = Math.min(1, (totalDuration - t) / 0.8);
  const masterEnv = attack * release;

  let val = 0;
  freqs.forEach((f, idx) => {
    // Subtle vibrato
    const lfo = 1 + 0.003 * Math.sin(2 * Math.PI * (3 + idx) * t);
    val += Math.sin(2 * Math.PI * f * lfo * t) * 0.22;
  });
  return val * masterEnv;
}

// 4. Meeting Notes & Action Items Memo
function generateMeetingNotes(t, totalDuration) {
  const f0 = 220 + 20 * Math.cos(2 * Math.PI * 2 * t);
  const syllables = Math.max(0, Math.sin(2 * Math.PI * 4.2 * t));
  const envelope = Math.sin((Math.PI * t) / totalDuration);
  return (Math.sin(2 * Math.PI * f0 * t) * 0.6 + Math.sin(2 * Math.PI * 880 * t) * 0.3) * syllables * envelope * 0.6;
}

const targetDirs = [
  path.resolve(__dirname, "../sample_audio"),
  path.resolve(__dirname, "../client/public/sample_audio"),
];

targetDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const audioFiles = [
  { name: "office_announcement.wav", dur: 3.2, fn: generateAnnouncement },
  { name: "dev_standup_memo.wav", dur: 3.5, fn: generateStandupMemo },
  { name: "lounge_music.wav", dur: 4.0, fn: generateLoungeMusic },
  { name: "meeting_notes.wav", dur: 3.0, fn: generateMeetingNotes },
];

console.log("Generating sample audio files for ProxiSpeak...");

for (const item of audioFiles) {
  const buf = createWavBuffer({ durationSeconds: item.dur, sampleRate: 44100, generateSample: item.fn });
  for (const dir of targetDirs) {
    const dest = path.join(dir, item.name);
    fs.writeFileSync(dest, buf);
    console.log(`✓ Wrote ${dest} (${buf.length} bytes, ${item.dur}s)`);
  }
}

// Write sample_audio/README.md
const readmeContent = `# ProxiSpeak Sample Audio Library

This directory contains pre-rendered, physics-ready sample audio files formatted for testing and demonstrating proximity-based spatial audio in the virtual office.

## 🎵 Files Included

1. **\`office_announcement.wav\`** (3.2s)
   - Harmonized three-tone corporate announcement chime (C5 → E5 → G5).
   - Category: \`announcement\` (📢 Announcement).

2. **\`dev_standup_memo.wav\`** (3.5s)
   - Synthetic speech formant voice memo simulating a developer standup recap.
   - Category: \`memo\` (📝 Office Memo).

3. **\`lounge_music.wav\`** (4.0s)
   - Soothing Cmaj7 ambient synthesizer pad designed for the Coffee Lounge & Pantry.
   - Category: \`music\` (🎵 Lounge Music).

4. **\`meeting_notes.wav\`** (3.0s)
   - Conference call action items voice memo designed for the Executive Boardroom.
   - Category: \`discussion\` (💬 Open Discussion / Meeting).

## 🚀 How to Use in ProxiSpeak

1. In the ProxiSpeak web interface (\`http://localhost:5173\`), click **📢 Broadcast Audio**.
2. Select **Upload Audio File**.
3. Choose any file from \`sample_audio/\` (or \`client/public/sample_audio/\`).
4. Set title, category, and hearing radius.
5. Click **Publish Spatial Broadcast**.
6. Walk your avatar near the beacon to test:
   - Dynamic distance attenuation (quadratic drop-off)
   - 3D binaural stereo panning (left/right ear)
   - Wall occlusion filtering
`;

fs.writeFileSync(path.resolve(__dirname, "../sample_audio/README.md"), readmeContent);
console.log("✓ Created sample_audio/README.md");
console.log("All sample audio files generated successfully!");
