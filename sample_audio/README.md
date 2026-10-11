# ProxiSpeak Sample Audio Library

This directory contains pre-rendered, physics-ready sample audio files formatted for testing and demonstrating proximity-based spatial audio in the virtual office.

## 🎵 Files Included

1. **`office_announcement.wav`** (3.2s)
   - Harmonized three-tone corporate announcement chime (C5 → E5 → G5).
   - Category: `announcement` (📢 Announcement).

2. **`dev_standup_memo.wav`** (3.5s)
   - Synthetic speech formant voice memo simulating a developer standup recap.
   - Category: `memo` (📝 Office Memo).

3. **`lounge_music.wav`** (4.0s)
   - Soothing Cmaj7 ambient synthesizer pad designed for the Coffee Lounge & Pantry.
   - Category: `music` (🎵 Lounge Music).

4. **`meeting_notes.wav`** (3.0s)
   - Conference call action items voice memo designed for the Executive Boardroom.
   - Category: `discussion` (💬 Open Discussion / Meeting).

## 🚀 How to Use in ProxiSpeak

1. In the ProxiSpeak web interface (`http://localhost:5173`), click **📢 Broadcast Audio**.
2. Select **Upload Audio File**.
3. Choose any file from `sample_audio/` (or `client/public/sample_audio/`).
4. Set title, category, and hearing radius.
5. Click **Publish Spatial Broadcast**.
6. Walk your avatar near the beacon to test:
   - Dynamic distance attenuation (quadratic drop-off)
   - 3D binaural stereo panning (left/right ear)
   - Wall occlusion filtering
