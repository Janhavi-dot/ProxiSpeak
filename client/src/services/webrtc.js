import { getSocket } from "./socket.js";
import { spatialMixer } from "./spatialAudio.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

class WebRTCManager {
  constructor() {
    this.localStream = null;
    this.peerConnections = new Map(); // peerId -> RTCPeerConnection
    this.isMuted = false;
    this.isDeafened = false;
    this.isInitialized = false;

    // Mic Level Analyser
    this.analyser = null;
    this.analyserInterval = null;
    this.isSpeaking = false;

    // Callbacks
    this.onSpeakingChange = null; // (isSpeaking, level) => void
    this.onPeerListChange = null; // (activePeers) => void
    this.onError = null;
  }

  /**
   * Request microphone access and setup audio analyser
   */
  async initLocalMicrophone() {
    if (this.localStream) return this.localStream;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.setupMicAnalyser(this.localStream);
      this.setupSocketListeners();
      this.isInitialized = true;
      return this.localStream;
    } catch (err) {
      console.warn("Microphone access unavailable or denied:", err.message);
      if (this.onError) this.onError(err);
      return null;
    }
  }

  /**
   * Live audio volume analyzer for detecting speaking status
   */
  setupMicAnalyser(stream) {
    try {
      const audioCtx = spatialMixer.getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const socket = getSocket();

      this.analyserInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            if (this.onSpeakingChange) this.onSpeakingChange(false, 0);
            socket.emit("user:speaking", { isSpeaking: false, level: 0 });
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalizedLevel = Math.min(1, average / 128);
        const speakingNow = normalizedLevel > 0.12;

        if (speakingNow !== this.isSpeaking) {
          this.isSpeaking = speakingNow;
          if (this.onSpeakingChange) this.onSpeakingChange(speakingNow, normalizedLevel);
          socket.emit("user:speaking", { isSpeaking: speakingNow, level: normalizedLevel });
        }
      }, 80);
    } catch (err) {
      console.warn("Mic analyzer initialization notice:", err);
    }
  }

  /**
   * Listen to Socket.IO signaling events
   */
  setupSocketListeners() {
    const socket = getSocket();

    // 1. Peer entered earshot (< 150px): Initiate WebRTC P2P Connection
    socket.on("webrtc:peer-in-range", async ({ peerId, _name, distance, occlusion, x, y }) => {
      // Deterministic polite/impolite pattern: socket.id < peerId initiates offer
      const isOfferer = socket.id < peerId;
      await this.getOrCreatePeerConnection(peerId, isOfferer, { distance, occlusion, x, y });
    });

    // 2. Peer moved within earshot: Update spatial audio parameters
    socket.on("webrtc:distance-update", ({ peerId, distance, occlusion, dx, dy }) => {
      spatialMixer.updatePeerSpatial(peerId, distance, dx, dy, 160, occlusion);
    });

    // 3. Peer walked out of earshot (> 150px): Close WebRTC connection
    socket.on("webrtc:peer-out-of-range", ({ peerId }) => {
      this.closePeerConnection(peerId);
    });

    // 4. WebRTC Offer Received
    socket.on("webrtc:offer", async ({ from, offer }) => {
      await this.handleIncomingOffer(from, offer);
    });

    // 5. WebRTC Answer Received
    socket.on("webrtc:answer", async ({ from, answer }) => {
      await this.handleIncomingAnswer(from, answer);
    });

    // 6. WebRTC ICE Candidate Received
    socket.on("webrtc:ice-candidate", async ({ from, candidate }) => {
      await this.handleIncomingIceCandidate(from, candidate);
    });

    // 7. Remote Peer disconnected
    socket.on("user:left", (leftPeerId) => {
      this.closePeerConnection(leftPeerId);
    });
  }

  /**
   * Get or create RTCPeerConnection for a peer
   */
  async getOrCreatePeerConnection(peerId, shouldInitiateOffer = false, initialPos = {}) {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId);
    }

    const socket = getSocket();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnections.set(peerId, pc);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", {
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    // Remote audio track arrived
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteStream) {
        spatialMixer.addPeerStream(peerId, remoteStream, {
          distance: initialPos.distance || 60,
          dx: 0,
          dy: 0,
          radius: 160,
          occlusion: initialPos.occlusion || 0,
        });
      }
    };

    // Connection state logging
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.closePeerConnection(peerId);
      }
    };

    // If designated as the offerer, create and send WebRTC offer
    if (shouldInitiateOffer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", {
          to: peerId,
          offer,
        });
      } catch (err) {
        console.warn(`Failed to create WebRTC offer for ${peerId}:`, err);
      }
    }

    return pc;
  }

  /**
   * Handle incoming WebRTC Offer
   */
  async handleIncomingOffer(peerId, offer) {
    const socket = getSocket();
    const pc = await this.getOrCreatePeerConnection(peerId, false);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc:answer", {
        to: peerId,
        answer,
      });
    } catch (err) {
      console.warn(`Failed to handle incoming offer from ${peerId}:`, err);
    }
  }

  /**
   * Handle incoming WebRTC Answer
   */
  async handleIncomingAnswer(peerId, answer) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.warn(`Failed to handle incoming answer from ${peerId}:`, err);
    }
  }

  /**
   * Handle incoming WebRTC ICE Candidate
   */
  async handleIncomingIceCandidate(peerId, candidate) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Failed to add ICE candidate from ${peerId}:`, err);
    }
  }

  /**
   * Close and clean up a peer connection
   */
  closePeerConnection(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch {
        // Safe close
      }
      this.peerConnections.delete(peerId);
    }

    spatialMixer.removePeerStream(peerId);
  }

  /**
   * Toggle microphone mute
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    return this.isMuted;
  }

  /**
   * Toggle deafen (mutes all incoming peer audio)
   */
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    spatialMixer.setMasterMuted(this.isDeafened);
    return this.isDeafened;
  }

  destroy() {
    if (this.analyserInterval) clearInterval(this.analyserInterval);
    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }
}

export const webrtc = new WebRTCManager();
