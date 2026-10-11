import { useState } from "react";
import { useAuth } from "../context/useAuth.js";
import { X, LogIn, UserPlus, AlertCircle, KeyRound } from "lucide-react";

export function AuthModal({ isOpen, onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillAdminCredentials = () => {
    setMode("login");
    setEmail("admin@proxispeak.com");
    setPassword("admin123");
    setError("");
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-auth">
        <div className="modal-header">
          <div>
            <h3>{mode === "login" ? "Welcome Back" : "Join ProxiSpeak"}</h3>
            <p className="modal-subtitle">
              {mode === "login"
                ? "Sign in to publish voice notes and manage recordings"
                : "Create an account to start sharing geospatial audio"}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-row">
          <button
            type="button"
            className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            <LogIn size={16} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            <UserPlus size={16} />
            <span>Create Account</span>
          </button>
        </div>

        {/* Quick Fill Admin Credentials Helper */}
        <div className="admin-quick-fill-box">
          <button
            type="button"
            className="quick-fill-btn"
            onClick={fillAdminCredentials}
          >
            <KeyRound size={14} />
            <span>Quick Fill: <strong>admin@proxispeak.com</strong></span>
          </button>
        </div>

        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. Alex River"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="admin@proxispeak.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="admin123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="spinner-sm" />
                <span>Processing...</span>
              </>
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
