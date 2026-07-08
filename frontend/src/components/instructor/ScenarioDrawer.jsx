import React, { useState, useCallback } from "react";
import socket from "../../socket";
import useMonitorStore from "../../store/monitorStore";

export default function ScenarioDrawer({ isOpen, onClose, scenario }) {
  // Pending edits: { fieldKey: newValue } — only populated when user has changed something
  const [pendingEdits, setPendingEdits] = useState({});
  
  // Bind to live monitor store values as the baseline values
  const liveHR = useMonitorStore((s) => s.HR);
  const liveABP_sys = useMonitorStore((s) => s.ABP_sys);
  const liveABP_dia = useMonitorStore((s) => s.ABP_dia);
  const liveSpO2 = useMonitorStore((s) => s.SpO2);
  const liveRR = useMonitorStore((s) => s.avRR);
  const liveEtCO2 = useMonitorStore((s) => s.etCO2);
  const liveTblood = useMonitorStore((s) => s.Tblood);

  const updateParam = useMonitorStore((s) => s.updateParam);

  // Reset pending edits whenever the drawer closes or the scenario changes
  const handleClose = useCallback(() => {
    setPendingEdits({});
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // ----- helpers -----
  const parseReadings = (readings) => {
    if (!readings) return null;
    return typeof readings === "string" ? JSON.parse(readings) : readings;
  };

  const hasPending = Object.keys(pendingEdits).length > 0;

  const setPending = (key, value) =>
    setPendingEdits((prev) => ({ ...prev, [key]: value }));

  // Apply all pending changes at once
  const handleApplyChanges = () => {
    if (!hasPending) return;

    // Helper to emit & update local store
    const applyField = (storeKey, value) => {
      updateParam(storeKey, Number(value));
      socket.emit("update_parameter", { field: storeKey, value: Number(value) });
    };

    if ("HR" in pendingEdits) applyField("HR", pendingEdits.HR);
    if ("BP_sys" in pendingEdits) applyField("ABP_sys", pendingEdits.BP_sys);
    if ("BP_dia" in pendingEdits) applyField("ABP_dia", pendingEdits.BP_dia);
    if ("SpO2" in pendingEdits) applyField("SpO2", pendingEdits.SpO2);
    if ("RR" in pendingEdits) applyField("avRR", pendingEdits.RR);
    if ("etCO2" in pendingEdits) applyField("etCO2", pendingEdits.etCO2);
    if ("Tblood" in pendingEdits) applyField("Tblood", pendingEdits.Tblood);

    // Clear all pending edits after apply
    setPendingEdits({});
  };

  // ----- render helpers -----
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

  const renderInitialReadings = (readings) => {
    if (!readings) return null;
    const rd = parseReadings(readings);

    // Current displayed value: pending edit overrides the live monitor value
    const val = (key, liveVal) =>
      key in pendingEdits ? pendingEdits[key] : liveVal;

    const isPending = (key) => key in pendingEdits;

    const readingInput = (key, liveVal, color, label, min, max, step = 1) => (
      <div
        className={`reading-item${isPending(key) ? " reading-item--pending" : ""}`}
        style={{ color }}
      >
        <span className="reading-label">{label}</span>
        <input
          className="reading-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={val(key, liveVal)}
          onChange={(e) => setPending(key, e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );

    return (
      <div className="scenario-readings-grid">
        {rd.heartRate != null &&
          readingInput("HR", liveHR, "#00FF00", "HR", 0, 300)}

        {rd.bloodPressure && (() => {
          const bpSysKey = "BP_sys";
          const bpDiaKey = "BP_dia";
          const sysPending = isPending(bpSysKey);
          const diaPending = isPending(bpDiaKey);
          const bpPending = sysPending || diaPending;
          return (
            <div className={`reading-item reading-item--bp${bpPending ? " reading-item--pending" : ""}`} style={{ color: "#FF3333" }}>
              <span className="reading-label">BP</span>
              <div className="reading-bp-row">
                <input
                  className="reading-input reading-input--bp"
                  type="number"
                  min={40}
                  max={300}
                  value={val(bpSysKey, liveABP_sys)}
                  onChange={(e) => setPending(bpSysKey, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  title="Systolic"
                />
                <span className="reading-bp-sep">/</span>
                <input
                  className="reading-input reading-input--bp"
                  type="number"
                  min={10}
                  max={200}
                  value={val(bpDiaKey, liveABP_dia)}
                  onChange={(e) => setPending(bpDiaKey, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  title="Diastolic"
                />
              </div>
            </div>
          );
        })()}

        {rd.spo2 != null &&
          readingInput("SpO2", liveSpO2, "#FFFF00", "SpO₂ %", 0, 100)}

        {rd.respiratoryRate != null &&
          readingInput("RR", liveRR, "#00CCFF", "RR", 0, 80)}

        {rd.etco2 != null &&
          readingInput("etCO2", liveEtCO2, "#00CCFF", "etCO₂", 0, 100)}

        {rd.temperature &&
          readingInput("Tblood", liveTblood, "#CC99FF", "Temp °C", 30, 45, 0.1)}
      </div>
    );
  };

  return (
    <div className="scenario-drawer-overlay" onClick={handleClose}>
      <div className="scenario-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="scenario-drawer-header">
          <h2>Case Details</h2>
          <button className="btn-classic btn-sm" onClick={handleClose}>✕</button>
        </div>
        <div className="scenario-drawer-body">
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
                  <div className="scenario-readings-header">
                    <h4 className="scenario-card-section-title" style={{ margin: 0, border: "none", paddingBottom: 0 }}>
                      Initial Readings
                    </h4>
                    <button
                      className={`btn-apply-changes${hasPending ? " btn-apply-changes--active" : ""}`}
                      onClick={handleApplyChanges}
                      disabled={!hasPending}
                      title={hasPending ? "Apply all pending changes to the simulator" : "No changes to apply"}
                    >
                      Apply Changes
                    </button>
                  </div>
                  <div className="scenario-readings-divider" />
                  {renderInitialReadings(scenario.initial_readings)}
                </div>
              )}
            </div>
          ) : (
            <div className="scenario-empty">
              <p>No scenario loaded. Use <strong>Choose Scenario</strong> from the top bar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
