import React from "react";

export default function ScenarioDrawer({ isOpen, onClose, scenario }) {
  if (!isOpen) return null;

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
    <div className="scenario-drawer-overlay" onClick={onClose}>
      <div className="scenario-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="scenario-drawer-header">
          <h2>Case Details</h2>
          <button className="btn-classic btn-sm" onClick={onClose}>✕</button>
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
                  <h4 className="scenario-card-section-title">Initial Readings</h4>
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
