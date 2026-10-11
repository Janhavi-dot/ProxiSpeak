import { useState, useRef, useCallback } from "react";
import {
  X,
  Mic,
  Square,
  Upload,
  Volume2,
  Radio,
  MapPin,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
} from "lucide-react";
import { useAuth } from "../context/useAuth.js";
import { api } from "../services/api.js";

const CATEGORIES = [
  { id: "announcement", label: "Announcement", icon: "📢", color: "#f59e0b" },
  { id: "memo", label: "Office Memo", icon: "📝", color: "#6366f1" },
  { id: "music", label: "Lounge Music", icon: "🎵", color: "#06b6d4" },
  { id: "event", label: "Company Event", icon: "🎉", color: "#ec4899" },
  { id: "discussion", label: "Open Chat", icon: "💬", color: "#10b981" },
];

export function AudioBroadcastModal({
  isOpen,
  onClose,
  userPos = { x: 220, y: 190, zone: "Modern Reception Lobby" },
  onBroadcastCreated,
  onOpenAuth,
}) {
  const { isAuthenticated, login } = useAuth();

  // Mode: "record" or "upload"
  const [mode, setMode] = useState("record");

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("announcement");
  const [radius, setRadius] = useState(120);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);

  // Status & Error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const previewAudioRef = useRef(null);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  }, [isRecording]);

  const handleReset = useCallback(() => {
    stopRecording();
    setTitle("");
    setDescription("");
    setCategory("announcement");
    setRadius(120);
    setRecordedBlob(null);
    setSelectedFile(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    setSuccess(null);
    setIsSubmitting(false);
  }, [stopRecording]);

  const handleModalClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  // 1. Microphone Recording Logic
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(audioBlob);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      setError("Microphone permission denied or device not found. You can upload an audio file instead.");
    }
  };

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // 2. File Selection Logic
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setError(null);
    }
  };

  // Quick 1-click Admin Login
  const handleQuickAdminLogin = async () => {
    try {
      setError(null);
      await login("admin@proxispeak.com", "admin123");
    } catch {
      setError("Could not sign in with demo admin credentials. Please use the Sign In modal.");
    }
  };

  // 3. Submit Broadcast
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setError("Please sign in to publish an audio broadcast.");
      return;
    }

    if (!title.trim()) {
      setError("Please provide a title for this audio broadcast.");
      return;
    }

    const audioToUpload = mode === "record" ? recordedBlob : selectedFile;
    if (!audioToUpload) {
      setError(mode === "record" ? "Please record a voice message first." : "Please select an audio file to upload.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("category", category);
      formData.append("x", Math.round(userPos.x));
      formData.append("y", Math.round(userPos.y));
      formData.append("zone", userPos.zone || "Virtual Office Desk");
      formData.append("floor", "Floor 4");
      formData.append("radius", radius);
      formData.append("duration", recordingSeconds || 15);

      const fileName = mode === "record" ? "voice_memo.webm" : selectedFile.name;
      formData.append("audio", audioToUpload, fileName);

      const response = await api.audio.upload(formData);
      setSuccess("Spatial Audio Broadcast published successfully at your desk!");

      setTimeout(() => {
        if (onBroadcastCreated && response.audio) {
          onBroadcastCreated(response.audio);
        }
        handleModalClose();
      }, 1000);
    } catch (err) {
      console.error("Audio broadcast error:", err);
      setError(err.message || "Failed to broadcast audio. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleModalClose}>
      <div className="modal-content corporate-modal broadcast-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-icon-badge">
              <Radio size={20} />
            </div>
            <div>
              <h2 className="modal-title">Broadcast Spatial Audio</h2>
              <p className="modal-subtitle">
                Anchor a voice broadcast or audio stream at your current office desk
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={handleModalClose}>
            <X size={18} />
          </button>
        </div>

        {/* Current Anchor Location Callout */}
        <div className="broadcast-anchor-card">
          <div className="anchor-icon">
            <MapPin size={16} />
          </div>
          <div className="anchor-info">
            <span className="anchor-label">Spatial Anchor Coordinate:</span>
            <strong className="anchor-zone">{userPos.zone || "Main Floor"}</strong>
            <span className="anchor-coords">
              (X: {Math.round(userPos.x)}, Y: {Math.round(userPos.y)})
            </span>
          </div>
        </div>

        {/* Auth Notice if not logged in */}
        {!isAuthenticated && (
          <div className="auth-alert-box">
            <AlertCircle size={18} className="alert-icon" />
            <div className="auth-alert-content">
              <strong>Account Authentication Required</strong>
              <p>Sign in to anchor audio broadcasts to your office profile.</p>
              <div className="auth-quick-actions">
                <button type="button" className="quick-admin-btn" onClick={handleQuickAdminLogin}>
                  Sign In as Admin (admin@proxispeak.com)
                </button>
                <button type="button" className="btn-link" onClick={onOpenAuth}>
                  Use Other Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error or Success Alerts */}
        {error && (
          <div className="alert-banner error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert-banner success">
            <CheckCircle size={16} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="broadcast-form">
          {/* Mode Tabs (Microphone vs File Upload) */}
          <div className="source-tabs-row">
            <button
              type="button"
              className={`source-tab-btn ${mode === "record" ? "active" : ""}`}
              onClick={() => setMode("record")}
            >
              <Mic size={15} />
              <span>Record Voice Note</span>
            </button>
            <button
              type="button"
              className={`source-tab-btn ${mode === "upload" ? "active" : ""}`}
              onClick={() => setMode("upload")}
            >
              <Upload size={15} />
              <span>Upload Audio File</span>
            </button>
          </div>

          {/* Recording Mode UI */}
          {mode === "record" && (
            <div className="record-stage-card">
              {!recordedBlob ? (
                <div className="record-control-panel">
                  {isRecording ? (
                    <div className="recording-active-view">
                      <div className="pulsing-record-core">
                        <span className="record-pulse-ring" />
                        <Mic size={32} color="#ffffff" />
                      </div>
                      <div className="record-timer-text">{formatTimer(recordingSeconds)}</div>
                      <p className="record-hint">Speak clearly into your microphone...</p>
                      <button
                        type="button"
                        className="btn btn-danger record-stop-btn"
                        onClick={stopRecording}
                      >
                        <Square size={16} />
                        <span>Finish Recording</span>
                      </button>
                    </div>
                  ) : (
                    <div className="record-idle-view">
                      <div className="record-mic-halo">
                        <Mic size={36} color="#4f46e5" />
                      </div>
                      <h5>Capture Live Voice Memo</h5>
                      <p className="record-idle-desc">
                        Record a voice announcement, greeting, or standup update.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary record-start-btn"
                        onClick={startRecording}
                      >
                        <Mic size={16} />
                        <span>Start Recording</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="recorded-preview-panel">
                  <div className="preview-top-row">
                    <div className="preview-file-tag">
                      <Volume2 size={16} color="#10b981" />
                      <span>Voice memo recorded ({formatTimer(recordingSeconds)})</span>
                    </div>
                    <button
                      type="button"
                      className="re-record-btn"
                      onClick={() => {
                        setRecordedBlob(null);
                        setAudioUrl(null);
                      }}
                    >
                      <RefreshCw size={13} />
                      <span>Re-record</span>
                    </button>
                  </div>

                  {audioUrl && (
                    <div className="preview-player-row">
                      <audio
                        ref={previewAudioRef}
                        src={audioUrl}
                        onEnded={() => setIsPlayingPreview(false)}
                      />
                      <button
                        type="button"
                        className="preview-play-toggle"
                        onClick={togglePreviewPlay}
                      >
                        {isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}
                        <span>{isPlayingPreview ? "Pause" : "Play Preview"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload Mode UI */}
          {mode === "upload" && (
            <div className="upload-stage-card">
              <label className="file-dropzone">
                <input
                  type="file"
                  accept="audio/mp3,audio/wav,audio/webm,audio/ogg,audio/m4a,audio/*"
                  onChange={handleFileChange}
                  className="file-hidden-input"
                />
                <div className="dropzone-inner">
                  <div className="upload-icon-circle">
                    <Upload size={28} color="#4f46e5" />
                  </div>
                  {selectedFile ? (
                    <div>
                      <strong className="selected-filename">{selectedFile.name}</strong>
                      <p className="selected-filesize">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready to publish
                      </p>
                    </div>
                  ) : (
                    <div>
                      <strong className="dropzone-text">Click to choose an audio file</strong>
                      <p className="dropzone-subtext">Supports MP3, WAV, WEBM, M4A, OGG up to 25 MB</p>
                    </div>
                  )}
                </div>
              </label>

              {audioUrl && (
                <div className="upload-preview-player">
                  <audio
                    ref={previewAudioRef}
                    src={audioUrl}
                    onEnded={() => setIsPlayingPreview(false)}
                  />
                  <button
                    type="button"
                    className="preview-play-toggle"
                    onClick={togglePreviewPlay}
                  >
                    {isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}
                    <span>{isPlayingPreview ? "Pause" : "Play Preview"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Broadcast Title */}
          <div className="form-group">
            <label className="form-label" htmlFor="broadcast-title">
              Broadcast Title *
            </label>
            <input
              id="broadcast-title"
              type="text"
              className="form-input"
              placeholder="e.g. Q4 Product Roadmap Sync, Dev Team Standup, Coffee Lounge Music"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Category Selector */}
          <div className="form-group">
            <label className="form-label">Category</label>
            <div className="category-options-grid">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  className={`category-select-chip ${category === cat.id ? "active" : ""}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span className="cat-icon">{cat.icon}</span>
                  <span className="cat-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Hearing Radius Slider */}
          <div className="form-group">
            <div className="slider-header-row">
              <label className="form-label">
                Acoustic Earshot Radius: <strong>{radius}px (~{Math.round(radius / 10)}m)</strong>
              </label>
            </div>
            <input
              type="range"
              min="60"
              max="260"
              step="10"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="corporate-slider"
            />
            <div className="slider-hints-row">
              <span>Personal Desk (60px)</span>
              <span>Room (120px)</span>
              <span>Floor Wide (260px)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions-bar">
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleModalClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary broadcast-submit-btn"
              disabled={isSubmitting || (!recordedBlob && !selectedFile)}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="spin-icon" />
                  <span>Publishing Broadcast...</span>
                </>
              ) : (
                <>
                  <Radio size={16} />
                  <span>Publish Spatial Broadcast</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
