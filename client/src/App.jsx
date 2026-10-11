import { useState, useEffect, useCallback } from "react";
import { AuthProvider } from "./context/AuthContext.jsx";
import { Navbar } from "./components/Navbar.jsx";
import { OfficeCanvas } from "./components/OfficeCanvas.jsx";
import { CoworkersPanel } from "./components/CoworkersPanel.jsx";
import { AuthModal } from "./components/AuthModal.jsx";
import { AudioBroadcastModal } from "./components/AudioBroadcastModal.jsx";
import { getSocket, emitOfficeMove } from "./services/socket.js";
import { webrtc } from "./services/webrtc.js";
import { spatialMixer } from "./services/spatialAudio.js";
import { api } from "./services/api.js";
import "./App.css";

function ProxiSpeakMain() {
  // Virtual Corporate Office Coordinates (Normalized 1000 x 750 architectural space)
  const [officePos, setOfficePos] = useState({
    x: 220,
    y: 190,
    zone: "Modern Reception Lobby",
  });
  const [targetPos, setTargetPos] = useState(null);

  // Earshot Proximity Radius (Standard 100px as defined in Infotact Project 2)
  const [radius, setRadius] = useState(100);

  // WebRTC Audio & Microphone Controls
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpatialAudio, setIsSpatialAudio] = useState(true);
  const [isOcclusionEnabled, setIsOcclusionEnabled] = useState(true);

  // Live Socket & Peers State
  const [isLiveTracking, setIsLiveTracking] = useState(true);
  const [livePeers, setLivePeers] = useState([]);
  const [liveUsersCount, setLiveUsersCount] = useState(1);

  // Anchored Spatial Audio Beacons on Office Desks
  const [beacons, setBeacons] = useState([]);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // Modal Dialogs
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // 1. Initial Office Presence Broadcast & WebRTC Setup
  useEffect(() => {
    emitOfficeMove({ x: 220, y: 190, zone: "Modern Reception Lobby", radius: 100 });

    // Load active spatial audio beacons on floor
    const loadBeacons = async () => {
      try {
        const res = await api.audio.getNearby({ x: 220, y: 190, radius: 1000 });
        if (res.audios) {
          setBeacons(res.audios);
        }
      } catch (err) {
        console.warn("Could not load initial audio beacons:", err);
      }
    };
    loadBeacons();

    // Initialize WebRTC mic analyser
    webrtc.onSpeakingChange = (speaking) => {
      setIsSpeaking(speaking);
    };

    // Auto-request local microphone on first user gesture or mount
    const handleFirstGesture = () => {
      webrtc.initLocalMicrophone();
      window.removeEventListener("click", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
    window.addEventListener("click", handleFirstGesture);
    window.addEventListener("keydown", handleFirstGesture);

    return () => {
      window.removeEventListener("click", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
  }, []);

  // 2. Real-time Office Movement Handler
  const handleUserMove = useCallback((pos) => {
    setOfficePos(pos);
    if (isLiveTracking) {
      emitOfficeMove({ ...pos, radius });
    }
  }, [isLiveTracking, radius]);

  // 3. Socket.IO Real-time Events
  useEffect(() => {
    const socket = getSocket();

    socket.on("live:count", (count) => {
      setLiveUsersCount(count || 1);
    });

    socket.on("proximity:peers", (peers) => {
      setLivePeers(peers || []);
    });

    socket.on("peer:moved", (peer) => {
      setLivePeers((prev) => {
        const index = prev.findIndex((p) => p.id === peer.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...peer };
          return updated;
        }
        return [...prev, peer];
      });
    });

    socket.on("peer:speaking", ({ id, isSpeaking: speaking }) => {
      setLivePeers((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], isSpeaking: speaking };
          return updated;
        }
        return prev;
      });
    });

    socket.on("user:left", (leftId) => {
      setLivePeers((prev) => prev.filter((p) => p.id !== leftId));
    });

    socket.on("audio:created", (newAudio) => {
      setBeacons((prev) => {
        const id = newAudio.id || newAudio._id;
        const exists = prev.some((b) => (b.id || b._id) === id);
        if (exists) return prev;
        return [newAudio, ...prev];
      });
    });

    socket.on("audio:deleted", ({ id }) => {
      setBeacons((prev) => prev.filter((b) => (b.id || b._id) !== id));
    });

    return () => {
      socket.off("live:count");
      socket.off("proximity:peers");
      socket.off("peer:moved");
      socket.off("peer:speaking");
      socket.off("user:left");
      socket.off("audio:created");
      socket.off("audio:deleted");
    };
  }, []);

  // 4. Dynamic Proximity Spatial Audio Mixer for Anchored Beacons
  useEffect(() => {
    spatialMixer.syncBeacons(beacons, officePos.x, officePos.y, radius);
  }, [beacons, officePos, radius]);

  const handleBroadcastCreated = (newAudio) => {
    setBeacons((prev) => {
      const id = newAudio.id || newAudio._id;
      const exists = prev.some((b) => (b.id || b._id) === id);
      if (exists) return prev;
      return [newAudio, ...prev];
    });
  };

  const handleDeleteBeacon = async (beaconId) => {
    try {
      await api.audio.delete(beaconId);
      setBeacons((prev) => prev.filter((b) => (b.id || b._id) !== beaconId));
    } catch (err) {
      console.error("Failed to delete beacon:", err);
    }
  };

  // WebRTC Audio Toggles
  const handleToggleMute = () => {
    const muted = webrtc.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleDeafen = () => {
    const deafened = webrtc.toggleDeafen();
    setIsDeafened(deafened);
  };

  const handleToggleSpatial = () => {
    const nextSpatial = !isSpatialAudio;
    setIsSpatialAudio(nextSpatial);
    spatialMixer.setSpatialEnabled(nextSpatial);
  };

  const handleToggleOcclusion = () => {
    const nextOcclusion = !isOcclusionEnabled;
    setIsOcclusionEnabled(nextOcclusion);
    spatialMixer.setOcclusionEnabled(nextOcclusion);
  };

  return (
    <div className="proxispeak-app corporate-app">
      {/* Top Navigation */}
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        liveUsersCount={liveUsersCount}
        isLiveTracking={isLiveTracking}
        onToggleLiveTracking={() => setIsLiveTracking(!isLiveTracking)}
        onOpenBroadcast={() => setIsBroadcastOpen(true)}
      />

      {/* Main Workspace (60 FPS Canvas + Live Proximity Coworkers Panel) */}
      <main className="main-workspace corporate-workspace">
        {/* Left Side: 60 FPS HTML5 Canvas Virtual World */}
        <section className="map-panel canvas-panel-container">
          <OfficeCanvas
            userPos={officePos}
            targetPos={targetPos}
            onUserMove={handleUserMove}
            radius={radius}
            livePeers={livePeers}
            beacons={beacons}
            isSpeaking={isSpeaking}
            isMuted={isMuted}
            isDeafened={isDeafened}
            isSpatialAudio={isSpatialAudio}
            onToggleMute={handleToggleMute}
            onToggleDeafen={handleToggleDeafen}
            onToggleSpatial={handleToggleSpatial}
          />
        </section>

        {/* Right Side: Infotact Coworkers & Spatial Radar Panel */}
        <section className="feed-panel corporate-feed-panel">
          <CoworkersPanel
            livePeers={livePeers}
            beacons={beacons}
            userPos={officePos}
            radius={radius}
            onChangeRadius={setRadius}
            onNavigateToZone={(zone) => setTargetPos({ x: zone.x, y: zone.y })}
            onWalkToPeer={(pos) => setTargetPos({ x: pos.x, y: pos.y })}
            onOpenBroadcast={() => setIsBroadcastOpen(true)}
            onDeleteBeacon={handleDeleteBeacon}
            isSpatialAudio={isSpatialAudio}
            isOcclusionEnabled={isOcclusionEnabled}
            onToggleSpatial={handleToggleSpatial}
            onToggleOcclusion={handleToggleOcclusion}
          />
        </section>
      </main>

      {/* Spatial Audio Broadcast Modal */}
      <AudioBroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => setIsBroadcastOpen(false)}
        userPos={officePos}
        onBroadcastCreated={handleBroadcastCreated}
        onOpenAuth={() => {
          setIsBroadcastOpen(false);
          setIsAuthOpen(true);
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ProxiSpeakMain />
    </AuthProvider>
  );
}

export default App;
