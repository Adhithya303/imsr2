import { useState, useEffect } from "react";
import { useECGStore } from "../../store/ecgStore";
import useMonitorStore from "../../store/monitorStore";
import socket from "../../socket";
import { RHYTHM_INTELLIGENCE } from "../../types/ecgState";
import { ENGINE_RHYTHM_OPTIONS, getEngineRhythm, getMonitorRhythmLabel } from "../../utils/rhythms";

/**
 * InstructorParameterModal
 *
 * Props:
 *   field        — which parameter to show controls for
 *   onClose      — called when dialog should close (Cancel or ✕)
 *
 * Optional (pending-mode) props:
 *   pendingMode    — when true, suppress all live emits; only commit on Apply
 *   initialValues  — seed local state with previously-staged values (re-open continuity)
 *   onApply        — (stagedValues: object) => void  — called on Apply in pending mode
 */
export default function InstructorParameterModal({
  field,
  onClose,
  pendingMode = false,
  initialValues = {},
  onApply,
}) {
  // ── Monitor Store ──────────────────────────────────────────────────────────
  const rhythm = useMonitorStore((s) => s.rhythm);
  const updateParam = useMonitorStore((s) => s.updateParam);

  // ── ECG Store ──────────────────────────────────────────────────────────────
  const ecgState    = useECGStore((s) => s.ecgState);
  const heartRate   = useECGStore((s) => s.heartRate);
  const targetSpO2  = useECGStore((s) => s.spo2);
  const sysBP       = useECGStore((s) => s.sysBP);
  const diaBP       = useECGStore((s) => s.diaBP);
  const papSys      = useECGStore((s) => s.papSys);
  const papDia      = useECGStore((s) => s.papDia);
  const targetEtco2 = useECGStore((s) => s.etco2);
  const respRate    = useECGStore((s) => s.respRate);
  const transferTime = useECGStore((s) => s.transferTime);
  const transferFn  = useECGStore((s) => s.transferFn);
  const sendCommand = useECGStore((s) => s.sendCommand);
  const ecgRhythm   = useECGStore((s) => s.rhythm);

  // ── Local working state (always used; in live-mode mirrors store) ──────────
  const [localHR, setLocalHR]           = useState(() => initialValues.HR   ?? heartRate);
  const [localSpO2, setLocalSpO2]       = useState(() => initialValues.SpO2 ?? targetSpO2);
  const [localSysBP, setLocalSysBP]     = useState(() => initialValues.BP_sys ?? sysBP);
  const [localDiaBP, setLocalDiaBP]     = useState(() => initialValues.BP_dia ?? diaBP);
  const [localPapSys, setLocalPapSys]   = useState(() => initialValues.PAP_sys ?? papSys);
  const [localPapDia, setLocalPapDia]   = useState(() => initialValues.PAP_dia ?? papDia);
  const [localEtco2, setLocalEtco2]     = useState(() => initialValues.etCO2 ?? targetEtco2);
  const [localRR, setLocalRR]           = useState(() => initialValues.RR    ?? respRate);
  const [localTblood, setLocalTblood]   = useState(() => initialValues.Tblood ?? useMonitorStore.getState().Tblood ?? 37.0);
  const [localRhythm, setLocalRhythm]   = useState(() => initialValues.rhythm ?? getEngineRhythm(rhythm || ecgRhythm));
  const [localTransferTime, setLocalTransferTime] = useState(transferTime);
  const [localTransferFn, setLocalTransferFn]     = useState(transferFn);

  const [stElev, setStElev]             = useState(0);
  const [stDepr, setStDepr]             = useState(0);
  const [artifactLevel, setArtifactLevel] = useState(0);
  const [artifactType, setArtifactType]   = useState("NONE");

  // Seed ST / artifact from ecgState once
  useEffect(() => {
    if (!ecgState) return;
    setStElev(ecgState.st_elevation ?? 0);
    setStDepr(ecgState.st_depression ?? 0);
    setArtifactLevel(ecgState.artifact_level ?? 0);
    setArtifactType(ecgState.artifact_type ?? "NONE");
  }, [ecgState]);

  // ── Rhythm profile for HR bounds ──────────────────────────────────────────
  const rhythmProfile = RHYTHM_INTELLIGENCE[localRhythm];
  const hrMin         = rhythmProfile?.hrMin ?? 0;
  const hrMax         = rhythmProfile?.hrMax ?? 300;
  const hrControlMax  = hrMax === 0 ? 1 : hrMax;

  // ── Helpers ───────────────────────────────────────────────────────────────
  /**
   * In live mode: immediately emit to monitor store + ECG engine.
   * In pending mode: only update local state (no emit).
   */
  const liveEmitMonitorParam = (f, value) => {
    if (pendingMode) return; // suppress in pending mode
    updateParam(f, value);
    socket.emit("update_parameter", { field: f, value });
  };

  const liveSendVital = (update) => {
    if (pendingMode) return;
    sendCommand({ ...update, transfer_time: localTransferTime, transfer_fn: localTransferFn });
  };

  // ── Change handlers ───────────────────────────────────────────────────────
  const handleHRChange = (value) => {
    const next = Math.max(hrMin, Math.min(value, hrControlMax));
    setLocalHR(next);
    liveEmitMonitorParam("HR", next);
    liveSendVital({ heart_rate: next });
  };

  const handleRhythmSelect = (e) => {
    const engineRhythm  = e.target.value;
    const monitorRhythm = getMonitorRhythmLabel(engineRhythm);
    const profile       = RHYTHM_INTELLIGENCE[engineRhythm];
    let   nextHR        = localHR;

    if (profile?.hrMax === 0) {
      nextHR = 0;
    } else if (profile && (localHR < profile.hrMin || localHR > profile.hrMax)) {
      nextHR = profile.defaultHr;
    }

    setLocalRhythm(engineRhythm);
    if (nextHR !== localHR) setLocalHR(nextHR);

    if (!pendingMode) {
      updateParam("rhythm", monitorRhythm);
      socket.emit("update_rhythm", { rhythm: monitorRhythm });
      if (nextHR !== localHR) liveEmitMonitorParam("HR", nextHR);
    }
  };

  const handleSTChange = (elev, depr) => {
    setStElev(elev);
    setStDepr(depr);
    if (!pendingMode) {
      sendCommand({ st_elevation: elev, st_depression: depr, transfer_time: localTransferTime, transfer_fn: localTransferFn });
    }
  };

  const handleArtifactChange = (level, type) => {
    setArtifactLevel(level);
    setArtifactType(type);
    if (!pendingMode) {
      sendCommand({ artifact_level: level, artifact_type: type });
    }
  };

  const handleSpO2Change = (value) => {
    const next = Math.max(0, Math.min(value, 100));
    setLocalSpO2(next);
    liveEmitMonitorParam("SpO2", next);
    liveSendVital({ spo2: next });
  };

  const handleSysBPChange = (value) => {
    const next = Math.max(localDiaBP + 1, Math.min(value, 300));
    setLocalSysBP(next);
    liveEmitMonitorParam("ABP_sys", next);
    liveSendVital({ sys_bp: next });
  };

  const handleDiaBPChange = (value) => {
    const next = Math.max(0, Math.min(value, localSysBP - 1));
    setLocalDiaBP(next);
    liveEmitMonitorParam("ABP_dia", next);
    liveSendVital({ dia_bp: next });
  };

  const handlePapSysChange = (value) => {
    const next = Math.max(localPapDia + 0.5, Math.min(value, 100));
    setLocalPapSys(next);
    liveEmitMonitorParam("PAP_sys", next);
    liveSendVital({ pap_sys: next });
  };

  const handlePapDiaChange = (value) => {
    const next = Math.max(0, Math.min(value, localPapSys - 0.5));
    setLocalPapDia(next);
    liveEmitMonitorParam("PAP_dia", next);
    liveSendVital({ pap_dia: next });
  };

  const handleEtco2Change = (value) => {
    const next = Math.min(100, Math.max(0, value));
    setLocalEtco2(next);
    liveEmitMonitorParam("etCO2", next);
    liveSendVital({ etco2: next });
  };

  const handleRespRateChange = (value) => {
    const next = Math.min(80, Math.max(0, value));
    setLocalRR(next);
    liveEmitMonitorParam("avRR", next);
    liveSendVital({ resp_rate: next });
  };

  const handleTbloodChange = (value) => {
    const next = Math.min(45, Math.max(30, value));
    setLocalTblood(next);
    liveEmitMonitorParam("Tblood", next);
  };

  // ── Pending-mode Apply ────────────────────────────────────────────────────
  const handleApply = () => {
    if (pendingMode && onApply) {
      // Gather all staged values relevant to this dialog
      const staged = {};
      if (field === "HR") {
        staged.HR           = localHR;
        staged.rhythm       = localRhythm;
        staged.stElev       = stElev;
        staged.stDepr       = stDepr;
        staged.artifactLevel = artifactLevel;
        staged.artifactType  = artifactType;
        staged.transferTime  = localTransferTime;
        staged.transferFn    = localTransferFn;
      } else if (field === "SpO2") {
        staged.SpO2 = localSpO2;
      } else if (field === "abp" || field === "ABP_sys" || field === "ABP_dia") {
        staged.BP_sys = localSysBP;
        staged.BP_dia = localDiaBP;
      } else if (field === "pap" || field === "PAP_sys" || field === "PAP_dia") {
        staged.PAP_sys = localPapSys;
        staged.PAP_dia = localPapDia;
      } else if (field === "etCO2" || field === "avRR") {
        staged.etCO2 = localEtco2;
        staged.RR    = localRR;
      } else if (field === "Tblood" || field === "Tperi") {
        staged.Tblood = localTblood;
      }
      onApply(staged);
    }
    onClose();
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderCardiacControls = () => {
    const rhythmProfile_ = RHYTHM_INTELLIGENCE[localRhythm];
    return (
      <>
        <div className="control-card">
          <h3>Rhythm</h3>
          <select className="rhythm-select" value={localRhythm} onChange={handleRhythmSelect}>
            {ENGINE_RHYTHM_OPTIONS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.rhythms.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="control-card">
          <h3>Heart Rate</h3>
          <div className="control-row">
            <input
              type="range"
              min={hrMin}
              max={hrControlMax}
              value={Math.min(Math.max(localHR, hrMin), hrControlMax)}
              onChange={(e) => handleHRChange(Number(e.target.value))}
              disabled={hrMax === 0}
            />
            <input
              type="number"
              min={hrMin}
              max={hrMax}
              value={localHR}
              onChange={(e) => handleHRChange(Number(e.target.value))}
              disabled={hrMax === 0}
            />
          </div>
        </div>
        <div className="control-card">
          <h3>ST Elevation / Ischemia</h3>
          <div className="control-row">
            <label>
              <span>Elev (mm)</span>
              <input type="range" min={-2} max={5} step={0.1} value={stElev} onChange={(e) => handleSTChange(Number(e.target.value), stDepr)} />
              <span className="val-badge">+{stElev}</span>
            </label>
          </div>
          <div className="control-row">
            <label>
              <span>Depr (mm)</span>
              <input type="range" min={-2} max={5} step={0.1} value={stDepr} onChange={(e) => handleSTChange(stElev, Number(e.target.value))} />
              <span className="val-badge">-{stDepr}</span>
            </label>
          </div>
        </div>

        <div className="control-card">
          <h3>Rhythm Metadata</h3>
          <div className="metadata-grid">
            <div className="metadata-item">
              <span className="meta-label">P Wave:</span>
              <span className="meta-value">{rhythmProfile_?.pWave || "Normal"}</span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">T Wave:</span>
              <span className="meta-value">{rhythmProfile_?.tWave || "Normal"}</span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">QRS:</span>
              <span className="meta-value">{rhythmProfile_?.qrs || "Normal"}</span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">Severity:</span>
              <span className="meta-value">{rhythmProfile_?.severity || "Normal"}</span>
            </div>
          </div>
        </div>

        <div className="control-card">
          <h3>Artifacts (Noise)</h3>
          <div className="control-row">
            <label>
              <span>Intensity</span>
              <input type="range" min={0} max={1} step={0.1} value={artifactLevel} onChange={(e) => handleArtifactChange(Number(e.target.value), artifactType)} />
              <span className="val-badge">{Math.round(artifactLevel * 100)}%</span>
            </label>
          </div>
          <div className="control-row">
            <select value={artifactType} onChange={(e) => handleArtifactChange(artifactLevel, e.target.value)}>
              <option value="NONE">None</option>
              <option value="POWERLINE_50">Electrical (50Hz)</option>
              <option value="POWERLINE_60">Electrical (60Hz)</option>
              <option value="EMG">Muscular</option>
              <option value="BASELINE">Baseline Wander</option>
              <option value="MOTION">Motion</option>
            </select>
          </div>
        </div>

        <div className="control-card">
          <h3>Transfer Behavior</h3>
          <div className="control-row">
            <label>
              <span>Time (s)</span>
              <input
                type="number"
                min={0}
                max={300}
                value={localTransferTime}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLocalTransferTime(v);
                  if (!pendingMode) sendCommand({ transfer_time: v, transfer_fn: localTransferFn });
                }}
              />
            </label>
          </div>
          <div className="control-row">
            <label>
              <span>Function</span>
              <select
                value={localTransferFn}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocalTransferFn(v);
                  if (!pendingMode) sendCommand({ transfer_time: localTransferTime, transfer_fn: v });
                }}
              >
                <option value="IMMEDIATE">Immediate</option>
                <option value="LINEAR">Linear</option>
                <option value="SIGMOID">Sigmoid</option>
                <option value="EXPONENTIAL">Exponential</option>
              </select>
            </label>
          </div>
        </div>
      </>
    );
  };

  const renderSpO2Controls = () => (
    <div className="control-card">
      <h3>Target SpO2</h3>
      <div className="control-row">
        <input type="range" min={0} max={100} value={localSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
        <input type="number" min={0} max={100} value={localSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
      </div>
    </div>
  );

  const renderABPControls = () => (
    <div className="control-card">
      <h3>ABP (Arterial BP)</h3>
      <div className="control-row">
        <label>
          <span>Systolic</span>
          <input type="range" min={40} max={240} value={localSysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} />
        </label>
        <input type="number" min={40} max={240} value={localSysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Diastolic</span>
          <input type="range" min={10} max={180} value={localDiaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
        </label>
        <input type="number" min={10} max={180} value={localDiaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const renderPAPControls = () => (
    <div className="control-card">
      <h3>PAP (Pulmonary Artery Pressure)</h3>
      <div className="control-row">
        <label>
          <span>Systolic</span>
          <input type="range" min={5} max={120} value={localPapSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
        </label>
        <input type="number" min={5} max={120} value={localPapSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Diastolic</span>
          <input type="range" min={0} max={80} value={localPapDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={80} value={localPapDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const renderEtCO2Controls = () => (
    <div className="control-card">
      <h3>Capnography &amp; Respiration</h3>
      <div className="control-row">
        <label>
          <span>EtCO2</span>
          <input type="range" min={0} max={100} value={localEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={100} value={localEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Resp Rate</span>
          <input type="range" min={0} max={80} value={localRR} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={80} value={localRR} onChange={(e) => handleRespRateChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const renderTemperatureControls = () => (
    <div className="control-card">
      <h3>Temperature</h3>
      <div className="control-row">
        <label>
          <span>Blood Temp (°C)</span>
          <input type="range" min={30} max={45} step={0.1} value={localTblood} onChange={(e) => handleTbloodChange(Number(e.target.value))} />
        </label>
        <input type="number" min={30} max={45} step={0.1} value={localTblood} onChange={(e) => handleTbloodChange(Number(e.target.value))} style={{width:'70px'}}/>
      </div>
    </div>
  );

  const getTitle = () => {
    if (field === "HR") return "ECG & Heart Rate Controls";
    if (field === "SpO2") return "Pulse Oximetry Controls";
    if (field === "ABP_sys" || field === "ABP_dia" || field === "abp") return "Arterial Blood Pressure Controls";
    if (field === "PAP_sys" || field === "PAP_dia" || field === "pap") return "Pulmonary Artery Pressure Controls";
    if (field === "etCO2" || field === "avRR") return "Capnography Controls";
    if (field === "Tperi" || field === "Tblood") return "Temperature Controls";
    return `${field} Controls`;
  };

  const renderContent = () => {
    if (field === "HR") return renderCardiacControls();
    if (field === "SpO2") return renderSpO2Controls();
    if (field === "ABP_sys" || field === "ABP_dia" || field === "abp") return renderABPControls();
    if (field === "PAP_sys" || field === "PAP_dia" || field === "pap") return renderPAPControls();
    if (field === "etCO2" || field === "avRR") return renderEtCO2Controls();
    if (field === "Tperi" || field === "Tblood") return renderTemperatureControls();
    return <div style={{padding: "20px"}}>No specialized controls available for {field}.</div>;
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-box"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "400px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="dialog-header">
          <h2>{getTitle()}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div
          className="dialog-body param-card-body"
          style={{ background: "transparent", boxShadow: "none", position: "static", border: "none", marginTop: 0 }}
        >
          {renderContent()}
        </div>
        {/* Footer — Cancel + Apply always present */}
        <div className="dialog-footer">
          <button className="btn-classic btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-classic btn-apply" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
