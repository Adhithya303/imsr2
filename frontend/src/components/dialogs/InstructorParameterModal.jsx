import { useState, useEffect, useRef } from "react";
import { useECGStore } from "../../store/ecgStore";
import useMonitorStore from "../../store/monitorStore";
import socket from "../../socket";
import { RHYTHM_INTELLIGENCE } from "../../types/ecgState";
import { ENGINE_RHYTHM_OPTIONS, getEngineRhythm, getMonitorRhythmLabel } from "../../utils/rhythms";

export default function InstructorParameterModal({ field, onClose }) {
  // Monitor Store
  const rhythm = useMonitorStore((s) => s.rhythm);
  const updateParam = useMonitorStore((s) => s.updateParam);

  // ECG Store
  const ecgState = useECGStore((s) => s.ecgState);
  const heartRate = useECGStore((s) => s.heartRate);
  const targetSpO2 = useECGStore((s) => s.spo2);
  const sysBP = useECGStore((s) => s.sysBP);
  const diaBP = useECGStore((s) => s.diaBP);
  const papSys = useECGStore((s) => s.papSys);
  const papDia = useECGStore((s) => s.papDia);
  const targetEtco2 = useECGStore((s) => s.etco2);
  const respRate = useECGStore((s) => s.respRate);
  const transferTime = useECGStore((s) => s.transferTime);
  const transferFn = useECGStore((s) => s.transferFn);
  const sendCommand = useECGStore((s) => s.sendCommand);
  const ecgRhythm = useECGStore((s) => s.rhythm);

  const [stElev, setStElev] = useState(0);
  const [stDepr, setStDepr] = useState(0);
  const [artifactLevel, setArtifactLevel] = useState(0);
  const [artifactType, setArtifactType] = useState("NONE");

  useEffect(() => {
    if (!ecgState) return;
    setStElev(ecgState.st_elevation);
    setStDepr(ecgState.st_depression);
    setArtifactLevel(ecgState.artifact_level);
    setArtifactType(ecgState.artifact_type);
  }, [ecgState]);

  const handleSTChange = (elev, depr) => {
    setStElev(elev);
    setStDepr(depr);
    sendCommand({ st_elevation: elev, st_depression: depr, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleArtifactChange = (level, type) => {
    setArtifactLevel(level);
    setArtifactType(type);
    sendCommand({ artifact_level: level, artifact_type: type });
  };

  const selectedRhythm = getEngineRhythm(rhythm || ecgRhythm);
  const rhythmProfile = RHYTHM_INTELLIGENCE[selectedRhythm];
  const hrMin = rhythmProfile?.hrMin ?? 0;
  const hrMax = rhythmProfile?.hrMax ?? 300;
  const hrControlMax = hrMax === 0 ? 1 : hrMax;

  const emitMonitorParam = (f, value) => {
    updateParam(f, value);
    socket.emit("update_parameter", { field: f, value });
  };
  const sendVitalCommand = (update) => sendCommand({ ...update, transfer_time: transferTime, transfer_fn: transferFn });

  const handleSpO2Change = (value) => {
    const next = Math.max(0, Math.min(value, 100));
    emitMonitorParam("SpO2", next);
  };

  const handleHeartRateChange = (value) => {
    const next = Math.max(hrMin, Math.min(value, hrControlMax));
    emitMonitorParam("HR", next);
  };

  const handleSysBPChange = (value) => {
    const next = Math.max(diaBP + 1, Math.min(value, 300));
    emitMonitorParam("ABP_sys", next);
  };

  const handleDiaBPChange = (value) => {
    const next = Math.max(0, Math.min(value, sysBP - 1));
    emitMonitorParam("ABP_dia", next);
  };

  const handlePapSysChange = (value) => {
    const next = Math.max(papDia + 0.5, Math.min(value, 100));
    emitMonitorParam("PAP_sys", next);
  };

  const handlePapDiaChange = (value) => {
    const next = Math.max(0, Math.min(value, papSys - 0.5));
    emitMonitorParam("PAP_dia", next);
  };

  const handleEtco2Change = (value) => {
    const next = Math.min(100, Math.max(0, value));
    emitMonitorParam("etCO2", next);
  };

  const handleRespRateChange = (value) => {
    const next = Math.min(80, Math.max(0, value));
    emitMonitorParam("avRR", next);
  };

  const handleRhythmSelect = (event) => {
    const engineRhythm = event.target.value;
    const monitorRhythm = getMonitorRhythmLabel(engineRhythm);
    const profile = RHYTHM_INTELLIGENCE[engineRhythm];
    let nextHeartRate = heartRate;

    if (profile?.hrMax === 0) {
      nextHeartRate = 0;
    } else if (profile && (heartRate < profile.hrMin || heartRate > profile.hrMax)) {
      nextHeartRate = profile.defaultHr;
    }

    updateParam("rhythm", monitorRhythm);
    socket.emit("update_rhythm", { rhythm: monitorRhythm });
    if (nextHeartRate !== heartRate) emitMonitorParam("HR", nextHeartRate);
  };

  const renderCardiacControls = () => (
    <>
      <div className="control-card">
        <h3>Rhythm</h3>
        <select className="rhythm-select" value={selectedRhythm} onChange={handleRhythmSelect}>
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
          <input type="range" min={hrMin} max={hrControlMax} value={Math.min(Math.max(heartRate, hrMin), hrControlMax)} onChange={(e) => handleHeartRateChange(Number(e.target.value))} disabled={hrMax === 0} />
          <input type="number" min={hrMin} max={hrMax} value={heartRate} onChange={(e) => handleHeartRateChange(Number(e.target.value))} disabled={hrMax === 0} />
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
            <span className="meta-value">{rhythmProfile?.pWave || "Normal"}</span>
          </div>
          <div className="metadata-item">
            <span className="meta-label">T Wave:</span>
            <span className="meta-value">{rhythmProfile?.tWave || "Normal"}</span>
          </div>
          <div className="metadata-item">
            <span className="meta-label">QRS:</span>
            <span className="meta-value">{rhythmProfile?.qrs || "Normal"}</span>
          </div>
          <div className="metadata-item">
            <span className="meta-label">Severity:</span>
            <span className="meta-value">{rhythmProfile?.severity || "Normal"}</span>
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
            <input type="number" min={0} max={300} value={transferTime} onChange={(e) => sendCommand({ transfer_time: Number(e.target.value), transfer_fn: transferFn })} />
          </label>
        </div>
        <div className="control-row">
          <label>
            <span>Function</span>
            <select value={transferFn} onChange={(e) => sendCommand({ transfer_time: transferTime, transfer_fn: e.target.value })}>
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

  const renderSpO2Controls = () => (
    <div className="control-card">
      <h3>Target SpO2</h3>
      <div className="control-row">
        <input type="range" min={0} max={100} value={targetSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
        <input type="number" min={0} max={100} value={targetSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
      </div>
    </div>
  );

  const renderABPControls = () => (
    <div className="control-card">
      <h3>ABP (Arterial BP)</h3>
      <div className="control-row">
        <label>
          <span>Systolic</span>
          <input type="range" min={40} max={240} value={sysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} />
        </label>
        <input type="number" min={40} max={240} value={sysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Diastolic</span>
          <input type="range" min={10} max={180} value={diaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
        </label>
        <input type="number" min={10} max={180} value={diaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const renderPAPControls = () => (
    <div className="control-card">
      <h3>PAP (Pulmonary Artery Pressure)</h3>
      <div className="control-row">
        <label>
          <span>Systolic</span>
          <input type="range" min={5} max={120} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
        </label>
        <input type="number" min={5} max={120} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Diastolic</span>
          <input type="range" min={0} max={80} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={80} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const renderEtCO2Controls = () => (
    <div className="control-card">
      <h3>Capnography & Respiration</h3>
      <div className="control-row">
        <label>
          <span>EtCO2</span>
          <input type="range" min={0} max={100} value={targetEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={100} value={targetEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
      <div className="control-row">
        <label>
          <span>Resp Rate</span>
          <input type="range" min={0} max={80} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
        </label>
        <input type="number" min={0} max={80} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} style={{width:'60px'}}/>
      </div>
    </div>
  );

  const getTitle = () => {
    if (field === 'HR') return 'ECG & Heart Rate Controls';
    if (field === 'SpO2') return 'Pulse Oximetry Controls';
    if (field === 'ABP_sys' || field === 'ABP_dia' || field === 'abp') return 'Arterial Blood Pressure Controls';
    if (field === 'PAP_sys' || field === 'PAP_dia' || field === 'pap') return 'Pulmonary Artery Pressure Controls';
    if (field === 'etCO2' || field === 'avRR') return 'Capnography Controls';
    if (field === 'Tperi' || field === 'Tblood') return 'Temperature Controls';
    return `${field} Controls`;
  };

  const renderContent = () => {
    if (field === 'HR') return renderCardiacControls();
    if (field === 'SpO2') return renderSpO2Controls();
    if (field === 'ABP_sys' || field === 'ABP_dia' || field === 'abp') return renderABPControls();
    if (field === 'PAP_sys' || field === 'PAP_dia' || field === 'pap') return renderPAPControls();
    if (field === 'etCO2' || field === 'avRR') return renderEtCO2Controls();
    if (field === 'Tperi' || field === 'Tblood') return <div style={{padding: '20px'}}>Temperature controls coming soon.</div>;
    return <div style={{padding: '20px'}}>No specialized controls available for {field}.</div>;
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="dialog-header">
          <h2>{getTitle()}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body param-card-body" style={{ background: 'transparent', boxShadow: 'none', position: 'static', border: 'none', marginTop: 0 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
