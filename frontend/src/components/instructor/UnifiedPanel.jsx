import { useState, useEffect } from "react";
import { useECGStore } from "../../store/ecgStore";
import useMonitorStore from "../../store/monitorStore";
import socket from "../../socket";
import WaveformStack from "../monitor/WaveformStack";
import { ALL_LEADS } from "../../types/ecgState";
import {
  ENGINE_RHYTHM_OPTIONS,
  getEngineRhythm,
  getMonitorRhythmLabel,
} from "../../utils/rhythms";

export default function UnifiedPanel({ scenarioContent }) {
  // Monitor Store (source of truth for values)
  const HR = useMonitorStore((s) => s.HR);
  const SpO2 = useMonitorStore((s) => s.SpO2);
  const ABP_sys = useMonitorStore((s) => s.ABP_sys);
  const ABP_dia = useMonitorStore((s) => s.ABP_dia);
  const PAP_sys = useMonitorStore((s) => s.PAP_sys);
  const PAP_dia = useMonitorStore((s) => s.PAP_dia);
  const etCO2 = useMonitorStore((s) => s.etCO2);
  const avRR = useMonitorStore((s) => s.avRR);
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

  const handleRhythmSelect = (event) => {
    const engineRhythm = event.target.value;
    const monitorRhythm = getMonitorRhythmLabel(engineRhythm);

    updateParam("rhythm", monitorRhythm);
    socket.emit("update_rhythm", {
      rhythm: monitorRhythm,
      HR,
      ecg_lead: selectedLead,
    });
    sendCommand({
      rhythm: engineRhythm,
      heart_rate: HR,
      sys_bp: ABP_sys,
      dia_bp: ABP_dia,
      pap_sys: PAP_sys,
      pap_dia: PAP_dia,
      spo2: SpO2,
      resp_rate: avRR,
      etco2: etCO2,
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
                  </select>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Heart Rate</h3>
              <div className="control-row">
                <input type="range" min={0} max={300} value={HR} onChange={(e) => socket.emit("update_parameter", { HR: Number(e.target.value) })} />
                <input type="number" min={0} max={300} value={HR} onChange={(e) => socket.emit("update_parameter", { HR: Number(e.target.value) })} />
                <span className="val-badge">{HR} bpm</span>
              </div>
            </div>

            <div className="control-card">
              <h3>SpO2</h3>
              <div className="control-row">
                <input type="range" min={0} max={100} value={SpO2} onChange={(e) => socket.emit("update_parameter", { SpO2: Number(e.target.value) })} />
                <input type="number" min={0} max={100} value={SpO2} onChange={(e) => socket.emit("update_parameter", { SpO2: Number(e.target.value) })} />
                <span className="val-badge">{SpO2} %</span>
              </div>
            </div>
            
            <div className="control-card">
              <h3>ABP (Arterial Blood Pressure)</h3>
              <div className="control-row">
                <label>
                  <span>Systolic</span>
                  <input type="range" min={0} max={240} value={ABP_sys} onChange={(e) => socket.emit("update_parameter", { ABP_sys: Number(e.target.value) })} />
                </label>
                <input type="number" style={{ width: '60px' }} value={ABP_sys} onChange={(e) => socket.emit("update_parameter", { ABP_sys: Number(e.target.value) })} />
              </div>
              <div className="control-row">
                <label>
                  <span>Diastolic</span>
                  <input type="range" min={0} max={200} value={ABP_dia} onChange={(e) => socket.emit("update_parameter", { ABP_dia: Number(e.target.value) })} />
                </label>
                <input type="number" style={{ width: '60px' }} value={ABP_dia} onChange={(e) => socket.emit("update_parameter", { ABP_dia: Number(e.target.value) })} />
              </div>
            </div>

            <div className="control-card">
              <h3>Rhythm</h3>
              <select className="rhythm-select" value={rhythm} onChange={(e) => socket.emit("update_parameter", { rhythm: e.target.value })}>
                <option value="Sinus Rhythm">Sinus Rhythm</option>
                <option value="Sinus Tachycardia">Sinus Tachycardia</option>
                <option value="Sinus Bradycardia">Sinus Bradycardia</option>
                <option value="Atrial Fibrillation">Atrial Fibrillation</option>
                <option value="Atrial Flutter">Atrial Flutter</option>
                <option value="SVT">SVT</option>
                <option value="Ventricular Tachycardia">Ventricular Tachycardia</option>
                <option value="Ventricular Fibrillation">Ventricular Fibrillation</option>
                <option value="Asystole">Asystole</option>
                <option value="Junctional Rhythm">Junctional Rhythm</option>
                <option value="1st Degree AV Block">1st Degree AV Block</option>
                <option value="2nd Degree AV Block">2nd Degree AV Block</option>
                <option value="3rd Degree AV Block">3rd Degree AV Block</option>
                <option value="Paced Rhythm">Paced Rhythm</option>
              </select>
            </div>

            <div className="control-card">
              <h3>ST Elevation / Ischemia</h3>
              <div className="control-row">
                <label>
                  <span>Elevation (mm)</span>
                  <input type="range" min={0} max={10} step={0.5} value={stElev} onChange={(e) => handleSTChange(Number(e.target.value), stDepr)} />
                  <span className="val-badge">+{stElev}</span>
                </label>
              </div>
              <div className="control-row">
                <label>
                  <span>Depression (mm)</span>
                  <input type="range" min={0} max={5} step={0.5} value={stDepr} onChange={(e) => handleSTChange(stElev, Number(e.target.value))} />
                  <span className="val-badge">-{stDepr}</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Artifacts (Noise)</h3>
              <div className="control-row">
                <label>
                  <span>Intensity</span>
                  <input type="range" min={0} max={10} step={1} value={artifactLevel} onChange={(e) => handleArtifactChange(Number(e.target.value), artifactType)} />
                  <span className="val-badge">{artifactLevel}</span>
                </label>
              </div>
              <div className="control-row">
                <label>
                  <span>Noise Type</span>
                  <select value={artifactType} onChange={(e) => handleArtifactChange(artifactLevel, e.target.value)}>
                    <option value="NONE">None (Clean)</option>
                    <option value="ELECTRICAL_50HZ">Electrical (50Hz AC)</option>
                    <option value="ELECTRICAL_60HZ">Electrical (60Hz AC)</option>
                    <option value="MUSCULAR">Muscular (Tremor/Movement)</option>
                    <option value="BASELINE_WANDER">Baseline Wander</option>
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
