/**
 * Web Audio API Spatial Audio Mixer
 *
 * Implements physics-aware spatial audio:
 * 1. Live Peer Streams (WebRTC)
 * 2. Anchored Spatial Audio Beacons (Voice notes / audio broadcasts on desks)
 * 3. Dynamic Distance Attenuation (GainNode)
 * 4. 3D Stereo Panning (StereoPannerNode)
 * 5. Acoustic Wall Sound Occlusion (BiquadFilterNode)
 */

class SpatialAudioMixer {
  constructor() {
    this.audioCtx = null;
    this.peers = new Map(); // peerId -> { source, filter, gain, panner, stream }
    this.beacons = new Map(); // beaconId -> { audioEl, source, filter, gain, panner, lastDist }
    this.isSpatialEnabled = true;
    this.isOcclusionEnabled = true;
    this.masterGainNode = null;
    this.isMuted = false;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master output gain
      this.masterGainNode = this.audioCtx.createGain();
      this.masterGainNode.gain.value = 1.0;
      this.masterGainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  /**
   * Attach a peer's incoming WebRTC audio stream into the spatial graph
   */
  addPeerStream(peerId, stream, initialPos = { distance: 60, dx: 0, dy: 0, radius: 160, occlusion: 0 }) {
    if (!stream || stream.getAudioTracks().length === 0) return;

    // Clean up any existing nodes for this peer
    this.removePeerStream(peerId);

    const ctx = this.getAudioContext();

    try {
      const source = ctx.createMediaStreamSource(stream);

      // 1. Acoustic Occlusion Filter (low-pass filter simulating wall obstruction)
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 20000;
      filter.Q.value = 1.0;

      // 2. Distance Attenuation (volume drop-off)
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      // 3. 3D Stereo Panning (binaural ear separation)
      let panner = null;
      if (typeof ctx.createStereoPanner === "function") {
        panner = ctx.createStereoPanner();
        panner.pan.value = 0;
      }

      // Chain: source -> filter -> gain -> [panner] -> masterGain -> destination
      source.connect(filter);
      filter.connect(gain);

      if (panner) {
        gain.connect(panner);
        panner.connect(this.masterGainNode);
      } else {
        gain.connect(this.masterGainNode);
      }

      const nodeBundle = { source, filter, gain, panner, stream };
      this.peers.set(peerId, nodeBundle);

      this.updatePeerSpatial(
        peerId,
        initialPos.distance,
        initialPos.dx,
        initialPos.dy,
        initialPos.radius,
        initialPos.occlusion
      );
    } catch (err) {
      console.warn("Failed to attach peer stream to spatial audio mixer:", err);
    }
  }

  /**
   * Dynamically update spatial audio attributes as avatars move
   */
  updatePeerSpatial(peerId, distance = 60, dx = 0, dy = 0, earshotRadius = 160, occlusion = 0) {
    const peer = this.peers.get(peerId);
    if (!peer || !this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const smoothDuration = 0.05;

    // 1. Distance Volume Attenuation
    let targetGain = 0;
    if (distance <= earshotRadius && !this.isMuted) {
      const normalizedDist = Math.max(0, Math.min(1, distance / earshotRadius));
      targetGain = Math.pow(1 - normalizedDist, 1.8);

      if (this.isOcclusionEnabled && occlusion > 0) {
        targetGain *= Math.max(0.15, 1 - occlusion * 0.7);
      }
    }

    if (!this.isSpatialEnabled) {
      targetGain = distance <= earshotRadius ? 1.0 : 0;
    }

    peer.gain.gain.cancelScheduledValues(now);
    peer.gain.gain.linearRampToValueAtTime(Math.max(0, targetGain), now + smoothDuration);

    // 2. 3D Stereo Panning
    if (peer.panner) {
      let targetPan = 0;
      if (this.isSpatialEnabled && earshotRadius > 0) {
        const rawPan = dx / (earshotRadius * 0.75);
        targetPan = Math.max(-1, Math.min(1, rawPan));
      }

      peer.panner.pan.cancelScheduledValues(now);
      peer.panner.pan.linearRampToValueAtTime(targetPan, now + smoothDuration);
    }

    // 3. Wall Occlusion Filter
    if (peer.filter) {
      let targetFreq = 20000;
      if (this.isOcclusionEnabled && occlusion > 0) {
        targetFreq = Math.max(450, 20000 * Math.pow(1 - occlusion, 2.5));
      }

      peer.filter.frequency.cancelScheduledValues(now);
      peer.filter.frequency.exponentialRampToValueAtTime(
        Math.max(200, targetFreq),
        now + smoothDuration
      );
    }
  }

  /**
   * Sync and dynamically mix anchored spatial audio beacons (broadcasts on desks)
   * Crossfades volume based on user proximity!
   */
  syncBeacons(beaconsList = [], userX = 220, userY = 190, earshotRadius = 160) {
    if (!this.audioCtx) {
      this.getAudioContext();
    }
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const smoothDuration = 0.08;

    const activeBeaconIds = new Set(beaconsList.map((b) => b.id || b._id));

    // Clean up removed beacons
    for (const [id, beaconData] of this.beacons.entries()) {
      if (!activeBeaconIds.has(id)) {
        try {
          beaconData.audioEl.pause();
          beaconData.source.disconnect();
          beaconData.filter.disconnect();
          beaconData.gain.disconnect();
          if (beaconData.panner) beaconData.panner.disconnect();
        } catch {
          // Cleanup
        }
        this.beacons.delete(id);
      }
    }

    // Process active beacons
    beaconsList.forEach((b) => {
      const id = b.id || b._id;
      const bx = b.x ?? 300;
      const by = b.y ?? 300;
      const beaconRadius = b.radius || earshotRadius;
      const dist = Math.hypot(bx - userX, by - userY);
      const dx = bx - userX;
      const occlusion = b.occlusion || 0;

      let beacon = this.beacons.get(id);

      // Initialize beacon audio graph if not already created
      const url = b.audioUrl || b.fileUrl;
      if (!beacon && url) {
        try {
          const audioEl = new Audio();
          audioEl.crossOrigin = "anonymous";
          audioEl.loop = true;
          audioEl.src = url.startsWith("http")
            ? url
            : `http://localhost:5000${url}`;

          const source = ctx.createMediaElementSource(audioEl);
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 20000;

          const gain = ctx.createGain();
          gain.gain.value = 0; // Starts silent until in range

          let panner = null;
          if (typeof ctx.createStereoPanner === "function") {
            panner = ctx.createStereoPanner();
            panner.pan.value = 0;
          }

          source.connect(filter);
          filter.connect(gain);
          if (panner) {
            gain.connect(panner);
            panner.connect(this.masterGainNode);
          } else {
            gain.connect(this.masterGainNode);
          }

          beacon = { audioEl, source, filter, gain, panner };
          this.beacons.set(id, beacon);
        } catch (err) {
          console.warn(`Failed to initialize spatial audio beacon ${id}:`, err);
          return;
        }
      }

      if (!beacon) return;

      // In range: Play and dynamically crossfade in!
      if (dist <= beaconRadius && !this.isMuted) {
        if (beacon.audioEl.paused) {
          beacon.audioEl.play().catch(() => {});
        }

        const normalizedDist = Math.max(0, Math.min(1, dist / beaconRadius));
        let targetGain = Math.pow(1 - normalizedDist, 1.8);
        if (this.isOcclusionEnabled && occlusion > 0) {
          targetGain *= Math.max(0.15, 1 - occlusion * 0.7);
        }

        beacon.gain.gain.cancelScheduledValues(now);
        beacon.gain.gain.linearRampToValueAtTime(Math.max(0, targetGain), now + smoothDuration);

        // 3D Panning
        if (beacon.panner && this.isSpatialEnabled) {
          const rawPan = dx / (beaconRadius * 0.75);
          const targetPan = Math.max(-1, Math.min(1, rawPan));
          beacon.panner.pan.cancelScheduledValues(now);
          beacon.panner.pan.linearRampToValueAtTime(targetPan, now + smoothDuration);
        }

        // Wall Muffling
        if (beacon.filter && this.isOcclusionEnabled) {
          const targetFreq = occlusion > 0 ? Math.max(400, 20000 * Math.pow(1 - occlusion, 2.5)) : 20000;
          beacon.filter.frequency.cancelScheduledValues(now);
          beacon.filter.frequency.exponentialRampToValueAtTime(Math.max(200, targetFreq), now + smoothDuration);
        }
      } else {
        // Out of range: Fade out to silence
        beacon.gain.gain.cancelScheduledValues(now);
        beacon.gain.gain.linearRampToValueAtTime(0, now + smoothDuration);
        if (dist > beaconRadius * 1.5 && !beacon.audioEl.paused) {
          beacon.audioEl.pause();
        }
      }
    });
  }

  /**
   * Remove peer audio nodes when peer leaves earshot
   */
  removePeerStream(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      peer.source.disconnect();
      peer.filter.disconnect();
      peer.gain.disconnect();
      if (peer.panner) peer.panner.disconnect();
    } catch {
      // Safe disconnect
    }

    this.peers.delete(peerId);
  }

  setSpatialEnabled(enabled) {
    this.isSpatialEnabled = !!enabled;
  }

  setOcclusionEnabled(enabled) {
    this.isOcclusionEnabled = !!enabled;
  }

  setMasterMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.linearRampToValueAtTime(muted ? 0 : 1.0, now + 0.05);
    }
  }
}

export const spatialMixer = new SpatialAudioMixer();
