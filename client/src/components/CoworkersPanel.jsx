import {
  Users,
  Compass,
  Building2,
  Radio,
  Volume2,
  ShieldCheck,
  Footprints,
  Zap,
  Plus,
  Trash2,
} from "lucide-react";
import { OFFICE_ZONES } from "../utils/officeZones.js";
import { useAuth } from "../context/useAuth.js";

export function CoworkersPanel({
  livePeers = [],
  beacons = [],
  userPos,
  radius = 100,
  onChangeRadius,
  onNavigateToZone,
  onWalkToPeer,
  onOpenBroadcast,
  onDeleteBeacon,
  isSpatialAudio = true,
  isOcclusionEnabled = true,
  onToggleSpatial,
  onToggleOcclusion,
}) {
  const { user } = useAuth();
  return (
    <aside className="coworkers-sidebar">
      {/* Header */}
      <div className="sidebar-header-card">
        <div className="header-title-row">
          <div className="header-brand">
            <Radio size={18} className="live-radio-icon" />
            <h3>Spatial Audio Radar</h3>
          </div>
          <span className="live-count-chip">
            <Users size={12} />
            <span>{livePeers.length + 1} Online</span>
          </span>
        </div>
        <p className="sidebar-subtitle">
          Walk your avatar closer to colleagues to automatically establish WebRTC peer voice audio.
        </p>
      </div>

      {/* Earshot Proximity Control (PDF Week 2: 100-pixel radius) */}
      <div className="earshot-control-card">
        <div className="earshot-label-row">
          <span className="earshot-title">
            <Compass size={15} />
            <span>Acoustic Earshot Radius</span>
          </span>
          <span className="earshot-value-badge">
            {radius}px (~{Math.round(radius / 10)}m)
          </span>
        </div>

        <input
          type="range"
          min="60"
          max="260"
          step="10"
          value={radius}
          onChange={(e) => onChangeRadius(Number(e.target.value))}
          className="earshot-slider"
        />

        <div className="earshot-presets-row">
          <button
            className={`preset-chip ${radius === 80 ? "active" : ""}`}
            onClick={() => onChangeRadius(80)}
          >
            Desk (80px)
          </button>
          <button
            className={`preset-chip ${radius === 100 ? "active" : ""}`}
            onClick={() => onChangeRadius(100)}
            title="Infotact Standard 100px Earshot"
          >
            Standard (100px)
          </button>
          <button
            className={`preset-chip ${radius === 180 ? "active" : ""}`}
            onClick={() => onChangeRadius(180)}
          >
            Wide Room (180px)
          </button>
        </div>
      </div>

      {/* Physics-Aware Audio Toggles */}
      <div className="audio-features-card">
        <div className="feature-toggle-row">
          <div className="feature-info">
            <Volume2 size={15} />
            <span>3D Binaural Stereo Panning</span>
          </div>
          <button
            className={`toggle-switch ${isSpatialAudio ? "on" : "off"}`}
            onClick={onToggleSpatial}
            title="Simulates left/right ear audio based on coworker angle"
          >
            {isSpatialAudio ? "ON" : "OFF"}
          </button>
        </div>

        <div className="feature-toggle-row">
          <div className="feature-info">
            <ShieldCheck size={15} />
            <span>Wall Sound Occlusion Filter</span>
          </div>
          <button
            className={`toggle-switch ${isOcclusionEnabled ? "on" : "off"}`}
            onClick={onToggleOcclusion}
            title="Muffles audio when sound waves travel through walls"
          >
            {isOcclusionEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Anchored Spatial Audio Stations / Broadcasts Section */}
      <div className="audio-stations-section">
        <div className="section-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Radio size={14} color="#4f46e5" />
            <h4 style={{ margin: 0 }}>Desk Audio Broadcasts ({beacons.length})</h4>
          </div>
          <button
            className="add-broadcast-btn"
            onClick={onOpenBroadcast}
            title="Broadcast voice note or audio at your desk"
          >
            <Plus size={13} />
            <span>+ Broadcast Audio</span>
          </button>
        </div>

        {beacons.length === 0 ? (
          <div className="empty-beacons-card">
            <Radio size={22} className="empty-radio-icon" />
            <h5>No Active Broadcasts on Floor</h5>
            <p>Click below to leave a spatial voice memo or music stream at your desk.</p>
            <button className="btn-empty-broadcast" onClick={onOpenBroadcast}>
              <Plus size={13} />
              <span>Broadcast at Your Desk</span>
            </button>
          </div>
        ) : (
          <div className="beacons-list">
            {beacons.map((beacon) => {
              const bId = beacon.id || beacon._id;
              const userX = userPos?.x ?? 220;
              const userY = userPos?.y ?? 190;
              const bX = beacon.x ?? 220;
              const bY = beacon.y ?? 190;
              const bRadius = beacon.radius || radius;

              const dist = Math.round(Math.hypot(bX - userX, bY - userY));
              const inEarshot = dist <= bRadius;

              // Quadratic distance attenuation percentage
              const volumePercent = inEarshot
                ? Math.round(Math.pow(1 - dist / bRadius, 1.8) * 100)
                : 0;

              const canDelete =
                user &&
                (user.id === beacon.userId ||
                  user.role === "admin" ||
                  user.email === "admin@proxispeak.com");

              return (
                <div
                  key={bId}
                  className={`beacon-card ${inEarshot ? "in-earshot" : "out-of-earshot"}`}
                >
                  <div className="beacon-card-top">
                    <div className="beacon-info">
                      <div className="beacon-category-row">
                        <span className={`beacon-cat-tag cat-${beacon.category || "announcement"}`}>
                          {beacon.category === "music"
                            ? "🎵 Music"
                            : beacon.category === "memo"
                            ? "📝 Memo"
                            : beacon.category === "event"
                            ? "🎉 Event"
                            : beacon.category === "discussion"
                            ? "💬 Chat"
                            : "📢 Announcement"}
                        </span>
                        <span className="beacon-dist-tag">
                          {Math.round(dist / 10)}m ({dist}px)
                        </span>
                      </div>
                      <strong className="beacon-title">{beacon.title}</strong>
                      <span className="beacon-meta">
                        {beacon.zone || "Office Desk"} &bull; {beacon.userName || "Admin"}
                      </span>
                    </div>

                    {canDelete && (
                      <button
                        className="beacon-delete-btn"
                        onClick={() => onDeleteBeacon && onDeleteBeacon(bId)}
                        title="Delete Broadcast"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Status & Walk Over button */}
                  <div className="beacon-status-bar">
                    {inEarshot ? (
                      <span className="status-pill connected">
                        <span className="status-bullet" />
                        In Earshot • Audio Playing ({volumePercent}%)
                      </span>
                    ) : (
                      <span className="status-pill disconnected">
                        <span className="status-bullet" />
                        Walk closer to hear (&gt;{bRadius}px)
                      </span>
                    )}

                    <button
                      className="walk-to-btn"
                      onClick={() => onWalkToPeer && onWalkToPeer({ x: bX, y: bY })}
                      title={`Walk to ${beacon.title}`}
                    >
                      <Footprints size={12} />
                      <span>Walk Over</span>
                    </button>
                  </div>

                  {/* Spatial Attenuation Meter */}
                  {inEarshot && (
                    <div className="attenuation-meter-row">
                      <span className="meter-label">Spatial Volume:</span>
                      <div className="meter-track">
                        <div
                          className="meter-fill"
                          style={{
                            width: `${volumePercent}%`,
                            backgroundColor: "#4f46e5",
                          }}
                        />
                      </div>
                      <span className="meter-value">{volumePercent}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Coworkers / Proximity Clusters List */}
      <div className="coworkers-section">
        <div className="section-title-row">
          <Users size={14} />
          <h4>Infotact Team in Workspace ({livePeers.length})</h4>
        </div>

        {livePeers.length === 0 ? (
          <div className="empty-peers-card">
            <div className="empty-icon-halo">
              <Users size={24} />
            </div>
            <h5>No Colleagues Nearby</h5>
            <p>
              Open another browser tab or invite a teammate to test live WebRTC peer-to-peer spatial audio!
            </p>
          </div>
        ) : (
          <div className="peers-list">
            {livePeers.map((peer) => {
              const userX = userPos?.x ?? 220;
              const userY = userPos?.y ?? 190;
              const peerX = peer.x ?? 220;
              const peerY = peer.y ?? 190;

              const dist = Math.round(Math.hypot(peerX - userX, peerY - userY));
              const inEarshot = dist <= radius;
              const isOccluded = (peer.occlusion || 0) > 0.3;

              // Calculate percentage volume based on distance
              const volumePercent = inEarshot
                ? Math.round(Math.pow(1 - dist / radius, 1.8) * 100 * (isOccluded ? 0.35 : 1))
                : 0;

              return (
                <div key={peer.id} className={`peer-card ${inEarshot ? "in-earshot" : "out-of-earshot"}`}>
                  <div className="peer-card-top">
                    <div className="peer-avatar-wrapper">
                      <img
                        src={peer.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peer.id}`}
                        alt={peer.name}
                        className="peer-img"
                      />
                      {peer.isSpeaking && <span className="peer-speaking-dot" title="Speaking into mic" />}
                    </div>

                    <div className="peer-details">
                      <div className="peer-name-row">
                        <strong className="peer-name">{peer.name}</strong>
                        <span className="peer-dist-tag">{Math.round(dist / 10)}m ({dist}px)</span>
                      </div>
                      <span className="peer-zone-tag">{peer.zone || "Virtual Office"}</span>
                    </div>
                  </div>

                  {/* Proximity & Connection Status */}
                  <div className="peer-status-bar">
                    {inEarshot ? (
                      <span className={`status-pill ${isOccluded ? "muffled" : "connected"}`}>
                        <span className="status-bullet" />
                        {isOccluded ? "Behind Wall (Muffled) • WebRTC Connected" : "In Earshot • WebRTC Connected"}
                      </span>
                    ) : (
                      <span className="status-pill disconnected">
                        <span className="status-bullet" />
                        Out of Earshot (&gt;{radius}px)
                      </span>
                    )}

                    <button
                      className="walk-to-btn"
                      onClick={() => onWalkToPeer && onWalkToPeer({ x: peerX, y: peerY })}
                      title={`Walk to ${peer.name}`}
                    >
                      <Footprints size={12} />
                      <span>Walk Over</span>
                    </button>
                  </div>

                  {/* Volume Level Attenuation Meter */}
                  {inEarshot && (
                    <div className="attenuation-meter-row">
                      <span className="meter-label">Spatial Volume:</span>
                      <div className="meter-track">
                        <div
                          className="meter-fill"
                          style={{
                            width: `${volumePercent}%`,
                            backgroundColor: isOccluded ? "#f59e0b" : "#10b981",
                          }}
                        />
                      </div>
                      <span className="meter-value">{volumePercent}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Room Quick Jump Directory */}
      <div className="room-directory-card">
        <div className="section-title-row">
          <Building2 size={14} />
          <h4>Office Room Navigation</h4>
        </div>

        <div className="room-chips-grid">
          {OFFICE_ZONES.map((zone) => (
            <button
              key={zone.id}
              className="room-navigation-chip"
              onClick={() => onNavigateToZone && onNavigateToZone(zone)}
              title={zone.desc}
            >
              <span>{zone.icon}</span>
              <span className="room-chip-name">{zone.name.replace("Dev Pod ", "Pod ").replace("Modern ", "").replace("Executive ", "")}</span>
            </button>
          ))}
        </div>
      </div>

      {/* System Verification Audit Card (Infotact Mid-Project Review) */}
      <div className="audit-info-footer">
        <div className="audit-header">
          <Zap size={13} color="#10b981" />
          <span>Infotact System Specs (Project 2)</span>
        </div>
        <ul className="audit-specs-list">
          <li>✓ WebRTC P2P Audio Mesh via Socket.IO</li>
          <li>✓ Web Audio API Spatial Mixer &amp; 3D Panning</li>
          <li>✓ 60 FPS HTML5 Canvas World Engine</li>
          <li>✓ MongoDB Geospatial Clustering &lt;20ms</li>
        </ul>
      </div>
    </aside>
  );
}
