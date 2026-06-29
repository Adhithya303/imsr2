import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import useMonitorStore from "../store/monitorStore";
import WaveformCanvas from "../components/monitor/WaveformCanvas";
import VitalsPanel from "../components/monitor/VitalsPanel";
import AlarmBar from "../components/monitor/AlarmBar";
import EyesPanel from "../components/monitor/EyesPanel";
import CardiacControls from "../components/instructor/CardiacControls";
import SimulationControl from "../components/instructor/SimulationControl";
import BodyDiagram from "../components/instructor/BodyDiagram";
import ParameterDialog from "../components/dialogs/ParameterDialog";
import SetArterialBP from "../components/dialogs/SetArterialBP";
import SetSpO2 from "../components/dialogs/SetSpO2";
import SetPeripheralTemp from "../components/dialogs/SetPeripheralTemp";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";


export default function InstructorDashboard() {
  const [sessionCode, setSessionCode] = useState("");
  const [activeTab, setActiveTab] = useState("monitor");
  const [openDialog, setOpenDialog] = useState(null); // field name or null
  const [paramSpec, setParamSpec] = useState(null);
  const setFullState = useMonitorStore((s) => s.setFullState);
  const appendEvent = useMonitorStore((s) => s.appendEvent);
  const setSessionEnded = useMonitorStore((s) => s.setSessionEnded);
  const sessionEnded = useMonitorStore((s) => s.sessionEnded);
  const navigate = useNavigate();

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const role = sessionStorage.getItem("role");
    if (!token || role !== "instructor") {
      navigate("/");
      return;
    }

    // Fetch parameter spec once
    fetch(`${API}/meta/parameter-spec`)
      .then((r) => r.json())
      .then(setParamSpec)
      .catch(console.error);

    // Create or get session
    const initSession = async () => {
      const res = await fetch(`${API}/session/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSessionCode(data.session_code);
      sessionStorage.setItem("session_code", data.session_code);

      if (!socket.connected) socket.connect();
      socket.emit("join_session", { session_code: data.session_code, token });
    };

    initSession();

    const handleStateUpdate = (state) => setFullState(state);
    const handleAlarmUpdate = (data) => useMonitorStore.setState({ alarms: data.alarms });
    const handleRhythmChange = (data) => setFullState(data);
    const handleSessionEvent = (entry) => appendEvent(entry);
    const handleSessionEnded = () => setSessionEnded();
    const handleError = (data) => console.error("[SIO Error]", data.message);

    socket.on("state_update", handleStateUpdate);
    socket.on("alarm_update", handleAlarmUpdate);
    socket.on("rhythm_change", handleRhythmChange);
    socket.on("session_event", handleSessionEvent);
    socket.on("session_ended", handleSessionEnded);
    socket.on("error", handleError);

    return () => {
      socket.off("state_update", handleStateUpdate);
      socket.off("alarm_update", handleAlarmUpdate);
      socket.off("rhythm_change", handleRhythmChange);
      socket.off("session_event", handleSessionEvent);
      socket.off("session_ended", handleSessionEnded);
      socket.off("error", handleError);
    };
  }, [navigate, setFullState, appendEvent, setSessionEnded]);

  // Map vital/channel key to dialog type
  const DIALOG_MAP = {
    abp: "abp",
    ABP_sys: "abp",
    ABP_dia: "abp",
    spo2: "spo2",
    SpO2: "spo2",
    Tperi: "tperi",
    tperi: "tperi",
  };

  const handleVitalClick = useCallback((key) => {
    const mapped = DIALOG_MAP[key] || key;
    setOpenDialog(mapped);
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    socket.disconnect();
    navigate("/");
  };

  return (
    <div className="instructor-dashboard">
      {/* Session ended overlay */}
      {sessionEnded && (
        <div className="dialog-overlay" style={{ zIndex: 9999 }}>
          <div className="dialog-box" style={{ textAlign: "center", padding: 32 }}>
            <h2 style={{ color: "var(--alarm-red)", marginBottom: 16 }}>
              Session Ended
            </h2>
            <button className="btn-classic btn-ok" onClick={handleLogout}>
              Return to Login
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="instructor-topbar">
        <div className="topbar-left">
          <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
            <rect x="2" y="2" width="44" height="44" rx="4" stroke="#00FF44" strokeWidth="2" fill="none" />
            <polyline points="8,28 14,28 17,16 20,36 23,24 26,30 29,22 32,28 38,28"
              stroke="#00FF44" strokeWidth="2" fill="none" />
          </svg>
          <span className="topbar-title">AI Simulation Monitor</span>
          <span className="topbar-role">INSTRUCTOR</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-session">
            Session: <strong>{sessionCode}</strong>
          </span>
          <button className="btn-classic btn-sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="instructor-body">
        {/* Left column */}
        <div className="instructor-left">
          <SimulationControl sessionCode={sessionCode} />
        </div>

        {/* Center column */}
        <div className="instructor-center">
          <BodyDiagram onZoneClick={handleVitalClick} />
          <EyesPanel editable={true} sessionCode={sessionCode} />
        </div>

        {/* Right column — tabbed */}
        <div className="instructor-right">
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === "monitor" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("monitor")}
            >
              Patient Monitor
            </button>
            <button
              className={`tab-btn ${activeTab === "cardiac" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("cardiac")}
            >
              Cardiac Controls
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "monitor" && (
              <div className="mini-monitor">
                <AlarmBar />
                <div className="mini-monitor-body">
                  <div className="mini-waveforms">
                    <WaveformCanvas onChannelClick={handleVitalClick} />
                  </div>
                  <div className="mini-vitals">
                    <VitalsPanel onVitalClick={handleVitalClick} />
                  </div>
                </div>
              </div>
            )}
            {activeTab === "cardiac" && (
              <CardiacControls
                sessionCode={sessionCode}
                onClose={() => setActiveTab("monitor")}
              />
            )}
          </div>
        </div>
      </div>

      {/* Specialized dialogs — ABP, SpO2, Tperi */}
      {openDialog === "abp" && (
        <SetArterialBP onClose={() => setOpenDialog(null)} />
      )}
      {openDialog === "spo2" && (
        <SetSpO2 onClose={() => setOpenDialog(null)} />
      )}
      {openDialog === "tperi" && (
        <SetPeripheralTemp onClose={() => setOpenDialog(null)} />
      )}
      {/* Generic dialog for other params */}
      {openDialog && !["abp", "spo2", "tperi"].includes(openDialog) && paramSpec && (
        <ParameterDialog
          field={openDialog}
          spec={paramSpec}
          sessionCode={sessionCode}
          onClose={() => setOpenDialog(null)}
        />
      )}
    </div>
  );
}
