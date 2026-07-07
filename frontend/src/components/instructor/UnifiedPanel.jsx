import { useState, useEffect } from "react";
import { useECGStore } from "../../store/ecgStore";
import useMonitorStore from "../../store/monitorStore";
import socket from "../../socket";
import WaveformStack from "../monitor/WaveformStack";
import { ALL_LEADS, RHYTHM_INTELLIGENCE } from "../../types/ecgState";
import {
  ENGINE_RHYTHM_OPTIONS,
  getEngineRhythm,
  getMonitorRhythmLabel,
} from "../../utils/rhythms";

export default function UnifiedPanel({ scenarioContent }) {
  // Monitor Store (source of truth for values)
  const rhythm = useMonitorStore((s) => s.rhythm);
  const updateParam = useMonitorStore((s) => s.updateParam);

  // ECG Store (for live math-generated values and engine controls)
  const ecgState = useECGStore((s) => s.ecgState);
  const liveHeartRate = useECGStore((s) => s.liveHeartRate);
  const liveSpo2 = useECGStore((s) => s.liveSpo2);
  const liveSysBP = useECGStore((s) => s.liveSysBP);
  const liveDiaBP = useECGStore((s) => s.liveDiaBP);
  const livePapSys = useECGStore((s) => s.livePapSys);
  const livePapDia = useECGStore((s) => s.livePapDia);
  const liveEtco2 = useECGStore((s) => s.liveEtco2);
  const liveRespRate = useECGStore((s) => s.liveRespRate);
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

  const [selectedLead, setSelectedLead] = useState("II");
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

  const emitMonitorParam = (field, value) => {
    socket.emit("update_parameter", {
      field,
      value,
    });
  };

  const sendVitalCommand = (update) => {
    sendCommand({
      ...update,
      transfer_time: transferTime,
      transfer_fn: transferFn,
    });
  };

  const handleHeartRateChange = (value) => {
    const maximum = hrMax === 0 ? 0 : hrMax;
    const next = Math.min(maximum, Math.max(hrMin, value));
    emitMonitorParam("HR", next);
    sendVitalCommand({ heart_rate: next });
  };

  const handleSpO2Change = (value) => {
    const next = Math.min(100, Math.max(0, value));
    emitMonitorParam("SpO2", next);
    sendVitalCommand({ spo2: next });
  };

  const handleSysBPChange = (value) => {
    const next = Math.min(240, Math.max(value, diaBP + 1));
    emitMonitorParam("ABP_sys", next);
    sendVitalCommand({ sys_bp: next });
  };

  const handleDiaBPChange = (value) => {
    const next = Math.max(10, Math.min(value, sysBP - 1));
    emitMonitorParam("ABP_dia", next);
    sendVitalCommand({ dia_bp: next });
  };

  const handlePapSysChange = (value) => {
    const next = Math.min(120, Math.max(value, papDia + 0.5));
    emitMonitorParam("PAP_sys", next);
    sendVitalCommand({ pap_sys: next });
  };

  const handlePapDiaChange = (value) => {
    const next = Math.max(0, Math.min(value, papSys - 0.5));
    emitMonitorParam("PAP_dia", next);
    sendVitalCommand({ pap_dia: next });
  };

  const handleEtco2Change = (value) => {
    const next = Math.min(100, Math.max(0, value));
    emitMonitorParam("etCO2", next);
    sendVitalCommand({ etco2: next });
  };

  const handleRespRateChange = (value) => {
    const next = Math.min(80, Math.max(0, value));
    emitMonitorParam("avRR", next);
    sendVitalCommand({ resp_rate: next });
  };

  const handleRhythmSelect = (event) => {
    const engineRhythm = event.target.value;
    const monitorRhythm = getMonitorRhythmLabel(engineRhythm);
    const profile = RHYTHM_INTELLIGENCE[engineRhythm];
    let nextHeartRate = heartRate;

    if (profile?.hrMax === 0) {
      nextHeartRate = 0;
    } else if (
      profile &&
      (heartRate < profile.hrMin || heartRate > profile.hrMax)
    ) {
      nextHeartRate = profile.defaultHr;
    }

    updateParam("rhythm", monitorRhythm);
    socket.emit("update_rhythm", {
      rhythm: monitorRhythm,
      ecg_lead: selectedLead,
    });
    if (nextHeartRate !== heartRate) {
      emitMonitorParam("HR", nextHeartRate);
    }
    sendCommand({
      rhythm: engineRhythm,
      heart_rate: nextHeartRate,
      transfer_time: transferTime,
      transfer_fn: transferFn,
    });
  };

  return (
    <div className="unified-panel">
      
      {/* Vitals Strip */}
      <div className="vitals-strip">
        <div className="vital-card">
          <div className="vital-label">HEART RATE</div>
          <div className="vital-value" style={{ color: '#3fb950' }}>{liveHeartRate}</div>
          <div className="vital-unit">BPM</div>
        </div>
        <div className="vital-card rhythm-card">
          <div className="vital-label">CURRENT RHYTHM</div>
          <select
            className="rhythm-current-select"
            value={selectedRhythm}
            onChange={handleRhythmSelect}
          >
            {ENGINE_RHYTHM_OPTIONS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.rhythms.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="vital-card vital-card--spo2">
          <div className="vital-label">SpO₂</div>
          <div className="vital-secondary-value" style={{ color: '#00dff3' }}>{liveSpo2}<small>%</small></div>
        </div>
        <div className="vital-card vital-card--abp">
          <div className="vital-label">ABP</div>
          <div className="vital-secondary-value" style={{ color: '#ff4d4d' }}>{liveSysBP}/{liveDiaBP}</div>
          <div className="vital-unit">mmHg</div>
        </div>
        <div className="vital-card vital-card--pap">
          <div className="vital-label">PAP</div>
          <div className="vital-secondary-value" style={{ color: '#ffd43b' }}>{livePapSys}/{livePapDia}</div>
          <div className="vital-unit">mmHg</div>
        </div>
        <div className="vital-card vital-card--etco2">
          <div className="vital-label">EtCO2 / RR</div>
          <div className="vital-secondary-value" style={{ color: '#f0f3f6' }}>{liveEtco2} <small>{liveRespRate}</small></div>
          <div className="vital-unit">mmHg / min</div>
        </div>
        <div className="vital-card lead-card">
          <div className="vital-label">MONITOR LEAD</div>
          <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value)}>
            {ALL_LEADS.filter((lead) => !["PLETH", "ABP", "PAP", "ETCO2"].includes(lead))
              .map((lead) => <option key={lead} value={lead}>{lead}</option>)}
          </select>
        </div>
      </div>

      <div className="dashboard-content">
        {/* Monitor Panel (Waveforms) */}
        <div className="monitor-panel">
          <div className="waveform-container">
            <WaveformStack lead={selectedLead} />
          </div>
        </div>

        {/* Controls Panel */}
        <div className="controls-panel">
          <div className="controls-scroll">
            
            <div className="control-card">
              <h3>Transfer Behavior</h3>
              <p className="control-help">How changes transition over time.</p>
              <div className="control-row">
                <label>
                  <span>Time (s)</span>
                  <input type="number" min={0} max={300} value={transferTime} onChange={(e) => sendCommand({ transfer_time: Number(e.target.value), transfer_fn: transferFn })} />
                </label>
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

            <div className="control-card">
              <h3>Heart Rate</h3>
              <div className="control-row">
                <input
                  type="range"
                  min={hrMin}
                  max={hrControlMax}
                  value={Math.min(Math.max(heartRate, hrMin), hrControlMax)}
                  onChange={(e) => handleHeartRateChange(Number(e.target.value))}
                  disabled={hrMax === 0}
                />
                <input
                  type="number"
                  min={hrMin}
                  max={hrMax}
                  value={heartRate}
                  onChange={(e) => handleHeartRateChange(Number(e.target.value))}
                  disabled={hrMax === 0}
                />
                <span className="val-badge">{heartRate} bpm</span>
              </div>
            </div>

            <div className="control-card">
              <h3>SpO2</h3>
              <div className="control-row">
                <input type="range" min={0} max={100} value={targetSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
                <input type="number" min={0} max={100} value={targetSpO2} onChange={(e) => handleSpO2Change(Number(e.target.value))} />
                <span className="val-badge">{targetSpO2} %</span>
              </div>
            </div>
            
            <div className="control-card">
              <h3>ABP (Arterial Blood Pressure)</h3>
              <div className="control-row">
                <label>
                  <span>Systolic</span>
                  <input type="range" min={40} max={240} value={sysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} />
                </label>
                <input type="number" min={40} max={240} style={{ width: '70px' }} value={sysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} />
              </div>
              <div className="control-row">
                <label>
                  <span>Diastolic</span>
                  <input type="range" min={10} max={180} value={diaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
                </label>
                <input type="number" min={10} max={180} style={{ width: '70px' }} value={diaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
              </div>
            </div>

            <div className="control-card">
              <h3>PAP (Pulmonary Artery Pressure)</h3>
              <div className="control-row">
                <label>
                  <span>Systolic</span>
                  <input type="range" min={5} max={120} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
                </label>
                <input type="number" min={5} max={120} style={{ width: '70px' }} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
              </div>
              <div className="control-row">
                <label>
                  <span>Diastolic</span>
                  <input type="range" min={0} max={80} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
                </label>
                <input type="number" min={0} max={80} style={{ width: '70px' }} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
              </div>
            </div>

            <div className="control-card">
              <h3>Capnography</h3>
              <div className="control-row">
                <label>
                  <span>EtCO2</span>
                  <input type="range" min={0} max={100} value={targetEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
                </label>
                <input type="number" min={0} max={100} style={{ width: '70px' }} value={targetEtco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
              </div>
              <div className="control-row">
                <label>
                  <span>Respiratory Rate</span>
                  <input type="range" min={0} max={80} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
                </label>
                <input type="number" min={0} max={80} style={{ width: '70px' }} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
              </div>
            </div>

            <div className="control-card">
              <h3>Rhythm</h3>
              <select className="rhythm-select" value={selectedRhythm} onChange={handleRhythmSelect}>
                {ENGINE_RHYTHM_OPTIONS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.rhythms.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="control-card">
              <h3>ST Elevation / Ischemia</h3>
              <div className="control-row">
                <label>
                  <span>Elevation (mm)</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stElev} onChange={(e) => handleSTChange(Number(e.target.value), stDepr)} />
                  <span className="val-badge">+{stElev}</span>
                </label>
              </div>
              <div className="control-row">
                <label>
                  <span>Depression (mm)</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stDepr} onChange={(e) => handleSTChange(stElev, Number(e.target.value))} />
                  <span className="val-badge">-{stDepr}</span>
                </label>
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
                <label>
                  <span>Noise Type</span>
                  <select value={artifactType} onChange={(e) => handleArtifactChange(artifactLevel, e.target.value)}>
                    <option value="NONE">None (Clean)</option>
                    <option value="POWERLINE_50">Electrical (50Hz AC)</option>
                    <option value="POWERLINE_60">Electrical (60Hz AC)</option>
                    <option value="EMG">Muscular (Tremor/Movement)</option>
                    <option value="BASELINE">Baseline Wander</option>
                    <option value="MOTION">Motion Artifact</option>
                  </select>
                </label>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="instructor-scenario-panel">
        {scenarioContent}
      </div>
    </div>
  );
}
