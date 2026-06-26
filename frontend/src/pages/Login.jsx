import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Login failed");
      }
      const data = await res.json();
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("role", data.role);
      if (data.session_code) {
        sessionStorage.setItem("session_code", data.session_code);
      }

      if (data.role === "instructor") {
        navigate("/instructor");
      } else {
        setShowSessionPrompt(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = () => {
    if (!sessionInput.trim()) {
      setError("Please enter a session code");
      return;
    }
    sessionStorage.setItem("session_code", sessionInput.trim().toUpperCase());
    navigate(`/monitor/${sessionInput.trim().toUpperCase()}`);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Decorative header bar */}
        <div className="login-header-bar">
          <div className="login-dot red"></div>
          <div className="login-dot yellow"></div>
          <div className="login-dot green"></div>
        </div>

        <div className="login-card">
          <div className="login-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="2" y="2" width="44" height="44" rx="4" stroke="#00FF44" strokeWidth="2" fill="none" />
              <polyline points="8,28 14,28 17,16 20,36 23,24 26,30 29,22 32,28 38,28"
                stroke="#00FF44" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <h1 className="login-title">AI Simulation Monitor</h1>
          <p className="login-subtitle">Medical Patient Simulator</p>

          {!showSessionPrompt ? (
            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label className="input-label">USERNAME</label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  placeholder="Enter username"
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label className="input-label">PASSWORD</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  placeholder="Enter password"
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button
                id="login-submit"
                type="submit"
                className="login-btn"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Sign In"}
              </button>
              <div className="login-hint">
                <span>Default credentials:</span>
                <code>instructor / instructor123</code>
                <code>student / student123</code>
              </div>
            </form>
          ) : (
            <div className="session-prompt">
              <p className="session-prompt-text">Enter the session code provided by your instructor:</p>
              <div className="input-group">
                <label className="input-label">SESSION CODE</label>
                <input
                  id="session-code-input"
                  type="text"
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value.toUpperCase())}
                  className="login-input session-code-input"
                  placeholder="e.g. ABC123"
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button id="join-session-btn" className="login-btn" onClick={handleJoinSession}>
                Join Session
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
