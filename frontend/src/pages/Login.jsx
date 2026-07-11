import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = (
  import.meta.env.VITE_BACKEND_URL || "https://imsr2-a3xs.onrender.com"
).replace(/\/+$/, "");

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

  const handleJoinSession = async () => {
    if (!sessionInput.trim()) {
      setError("Please enter a session code");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      // Authenticate as default student to get token
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "student", password: "student123" }),
      });
      if (!res.ok) {
        throw new Error("Student authentication failed. Backend might be down.");
      }
      const data = await res.json();
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("role", data.role);
      sessionStorage.setItem("session_code", sessionInput.trim().toUpperCase());
      
      navigate(`/monitor/${sessionInput.trim().toUpperCase()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Decorative header bar */}
       

        <div className="login-card">
          <div className="login-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="2" y="2" width="44" height="44" rx="4" stroke="#1a56db" strokeWidth="2" fill="none" />
              <polyline points="8,28 14,28 17,16 20,36 23,24 26,30 29,22 32,28 38,28"
                stroke="#1a56db" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <h1 className="login-title">VITALIS</h1>
          {/* <p className="login-subtitle">SIMULATION SYSTEMS V2.4</p> */}

          {!showSessionPrompt ? (
            <form onSubmit={handleLogin} className="login-form">
              {/* Access Control header */}
              <div style={{ marginBottom: 4 }}>
               
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Sign In</div>
              </div>

              <div className="input-group">
                <label className="input-label">
                  <svg style={{ display:"inline",verticalAlign:"middle",marginRight:5 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                  INSTRUCTOR ID / EMAIL
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  placeholder="Enter credentials..."
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label className="input-label">
                  <svg style={{ display:"inline",verticalAlign:"middle",marginRight:5 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  PASSWORD
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  placeholder="••••••••"
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              
              <button
                id="login-submit"
                type="submit"
                className="login-btn"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "AUTHENTICATE SYSTEM →"}
              </button>
              
              {/* Footer row */}
             
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:4 }}>
                {/* <span style={{ fontSize:11, color:"#1a56db", cursor:"pointer", fontWeight:600 }}>FORGOT PASSWORD?</span> */}
               
              </div>

              {/* Divider + Student button */}
              <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0" }}>
                <div style={{ flex:1,height:1,background:"#e5e7eb" }}></div>
                <span style={{ fontSize:11, color:"#9ca3af" }}>OR</span>
                <div style={{ flex:1,height:1,background:"#e5e7eb" }}></div>
              </div>
              <button type="button" className="login-btn"
                style={{ background:"#fff", color:"#374151", border:"1.5px solid #d1d5db",
                  boxShadow:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                onClick={() => { setShowSessionPrompt(true); setError(""); }}
              >
                {/* <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> */}
                REMOTE ACCESS PORTAL
              </button>

              {/* <div style={{ textAlign:"center", fontSize:11, color:"#ef4444", marginTop:2 }}>
                Unauthorized access to clinical simulation<br/>environments is strictly prohibited.
              </div> */}
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
              <button id="join-session-btn" className="login-btn" style={{ marginTop:8 }} onClick={handleJoinSession} disabled={loading}>
                {loading ? "AUTHENTICATING..." : "JOIN SESSION →"}
              </button>
              <button type="button" className="login-btn"
                style={{ marginTop:8, background:"#fff", color:"#374151", border:"1.5px solid #d1d5db", boxShadow:"none" }}
                onClick={() => { setShowSessionPrompt(false); setError(""); }}
              >
                ← Back to Sign In
              </button>
            </div>
          )}

          {/* Bottom security footer */}
          {!showSessionPrompt && (
            <div style={{ display:"flex", justifyContent:"center", gap:24, marginTop:14, fontSize:11, color:"#9ca3af" }}>
              <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                SECURE NODE
              </span>
              <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                DATA ENCRYPTED
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
