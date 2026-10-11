import { useState } from "react";
import { useAuth } from "../context/useAuth.js";
import { User as UserIcon, LogOut, Radio, Users } from "lucide-react";

export function Navbar({
  onOpenAuth,
  liveUsersCount,
  isLiveTracking,
  onToggleLiveTracking,
  onOpenBroadcast,
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="navbar corporate-navbar">
      <div className="navbar-container">
        {/* Brand Logo & Title */}
        <div className="brand">
          <div className="logo-icon corporate-logo">
            <Radio size={22} />
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">ProxiSpeak</h1>
              <span className="hq-tag">Infotact Solutions</span>
            </div>
            <p className="brand-subtitle">Geospatial Proximity Audio Ecosystem &bull; Virtual HQ</p>
          </div>
        </div>

        {/* Live Office Presence Badge */}
        <div className="live-status-container">
          <button
            className={`live-toggle-btn ${isLiveTracking ? "active" : ""}`}
            onClick={onToggleLiveTracking}
            title={
              isLiveTracking
                ? "Live presence active (colleagues can hear and see you in the office)"
                : "Presence paused"
            }
          >
            <span className={`status-dot ${isLiveTracking ? "pulsing" : ""}`} />
            <span>{isLiveTracking ? "Audio Mesh Active" : "In Focus Mode"}</span>
            <span className="live-badge">
              <Users size={12} style={{ marginRight: 4 }} />
              {liveUsersCount} in workspace
            </span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="navbar-actions">
          {/* Prominent Broadcast Spatial Audio Button */}
          <button
            className="btn btn-primary broadcast-nav-btn"
            onClick={onOpenBroadcast}
            title="Broadcast voice note or audio stream at your current office desk"
          >
            <Radio size={16} />
            <span>Broadcast Audio</span>
          </button>

          {/* User Auth / Profile */}
          {isAuthenticated ? (
            <div className="profile-menu-container">
              <button
                className="profile-btn corporate-profile-btn"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <img
                  src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.name}`}
                  alt={user.name}
                  className="user-avatar-sm"
                />
                <span className="profile-name">{user.name}</span>
              </button>

              {dropdownOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <p className="dropdown-user-name">{user.name}</p>
                    <p className="dropdown-user-email">{user.email}</p>
                  </div>
                  <div className="dropdown-divider" />
                  <button
                    className="dropdown-item text-danger"
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-outline corporate-btn-outline" onClick={onOpenAuth}>
              <UserIcon size={16} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
