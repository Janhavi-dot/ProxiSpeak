import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, Mic, MicOff, Headphones, Compass, ShieldCheck } from "lucide-react";
import { OFFICE_ZONES, getOfficeZone } from "../utils/officeZones.js";

export function OfficeCanvas({
  userPos,
  targetPos,
  onUserMove,
  radius = 100,
  livePeers = [],
  beacons = [],
  isSpeaking = false,
  isMuted = false,
  isDeafened = false,
  isSpatialAudio = true,
  onToggleMute,
  onToggleDeafen,
  onToggleSpatial,
}) {
  const canvasRef = useRef(null);
  const [currentZone, setCurrentZone] = useState(userPos?.zone || "Modern Reception Lobby");
  const [fps, setFps] = useState(60);

  const posRef = useRef(userPos || { x: 220, y: 190 });
  const targetRef = useRef(null);
  const keysRef = useRef({});
  const bgImageRef = useRef(null);
  const radarAngleRef = useRef(0);

  // Load office floor plan background image
  useEffect(() => {
    const img = new Image();
    img.src = "/office_floorplan.png";
    img.onload = () => {
      bgImageRef.current = img;
    };
  }, []);

  // Sync position when parent coordinates change
  useEffect(() => {
    if (userPos && (userPos.x !== posRef.current.x || userPos.y !== posRef.current.y)) {
      posRef.current = { x: userPos.x, y: userPos.y };
      const zone = getOfficeZone(userPos.x, userPos.y);
      setCurrentZone(zone);
    }
  }, [userPos]);

  // Sync target navigation without triggering cascading renders
  useEffect(() => {
    if (targetPos && targetPos.x !== undefined && targetPos.y !== undefined) {
      targetRef.current = { x: targetPos.x, y: targetPos.y };
    }
  }, [targetPos]);

  // Keyboard navigation & 60 FPS Canvas rendering loop
  useEffect(() => {
    let animId;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const handleKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        keysRef.current[k] = true;
        targetRef.current = null;
      }
    };

    const handleKeyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const speed = 4.5;
    let lastEmit = 0;

    const renderLoop = (timestamp) => {
      // 1. Calculate FPS
      frameCount++;
      if (timestamp - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (timestamp - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = timestamp;
      }

      // 2. Kinematics & Movement
      const k = keysRef.current;
      let moved = false;
      let dx = 0;
      let dy = 0;

      if (k.arrowup || k.w) dy -= speed;
      if (k.arrowdown || k.s) dy += speed;
      if (k.arrowleft || k.a) dx -= speed;
      if (k.arrowright || k.d) dx += speed;

      const clickTarget = targetRef.current;

      if (dx !== 0 || dy !== 0) {
        moved = true;
        posRef.current.x = Math.max(50, Math.min(950, posRef.current.x + dx));
        posRef.current.y = Math.max(50, Math.min(710, posRef.current.y + dy));
      } else if (clickTarget) {
        const dist = Math.hypot(clickTarget.x - posRef.current.x, clickTarget.y - posRef.current.y);
        if (dist > speed) {
          const angle = Math.atan2(clickTarget.y - posRef.current.y, clickTarget.x - posRef.current.x);
          posRef.current.x += Math.cos(angle) * speed;
          posRef.current.y += Math.sin(angle) * speed;
          moved = true;
        } else {
          posRef.current.x = clickTarget.x;
          posRef.current.y = clickTarget.y;
          targetRef.current = null;
          moved = true;
        }
      }

      if (moved && timestamp - lastEmit > 40) {
        lastEmit = timestamp;
        const newZone = getOfficeZone(posRef.current.x, posRef.current.y);
        setCurrentZone(newZone);
        onUserMove({ x: posRef.current.x, y: posRef.current.y, zone: newZone });
      }

      // 3. Render Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;

        // Clear Canvas
        ctx.clearRect(0, 0, w, h);

        // Draw Floor Plan Background Image
        if (bgImageRef.current) {
          ctx.drawImage(bgImageRef.current, 0, 0, w, h);
        } else {
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(0, 0, w, h);
        }

        // Draw Click-to-Move Target Path
        const target = targetRef.current;
        if (target) {
          ctx.save();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(posRef.current.x, posRef.current.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();

          // Target ripple marker
          const ripple = (timestamp % 1000) / 1000;
          ctx.beginPath();
          ctx.arc(target.x, target.y, 6 + ripple * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${1 - ripple})`;
          ctx.stroke();
          ctx.restore();
        }

        // Draw Acoustic Sound Propagation Rays to Nearby Peers
        livePeers.forEach((peer) => {
          if (!peer.x || !peer.y) return;
          const dist = Math.hypot(peer.x - posRef.current.x, peer.y - posRef.current.y);
          if (dist <= radius) {
            ctx.save();
            const isOccluded = (peer.occlusion || 0) > 0.3;
            ctx.strokeStyle = isOccluded ? "rgba(245, 158, 11, 0.75)" : "rgba(99, 102, 241, 0.7)";
            ctx.lineWidth = 1.8;
            if (isOccluded) ctx.setLineDash([4, 4]);

            ctx.beginPath();
            ctx.moveTo(posRef.current.x, posRef.current.y);
            ctx.lineTo(peer.x, peer.y);
            ctx.stroke();

            // Distance midpoint pill
            const midX = (posRef.current.x + peer.x) / 2;
            const midY = (posRef.current.y + peer.y) / 2;
            ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
            ctx.fillRect(midX - 22, midY - 9, 44, 18);
            ctx.fillStyle = isOccluded ? "#f59e0b" : "#a5b4fc";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${Math.round(dist / 10)}m`, midX, midY);
            ctx.restore();
          }
        });

        // Draw Acoustic Earshot Radar Circle (100px Standard as in PDF)
        const px = posRef.current.x;
        const py = posRef.current.y;
        radarAngleRef.current += 0.03;

        ctx.save();
        const grad = ctx.createRadialGradient(px, py, 10, px, py, radius);
        grad.addColorStop(0, "rgba(99, 102, 241, 0.24)");
        grad.addColorStop(0.7, "rgba(99, 102, 241, 0.07)");
        grad.addColorStop(1, "rgba(99, 102, 241, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();

        // Dashed boundary ring
        ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating acoustic radar sweep beam
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, radius, radarAngleRef.current, radarAngleRef.current + 0.35);
        ctx.closePath();
        ctx.fillStyle = "rgba(99, 102, 241, 0.16)";
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // Draw Spatial Audio Beacons Anchored on Desks
        beacons.forEach((beacon) => {
          if (beacon.x === undefined || beacon.y === undefined) return;
          const bx = beacon.x;
          const by = beacon.y;
          const bDist = Math.hypot(bx - px, by - py);
          const bRadius = beacon.radius || radius;
          const inRange = bDist <= bRadius;

          ctx.save();
          let categoryColor = "#f59e0b";
          if (beacon.category === "memo") categoryColor = "#6366f1";
          else if (beacon.category === "music") categoryColor = "#06b6d4";
          else if (beacon.category === "event") categoryColor = "#ec4899";
          else if (beacon.category === "discussion") categoryColor = "#10b981";

          // 1. Audible broadcast zone circle
          ctx.beginPath();
          ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
          ctx.strokeStyle = inRange ? `${categoryColor}99` : "rgba(148, 163, 184, 0.3)";
          ctx.lineWidth = inRange ? 1.5 : 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();

          // 2. In-range soundwave ripples
          if (inRange) {
            const wave = (timestamp % 1200) / 1200;
            ctx.beginPath();
            ctx.arc(bx, by, 12 + wave * (bRadius * 0.7), 0, Math.PI * 2);
            ctx.strokeStyle = categoryColor;
            ctx.lineWidth = 1.6;
            ctx.setLineDash([]);
            ctx.stroke();

            // Connecting acoustic beam
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `${categoryColor}66`;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
          }

          // 3. Beacon Speaker Node
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(bx, by, 10, 0, Math.PI * 2);
          ctx.fillStyle = categoryColor;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ffffff";
          ctx.shadowColor = categoryColor;
          ctx.shadowBlur = inRange ? 12 : 4;
          ctx.stroke();

          // Radio dot center
          ctx.beginPath();
          ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();

          // 4. Beacon Label Tag
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          const beaconTag = `📻 ${beacon.title?.slice(0, 16) || "Broadcast"} (${Math.round(bDist / 10)}m)`;
          const btw = ctx.measureText(beaconTag).width;
          ctx.fillRect(bx - btw / 2 - 5, by + 13, btw + 10, 15);
          ctx.fillStyle = inRange ? "#38bdf8" : "#cbd5e1";
          ctx.fillText(beaconTag, bx, by + 24);

          ctx.restore();
        });

        // Draw Remote Colleagues
        livePeers.forEach((peer) => {
          if (!peer.x || !peer.y) return;
          const peerDist = Math.hypot(peer.x - px, peer.y - py);
          const inEarshot = peerDist <= radius;

          ctx.save();
          // Active speaking wave indicator
          if (peer.isSpeaking) {
            const speakWave = (timestamp % 800) / 800;
            ctx.beginPath();
            ctx.arc(peer.x, peer.y, 14 + speakWave * 12, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Colleague Core Avatar
          ctx.beginPath();
          ctx.arc(peer.x, peer.y, 11, 0, Math.PI * 2);
          ctx.fillStyle = inEarshot ? "#38bdf8" : "#64748b";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = inEarshot ? "#ffffff" : "#94a3b8";
          ctx.stroke();

          // Colleague Name & Status Tag
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          const tag = `${peer.name.split("-")[0]} (${Math.round(peerDist / 10)}m)`;
          const tw = ctx.measureText(tag).width;
          ctx.fillRect(peer.x - tw / 2 - 4, peer.y + 14, tw + 8, 14);
          ctx.fillStyle = inEarshot ? "#38bdf8" : "#94a3b8";
          ctx.fillText(tag, peer.x, peer.y + 24);

          ctx.restore();
        });

        // Draw Current User Avatar
        ctx.save();
        if (isSpeaking && !isMuted) {
          const wave = (timestamp % 600) / 600;
          ctx.beginPath();
          ctx.arc(px, py, 14 + wave * 16, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Glowing outer halo
        ctx.beginPath();
        ctx.arc(px, py, 15, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99, 102, 241, 0.35)";
        ctx.fill();

        // User Core Avatar
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, Math.PI * 2);
        ctx.fillStyle = isMuted ? "#ef4444" : "#4f46e5";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#ffffff";
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Status dot
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isMuted ? "#fee2e2" : isSpeaking ? "#10b981" : "#ffffff";
        ctx.fill();

        // User Tag
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        const selfTag = `You (${currentZone.split(" ")[0]})`;
        const stw = ctx.measureText(selfTag).width;
        ctx.fillRect(px - stw / 2 - 6, py + 16, stw + 12, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(selfTag, px, py + 28);

        ctx.restore();
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onUserMove, livePeers, beacons, radius, isSpeaking, isMuted, currentZone]);

  // Click-to-Move on Canvas
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = 1000 / rect.width;
    const scaleY = 750 / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    targetRef.current = {
      x: Math.max(50, Math.min(950, clickX)),
      y: Math.max(50, Math.min(710, clickY)),
    };
  };

  const navigateToZone = useCallback((zone) => {
    targetRef.current = { x: zone.x, y: zone.y };
  }, []);

  return (
    <div className="office-canvas-stage">
      {/* Top Corporate Status Header */}
      <div className="canvas-header-bar">
        <div className="zone-pill-indicator">
          <span className={`live-pulse-dot ${isSpeaking ? "speaking" : ""}`} />
          <span className="zone-prefix">Current Location:</span>
          <strong>{currentZone}</strong>
        </div>

        {/* Room Quick Jump Pills */}
        <div className="room-jump-pills-row">
          {OFFICE_ZONES.slice(0, 5).map((z) => (
            <button
              key={z.id}
              className={`jump-pill-btn ${currentZone === z.name ? "active" : ""}`}
              onClick={() => navigateToZone(z)}
              title={z.desc}
            >
              <span>{z.icon}</span>
              <span>{z.name.replace("Dev Pod ", "Pod ").replace("Modern ", "").replace("Executive ", "")}</span>
            </button>
          ))}
        </div>

        {/* Performance & Audio Mode Badges */}
        <div className="header-meta-badges">
          <span className="fps-counter-badge" title="Canvas Rendering Performance">
            ⚡ {fps} FPS
          </span>
          <span className={`spatial-status-badge ${isSpatialAudio ? "active" : ""}`}>
            <Compass size={12} />
            <span>3D Spatial WebRTC</span>
          </span>
        </div>
      </div>

      {/* Main 60 FPS HTML5 Canvas Viewport */}
      <div className="canvas-viewport-wrapper">
        <canvas
          ref={canvasRef}
          width={1000}
          height={750}
          className="office-html5-canvas"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Interactive Audio Controls Bar */}
      <div className="canvas-audio-controls-bar">
        <div className="audio-tools-left">
          {/* Mic Toggle Button */}
          <button
            className={`tool-btn ${isMuted ? "btn-danger" : "btn-success"}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            <span>{isMuted ? "Mic Muted" : isSpeaking ? "Speaking..." : "Mic Live"}</span>
          </button>

          {/* Deafen Toggle Button */}
          <button
            className={`tool-btn ${isDeafened ? "btn-danger" : "btn-subtle"}`}
            onClick={onToggleDeafen}
            title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
          >
            <Headphones size={16} />
            <span>{isDeafened ? "Deafened" : "Hearing Active"}</span>
          </button>

          {/* Spatial 3D Audio Toggle */}
          <button
            className={`tool-btn ${isSpatialAudio ? "btn-active" : "btn-subtle"}`}
            onClick={onToggleSpatial}
            title="Toggle 3D Stereo Audio Panning"
          >
            <Volume2 size={16} />
            <span>Spatial Audio {isSpatialAudio ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="audio-tools-right">
          <span className="control-helper-text">
            ⌨️ <strong>WASD / Arrows:</strong> Walk &bull; 🖱️ <strong>Click:</strong> Direct Path
          </span>
          <span className="earshot-indicator-tag">
            <ShieldCheck size={13} color="#10b981" />
            <span>Earshot: <strong>{Math.round(radius / 10)}m ({radius}px)</strong></span>
          </span>
        </div>
      </div>
    </div>
  );
}
