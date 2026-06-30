import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import useMonitorStore from "../store/monitorStore";
import { connect, disconnect } from "../engine/wsClient";
import ECGTrack from "../components/monitor/ECGTrack";
import PlethTrack from "../components/monitor/PlethTrack";
import ABPTrack from "../components/monitor/ABPTrack";
import PAPTrack from "../components/monitor/PAPTrack";
import ETCO2Track from "../components/monitor/ETCO2Track";
import { useECGStore } from "../store/ecgStore";
import VitalsPanel from "../components/monitor/VitalsPanel";
import AlarmBar from "../components/monitor/AlarmBar";
import UnifiedPanel from "../components/instructor/UnifiedPanel";
import CardiacControls from "../components/instructor/CardiacControls";
import SimulationControl from "../components/instructor/SimulationControl";
import ParameterDialog from "../components/dialogs/ParameterDialog";
import SetArterialBP from "../components/dialogs/SetArterialBP";
import SetSpO2 from "../components/dialogs/SetSpO2";
import SetPeripheralTemp from "../components/dialogs/SetPeripheralTemp";
import { getEngineRhythm } from "../utils/rhythms";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";


export default function InstructorDashboard() {
  const [sessionCode, setSessionCode] = useState("");
  const [activeTab, setActiveTab] = useState("monitor");
  const [paramSpec, setParamSpec] = useState(null);
  const [openDialog, setOpenDialog] = useState(null);
  const setFullState = useMonitorStore((s) => s.setFullState);
  const appendEvent = useMonitorStore((s) => s.appendEvent);
  const setSessionEnded = useMonitorStore((s) => s.setSessionEnded);
  const sessionEnded = useMonitorStore((s) => s.sessionEnded);
  const navigate = useNavigate();

  // Scenario state
  const [scenario, setScenario] = useState(null);
  const [scenariosList, setScenariosList] = useState([]);
  const [showScenarioModal, setShowScenarioModal] = useState(false);

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
      connect(); // Connect to simman-ecg engine
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
      disconnect(); // Disconnect simman-ecg engine
    };
  }, [navigate, setFullState, appendEvent, setSessionEnded]);

  // Sync monitor store state to ECG engine websocket
  useEffect(() => {
    const store = useMonitorStore.getState();
    const sendCommand = useECGStore.getState().sendCommand;
    if (sendCommand && store.HR !== undefined) {
      sendCommand({
        heart_rate: store.HR,
        sys_bp: store.ABP_sys,
        dia_bp: store.ABP_dia,
        pap_sys: store.PAP_sys,
        pap_dia: store.PAP_dia,
        spo2: store.SpO2,
        resp_rate: store.avRR,
        etco2: store.etCO2,
        rhythm: getEngineRhythm(store.rhythm)
      });
    }
  }, [
    useMonitorStore((s) => s.HR),
    useMonitorStore((s) => s.ABP_sys),
    useMonitorStore((s) => s.ABP_dia),
    useMonitorStore((s) => s.PAP_sys),
    useMonitorStore((s) => s.PAP_dia),
    useMonitorStore((s) => s.SpO2),
    useMonitorStore((s) => s.avRR),
    useMonitorStore((s) => s.etCO2),
    useMonitorStore((s) => s.rhythm)
  ]);

  // Scenario socket listeners
  useEffect(() => {
    const handleScenarioSelected = (data) => {
      setScenario(data);
    };
    const handleScenariosList = (list) => {
      setScenariosList(list);
      setShowScenarioModal(true);
    };
    socket.on("scenario_selected", handleScenarioSelected);
    socket.on("scenarios_list", handleScenariosList);
    return () => {
      socket.off("scenario_selected", handleScenarioSelected);
      socket.off("scenarios_list", handleScenariosList);
    };
  }, []);

  const requestRandomScenario = () => {
    socket.emit("request_random_scenario");
  };

  const openScenarioList = () => {
    socket.emit("list_scenarios");
  };

  const selectScenario = (id) => {
    socket.emit("select_scenario", { scenario_id: id });
    setShowScenarioModal(false);
  };

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

  const handleLogout = async () => {
    // End the session before logging out so a new session starts next time
    if (sessionCode) {
      const token = sessionStorage.getItem("token");
      try {
        await fetch(
          `${API}/session/${sessionCode}/end`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.error("Failed to end session on logout", e);
      }
    }
    sessionStorage.clear();
    socket.disconnect();
    navigate("/");
  };

  // Helper to render patient details from scenario JSON
  const renderPatientDetails = (details) => {
    if (!details) return null;
    const pd = typeof details === "string" ? JSON.parse(details) : details;
    return (
      <div className="scenario-patient-details">
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Name</span>
          <span className="scenario-detail-value">{pd.patientName}</span>
        </div>
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Age / Gender</span>
          <span className="scenario-detail-value">{pd.age} / {pd.gender}</span>
        </div>
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Blood Group</span>
          <span className="scenario-detail-value">{pd.bloodGroup}</span>
        </div>
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Height / Weight</span>
          <span className="scenario-detail-value">{pd.heightCm}cm / {pd.weightKg}kg</span>
        </div>
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Chief Complaint</span>
          <span className="scenario-detail-value">{pd.chiefComplaint}</span>
        </div>
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Diagnosis</span>
          <span className="scenario-detail-value">{pd.diagnosis}</span>
        </div>
        {pd.medicalHistory && pd.medicalHistory.length > 0 && (
          <div className="scenario-detail-row">
            <span className="scenario-detail-label">History</span>
            <span className="scenario-detail-value">{pd.medicalHistory.join(", ")}</span>
          </div>
        )}
        {pd.allergies && pd.allergies.filter(a => a !== "None").length > 0 && (
          <div className="scenario-detail-row">
            <span className="scenario-detail-label">Allergies</span>
            <span className="scenario-detail-value">{pd.allergies.join(", ")}</span>
          </div>
        )}
        <div className="scenario-detail-row">
          <span className="scenario-detail-label">Triage</span>
          <span className="scenario-detail-value" style={{
            color: pd.triageLevel === "Emergency" ? "var(--alarm-red)" : "var(--alarm-gold)"
          }}>{pd.triageLevel}</span>
        </div>
      </div>
    );
  };

  // Helper to render symptoms
  const renderSymptoms = (symptoms) => {
    if (!symptoms) return null;
    const symp = typeof symptoms === "string" ? JSON.parse(symptoms) : symptoms;
    const activeSymptoms = Object.entries(symp).filter(([, v]) => v === true);
    if (activeSymptoms.length === 0) return <span style={{ color: "#666" }}>None</span>;
    return (
      <div className="scenario-symptoms-list">
        {activeSymptoms.map(([key]) => (
          <span key={key} className="scenario-symptom-tag">
            {key.replace(/([A-Z])/g, " $1").trim()}
          </span>
        ))}
      </div>
    );
  };

  // Helper to render initial readings (instructor only)
  const renderInitialReadings = (readings) => {
    if (!readings) return null;
    const rd = typeof readings === "string" ? JSON.parse(readings) : readings;
    return (
      <div className="scenario-readings-grid">
        {rd.heartRate != null && (
          <div className="reading-item" style={{ color: "#00FF00" }}>
            <span className="reading-label">HR</span>
            <span className="reading-value">{rd.heartRate}</span>
          </div>
        )}
        {rd.bloodPressure && (
          <div className="reading-item" style={{ color: "#FF3333" }}>
            <span className="reading-label">BP</span>
            <span className="reading-value">{rd.bloodPressure.systolic}/{rd.bloodPressure.diastolic}</span>
          </div>
        )}
        {rd.spo2 != null && (
          <div className="reading-item" style={{ color: "#FFFF00" }}>
            <span className="reading-label">SpO₂</span>
            <span className="reading-value">{rd.spo2}%</span>
          </div>
        )}
        {rd.respiratoryRate != null && (
          <div className="reading-item" style={{ color: "#00CCFF" }}>
            <span className="reading-label">RR</span>
            <span className="reading-value">{rd.respiratoryRate}</span>
          </div>
        )}
        {rd.etco2 != null && (
          <div className="reading-item" style={{ color: "#00CCFF" }}>
            <span className="reading-label">etCO₂</span>
            <span className="reading-value">{rd.etco2}</span>
          </div>
        )}
        {rd.temperature && (
          <div className="reading-item" style={{ color: "#CC99FF" }}>
            <span className="reading-label">Temp</span>
            <span className="reading-value">{rd.temperature.bloodTemperature}°C</span>
          </div>
        )}
      </div>
    );
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

      {/* Scenario selection modal */}
      {showScenarioModal && (
        <div className="dialog-overlay" style={{ zIndex: 10000 }}>
          <div className="scenario-modal">
            <div className="scenario-modal-header">
              <h2>Select Scenario</h2>
              <button className="btn-classic btn-sm" onClick={() => setShowScenarioModal(false)}>✕</button>
            </div>
            <div className="scenario-modal-list">
              {scenariosList.map((sc) => {
                const pd = typeof sc.patient_details === "string" ? JSON.parse(sc.patient_details) : sc.patient_details;
                return (
                  <div
                    key={sc.id}
                    className={`scenario-modal-item ${scenario?.id === sc.id ? "scenario-modal-item-active" : ""}`}
                    onClick={() => selectScenario(sc.id)}
                  >
                    <div className="scenario-modal-item-name">{sc.name}</div>
                    <div className="scenario-modal-item-meta">
                      {pd?.age} / {pd?.gender} — {pd?.diagnosis}
                    </div>
                  </div>
                );
              })}
            </div>
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

        {/* Right column — tabbed */}
        <div className="instructor-right">
          <UnifiedPanel scenarioContent={
            <>
              <div className="scenario-panel-header">
                <span className="scenario-panel-title">📋 Scenario</span>
                <div className="scenario-panel-actions">
                  <button className="btn-classic btn-sm" onClick={requestRandomScenario}>
                    🎲 Random
                  </button>
                  <button className="btn-classic btn-sm" onClick={openScenarioList}>
                    📄 Choose
                  </button>
                </div>
              </div>

              {scenario ? (
                <div className="scenario-card-full">
                  <div className="scenario-card-section">
                    <h4 className="scenario-card-section-title">Patient Details</h4>
                    {renderPatientDetails(scenario.patient_details)}
                  </div>
                  <div className="scenario-card-section">
                    <h4 className="scenario-card-section-title">Symptoms</h4>
                    {renderSymptoms(scenario.symptoms)}
                  </div>
                  {scenario.initial_readings && (
                    <div className="scenario-card-section">
                      <h4 className="scenario-card-section-title">Initial Readings</h4>
                      {renderInitialReadings(scenario.initial_readings)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="scenario-empty">
                  <p>No scenario loaded. Click <strong>🎲 Random</strong> or <strong>📄 Choose</strong> to select one.</p>
                </div>
              )}
            </>
          } />
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
