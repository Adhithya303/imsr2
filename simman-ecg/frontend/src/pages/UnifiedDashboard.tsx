import { useEffect, useState } from "react";
import { useECGStore } from "../store/ecgStore";
import { connect, disconnect } from "../engine/wsClient";
import ECGTrack from "../components/monitor/ECGTrack";
import PlethTrack from "../components/monitor/PlethTrack";
import ABPTrack from "../components/monitor/ABPTrack";
import PAPTrack from "../components/monitor/PAPTrack";
import ETCO2Track from "../components/monitor/ETCO2Track";
import {
  RHYTHM_GROUPS, RHYTHM_LABELS, RHYTHM_INTELLIGENCE, ALL_LEADS,
  type RhythmType, type ArtifactType, type TransferFn, type LeadName,
} from "../types/ecgState";
import "./UnifiedDashboard.css";

export default function UnifiedDashboard() {
  const ecgState    = useECGStore((s) => s.ecgState);
  const heartRate   = useECGStore((s) => s.heartRate);
  const liveHeartRate = useECGStore((s) => s.liveHeartRate);
  const spo2        = useECGStore((s) => s.spo2);
  const liveSpo2    = useECGStore((s) => s.liveSpo2);
  const sysBP       = useECGStore((s) => s.sysBP);
  const diaBP       = useECGStore((s) => s.diaBP);
  const liveSysBP   = useECGStore((s) => s.liveSysBP);
  const liveDiaBP   = useECGStore((s) => s.liveDiaBP);
  const papSys      = useECGStore((s) => s.papSys);
  const papDia      = useECGStore((s) => s.papDia);
  const livePapSys  = useECGStore((s) => s.livePapSys);
  const livePapDia  = useECGStore((s) => s.livePapDia);
  const etco2       = useECGStore((s) => s.etco2);
  const liveEtco2   = useECGStore((s) => s.liveEtco2);
  const respRate    = useECGStore((s) => s.respRate);
  const liveRespRate = useECGStore((s) => s.liveRespRate);
  const severity    = useECGStore((s) => s.severity);
  const connected   = useECGStore((s) => s.connected);
  const transferTime = useECGStore((s) => s.transferTime);
  const transferFn   = useECGStore((s) => s.transferFn);
  const rhythmValue  = useECGStore((s) => s.rhythm);
  const sendCommand = useECGStore((s) => s.sendCommand);
  const rhythmProfile = useECGStore((s) => s.rhythmIntelligence);

  // Rhythm-aware HR limits
  const hrMin      = rhythmProfile?.hrMin ?? 0;
  const hrMax      = rhythmProfile?.hrMax === 0 ? 0 : (rhythmProfile?.hrMax ?? 300);
  const hrSliderMax = hrMax === 0 ? 0 : (hrMax > 0 ? hrMax : 300);

  const [stElev,        setStElev]        = useState(0);
  const [stDepr,        setStDepr]        = useState(0);
  const [artifactLevel, setArtifactLevel] = useState(0);
  const [artifactType,  setArtifactType]  = useState<ArtifactType>("NONE");
  const [selectedLead,  setSelectedLead]  = useState<LeadName>("II");

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  useEffect(() => {
    if (!ecgState) return;
    setStElev(ecgState.st_elevation);
    setStDepr(ecgState.st_depression);
    setArtifactLevel(ecgState.artifact_level);
    setArtifactType(ecgState.artifact_type);
  }, [ecgState]);

  const rhythm = (rhythmValue || ecgState?.rhythm || "NSR") as RhythmType;
  const hasPerfusingPulse = liveHeartRate > 0 && !["ASYSTOLE", "VF", "PEA"].includes(rhythm);
  const spo2AlarmClass = !hasPerfusingPulse || liveSpo2 < 90
    ? "vital-secondary-value--critical"
    : liveSpo2 < 95
      ? "vital-secondary-value--warning"
      : "";

  const handleHRChange = (val: number) => {
    console.log("HR Slider Changed:", val);
    sendCommand({ heart_rate: val, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleSPO2Change = (val: number) => {
    console.log("SPO2 Slider Changed:", val);
    sendCommand({ spo2: val, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleSysBPChange = (val: number) => {
    const next = Math.min(240, Math.max(val, diaBP + 1));
    sendCommand({ sys_bp: next, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleDiaBPChange = (val: number) => {
    const next = Math.max(10, Math.min(val, sysBP - 1));
    sendCommand({ dia_bp: next, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handlePapSysChange = (val: number) => {
    const next = Math.min(120, Math.max(val, papDia + 1));
    sendCommand({ pap_sys: next, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handlePapDiaChange = (val: number) => {
    const next = Math.max(0, Math.min(val, papSys - 1));
    sendCommand({ pap_dia: next, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleEtco2Change = (val: number) => {
    sendCommand({
      etco2: Math.min(100, Math.max(0, val)),
      transfer_time: transferTime,
      transfer_fn: transferFn,
    });
  };

  const handleRespRateChange = (val: number) => {
    sendCommand({
      resp_rate: Math.min(80, Math.max(0, val)),
      transfer_time: transferTime,
      transfer_fn: transferFn,
    });
  };

  const handleRhythmChange = (r: RhythmType) => {
    console.log("Selected Rhythm:", r);
    const profile = RHYTHM_INTELLIGENCE[r];
    const update: Parameters<typeof sendCommand>[0] = { rhythm: r, transfer_time: transferTime, transfer_fn: transferFn };
    if (profile) {
      const curHR = heartRate;
      if (profile.hrMax === 0) update.heart_rate = 0;
      else if (curHR < profile.hrMin || curHR > profile.hrMax) update.heart_rate = profile.defaultHr;
    }
    sendCommand(update);
  };

  const handleSTChange = (elev: number, depr: number) => {
    console.log("Store Updated: ST", elev, depr);
    setStElev(elev);
    setStDepr(depr);
    sendCommand({ st_elevation: elev, st_depression: depr, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleArtifactChange = (level: number, type: ArtifactType) => {
    console.log("Store Updated: Artifact", level, type);
    setArtifactLevel(level);
    setArtifactType(type);
    sendCommand({ artifact_level: level, artifact_type: type });
  };

  return (
    <div className="dashboard">
      
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="dashboard-brand">🫀 SimMan ECG Engine</div>
        <div className={`ws-status ws-status--${connected ? "on" : "off"}`}>
          {connected ? "LIVE CONNECTED" : "RECONNECTING..."}
        </div>
      </header>

      <div className="dashboard-content">
        {/* LEFT PANEL: The Monitor / Waveform */}
        <section className="monitor-panel">
          
          <div className="vitals-strip">
            <div className="vital-card">
              <div className="vital-label">HEART RATE</div>
              <div className={`vital-value vital-value--${severity}`}>{liveHeartRate}</div>
              <div className="vital-unit">BPM</div>
              {rhythmProfile && (
                <div className="vital-hr-range">
                  {hrMax === 0 ? "0" : `${hrMin}–${hrSliderMax}`} bpm
                </div>
              )}
            </div>
            <div className="vital-card rhythm-card">
              <div className="vital-label">CURRENT RHYTHM</div>
              <div className="vital-text">{RHYTHM_LABELS[rhythm as RhythmType] ?? rhythm}</div>
            </div>
            <div className="vital-card vital-card--spo2">
              <div className="vital-label">SpO₂</div>
              <div className={`vital-secondary-value ${spo2AlarmClass}`}>
                {hasPerfusingPulse ? liveSpo2 : "---"}{hasPerfusingPulse && <small>%</small>}
              </div>
              {!hasPerfusingPulse && <div className="vital-unit vital-unit--critical">NO PULSE</div>}
            </div>
            <div className="vital-card vital-card--abp">
              <div className="vital-label">ABP</div>
              <div className="vital-secondary-value">{liveSysBP}/{liveDiaBP}</div>
              <div className="vital-unit">mmHg</div>
            </div>
            <div className="vital-card vital-card--pap">
              <div className="vital-label">PAP</div>
              <div className="vital-secondary-value">{livePapSys}/{livePapDia}</div>
              <div className="vital-unit">mmHg</div>
            </div>
            <div className="vital-card vital-card--etco2">
              <div className="vital-label">EtCO2 / RR</div>
              <div className="vital-secondary-value">{liveEtco2} <small>{liveRespRate}</small></div>
              <div className="vital-unit">mmHg / min</div>
            </div>
            <div className="vital-card lead-card">
              <div className="vital-label">MONITOR LEAD</div>
              <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value as LeadName)}>
                {ALL_LEADS.filter((lead) => !["PLETH", "ABP", "PAP", "ETCO2"].includes(lead))
                  .map((lead) => <option key={lead} value={lead}>{lead}</option>)}
              </select>
            </div>
          </div>

          <div className="waveform-container">
            <ECGTrack lead={selectedLead} width={900} height={104} />
            <PlethTrack width={900} height={104} gain={42} />
            <ABPTrack width={900} height={104} />
            <PAPTrack width={900} height={104} />
            <ETCO2Track width={900} height={104} />
          </div>

        </section>

        {/* RIGHT PANEL: The Controls */}
        <section className="controls-panel">
          <div className="controls-scroll">
            
            <div className="control-card">
              <h3>Transfer Behavior</h3>
              <p className="control-help">How changes (like HR) transition over time.</p>
              <div className="control-row">
                <label>
                  <span>Time (s)</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={transferTime}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      console.log("Store Updated: transferTime", next);
                      sendCommand({ transfer_time: next, transfer_fn: transferFn });
                    }}
                  />
                </label>
                <label>
                  <span>Function</span>
                  <select
                    value={transferFn}
                    onChange={(e) => {
                      const next = e.target.value as TransferFn;
                      console.log("Store Updated: transferFn", next);
                      sendCommand({ transfer_time: transferTime, transfer_fn: next });
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

            <div className="control-card">
              <h3>Heart Rate</h3>
              <p className="control-help">Constrained to the selected rhythm's clinical range.</p>
              {rhythmProfile && (
                <p className="control-help" style={{ color: '#3a8a5a', marginTop: -6 }}>
                  Allowed: {hrMax === 0 ? "0" : `${hrMin}–${hrSliderMax}`} bpm · Default: {rhythmProfile.defaultHr}
                </p>
              )}
              <div className="control-row">
                <input
                  type="range"
                  min={hrMin}
                  max={hrSliderMax || 1}
                  value={Math.min(Math.max(heartRate, hrMin), hrSliderMax || 0)}
                  onChange={(e) => handleHRChange(Number(e.target.value))}
                  disabled={hrMax === 0}
                />
                <input
                  type="number"
                  min={hrMin}
                  max={hrSliderMax || 0}
                  value={heartRate}
                  onChange={(e) => handleHRChange(Math.min(Math.max(Number(e.target.value), hrMin), hrSliderMax || 0))}
                  disabled={hrMax === 0}
                />
                <span className="val-badge">{heartRate} bpm</span>
              </div>
            </div>

            <div className="control-card">
              <h3>SpO2</h3>
              <p className="control-help">Pulse oximetry saturation.</p>
              <div className="control-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={spo2}
                  onChange={(e) => handleSPO2Change(Number(e.target.value))}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={spo2}
                  onChange={(e) => handleSPO2Change(Math.min(100, Math.max(0, Number(e.target.value))))}
                />
                <span className="val-badge">{spo2} %</span>
              </div>
            </div>

            <div className="control-card">
              <h3>ABP (Arterial Blood Pressure)</h3>
              <p className="control-help">Systolic & Diastolic pressure in mmHg.</p>
              <div className="control-row">
                <label>
                  <span>Systolic</span>
                  <input type="range" min={40} max={240} value={sysBP} onChange={(e) => handleSysBPChange(Number(e.target.value))} />
                  <input type="number" min={40} max={240} value={sysBP}
                    onChange={(e) => handleSysBPChange(Number(e.target.value))} />
                  <span className="val-badge">{sysBP}</span>
                </label>
                <label>
                  <span>Diastolic</span>
                  <input type="range" min={10} max={180} value={diaBP} onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
                  <input type="number" min={10} max={180} value={diaBP}
                    onChange={(e) => handleDiaBPChange(Number(e.target.value))} />
                  <span className="val-badge">{diaBP}</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>PAP (Pulmonary Artery Pressure)</h3>
              <p className="control-help">Pulmonary artery systolic and diastolic pressure.</p>
              <div className="control-row">
                <label>
                  <span>Systolic</span>
                  <input type="range" min={5} max={120} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
                  <input type="number" min={5} max={120} value={papSys} onChange={(e) => handlePapSysChange(Number(e.target.value))} />
                  <span className="val-badge">{papSys}</span>
                </label>
                <label>
                  <span>Diastolic</span>
                  <input type="range" min={0} max={80} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
                  <input type="number" min={0} max={80} value={papDia} onChange={(e) => handlePapDiaChange(Number(e.target.value))} />
                  <span className="val-badge">{papDia}</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Capnography</h3>
              <p className="control-help">End-tidal CO2 and respiratory rate.</p>
              <div className="control-row">
                <label>
                  <span>EtCO2</span>
                  <input type="range" min={0} max={100} value={etco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
                  <input type="number" min={0} max={100} value={etco2} onChange={(e) => handleEtco2Change(Number(e.target.value))} />
                  <span className="val-badge">{etco2} mmHg</span>
                </label>
                <label>
                  <span>Respiratory rate</span>
                  <input type="range" min={0} max={80} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
                  <input type="number" min={0} max={80} value={respRate} onChange={(e) => handleRespRateChange(Number(e.target.value))} />
                  <span className="val-badge">{respRate} /min</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Cardiac Rhythm</h3>
              <p className="control-help">Select rhythm to instantly override the engine.</p>
              <select className="rhythm-select" value={rhythm} onChange={(e) => handleRhythmChange(e.target.value as RhythmType)}>
                {RHYTHM_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.rhythms.map((r) => (
                      <option key={r} value={r}>{RHYTHM_LABELS[r]}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="control-card">
              <h3>ST Segment (Ischemia/Infarct)</h3>
              <p className="control-help">Instantly shapes the ST segment relative to baseline.</p>
              <div className="control-row">
                <label>
                  <span>Elevation</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stElev} onChange={(e) => handleSTChange(Number(e.target.value), stDepr)} />
                  <span className="val-badge">{stElev.toFixed(1)} mV</span>
                </label>
                <label>
                  <span>Depression</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stDepr} onChange={(e) => handleSTChange(stElev, Number(e.target.value))} />
                  <span className="val-badge">{stDepr.toFixed(1)} mV</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Noise & Artifacts</h3>
              <p className="control-help">Injects electrical interference or patient motion.</p>
              <div className="control-row">
                <label>
                  <span>Noise Type</span>
                  <select value={artifactType} onChange={(e) => handleArtifactChange(artifactLevel, e.target.value as ArtifactType)}>
                    <option value="NONE">None</option>
                    <option value="BASELINE">Baseline Wander</option>
                    <option value="POWERLINE_50">50Hz Powerline</option>
                    <option value="POWERLINE_60">60Hz Powerline</option>
                    <option value="MOTION">Motion Artifact</option>
                    <option value="EMG">Muscle Tremor</option>
                  </select>
                </label>
                <label>
                  <span>Intensity</span>
                  <input type="range" min={0} max={1} step={0.1} value={artifactLevel} onChange={(e) => handleArtifactChange(Number(e.target.value), artifactType)} />
                  <span className="val-badge">{Math.round(artifactLevel * 100)}%</span>
                </label>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
