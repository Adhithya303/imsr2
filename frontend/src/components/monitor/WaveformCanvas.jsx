/**
 * WaveformCanvas.jsx
 * ==================
 * Multi-channel waveform monitor with PTB-based ECG (ecg-master logic) +
 * Windkessel/Gaussian math models for Pleth, ABP, PAP, CO2.
 *
 * ECG channel: Loads a pre-generated synthetic PTB-format JSON file
 * per rhythm from /waveforms/ecg/<Rhythm_Name>.json, then scrolls
 * the Lead II signal in real-time with requestAnimationFrame.
 *
 * Other channels: Physics-based Gaussian/Windkessel math -- unchanged.
 */

import { useRef, useEffect, useCallback } from "react";
import useMonitorStore from "../../store/monitorStore";

// =============================================================================
// ECG-MASTER ANIMATION CONSTANTS (ported from useECGAnimation.ts)
// =============================================================================

const ECG_DISPLAY_DURATION_SEC = 6;       // seconds of data visible at once
const ECG_AMPLITUDE_RATIO      = 0.82;    // fraction of channel height to use
const ECG_GRID_MAJOR_COLOR     = "rgba(0, 230, 118, 0.10)";
const ECG_GRID_MINOR_COLOR     = "rgba(0, 230, 118, 0.04)";
const ECG_GRID_CENTER_COLOR    = "rgba(0, 230, 118, 0.16)";

// Map IMSR rhythm names to waveform JSON filenames
const RHYTHM_TO_ECG_FILE = {
  "Sinus Rhythm":              "Sinus_Rhythm",
  "Sinus Tachycardia":         "Sinus_Tachycardia",
  "Sinus Bradycardia":         "Sinus_Bradycardia",
  "Atrial Fibrillation":       "Atrial_Fibrillation",
  "Atrial Flutter":            "Atrial_Flutter",
  "SVT":                       "SVT",
  "Ventricular Tachycardia":   "Ventricular_Tachycardia",
  "Ventricular Fibrillation":  "Ventricular_Fibrillation",
  "Asystole":                  "Asystole",
  "Junctional Rhythm":         "Junctional_Rhythm",
  "1st Degree AV Block":       "1st_Degree_AV_Block",
  "2nd Degree AV Block":       "2nd_Degree_AV_Block",
  "3rd Degree AV Block":       "3rd_Degree_AV_Block",
  "Paced Rhythm":              "Paced_Rhythm",
};

const ECG_WAVEFORM_BASE = "/waveforms/ecg";

// =============================================================================
// MATH-BASED WAVEFORM HELPERS (Pleth, ABP, PAP, CO2)
// =============================================================================

function getABPShape(u) {
  if (u < 0.15) return Math.sin((Math.PI / 2) * (u / 0.15));
  if (u < 0.30) return 1.0 - 0.28 * Math.sin((Math.PI / 2) * ((u - 0.15) / 0.15));
  if (u < 0.34) return 0.72 - 0.17 * Math.sin((Math.PI / 2) * ((u - 0.30) / 0.04));
  if (u < 0.42) return 0.55 + 0.07 * Math.sin((Math.PI / 2) * ((u - 0.34) / 0.08));
  const d = u - 0.42;
  const RC = 0.35, fN = 0.62;
  return fN * (Math.exp(-d / RC) - Math.exp(-0.58 / RC)) / (1.0 - Math.exp(-0.58 / RC));
}

function getPAPShape(u) {
  if (u < 0.15) return Math.sin((Math.PI / 2) * (u / 0.15));
  if (u < 0.30) return 1.0 - 0.30 * Math.sin((Math.PI / 2) * ((u - 0.15) / 0.15));
  if (u < 0.34) return 0.70 - 0.08 * Math.sin((Math.PI / 2) * ((u - 0.30) / 0.04));
  if (u < 0.40) return 0.62 + 0.03 * Math.sin((Math.PI / 2) * ((u - 0.34) / 0.06));
  const d = u - 0.40;
  const RC = 0.45, fN = 0.65;
  return fN * (Math.exp(-d / RC) - Math.exp(-0.60 / RC)) / (1.0 - Math.exp(-0.60 / RC));
}

function getPlethShape(t) {
  const A1 = 1.0, t1 = 0.2, g1 = 0.08;
  const A2 = 0.35, t2 = 0.45, g2 = 0.15;
  function pd(v, tgt) {
    let d = v - tgt;
    while (d < -0.5) d += 1;
    while (d > 0.5)  d -= 1;
    return d;
  }
  const dt1 = pd(t, t1), dt2 = pd(t, t2);
  return (
    A1 * Math.exp(-(dt1 * dt1) / (2 * g1 * g1)) +
    A2 * Math.exp(-(dt2 * dt2) / (2 * g2 * g2))
  );
}

function getCO2Shape(v) {
  const inhaleDur = 0.60;
  if (v < inhaleDur) return 0;
  const u  = (v - inhaleDur) / (1.0 - inhaleDur);
  const ss = (x) => x * x * (3 - 2 * x);
  if (u < 0.12) return ss(u / 0.12);
  if (u < 0.88) return 1.0 + 0.05 * ((u - 0.12) / 0.76);
  return 1.05 * ss((1.0 - u) / 0.12);
}

// =============================================================================
// CHANNEL DEFINITIONS
// =============================================================================

const DEFAULT_CHANNELS = [
  { label: "II",    unit: "mV",   color: "#00FF00", type: "ecg",   dialogKey: null   },
  { label: "Pleth", unit: "%",    color: "#FFFF00", type: "pleth", dialogKey: "spo2" },
  { label: "ABP",   unit: "mmHg", color: "#FF3333", type: "abp",   dialogKey: "abp"  },
  { label: "PAP",   unit: "mmHg", color: "#FF9900", type: "pap",   dialogKey: null   },
  { label: "CO2",   unit: "mmHg", color: "#00CCFF", type: "co2",   dialogKey: null   },
];

// =============================================================================
// ECG GRID DRAWING HELPER (from ecg-master useECGAnimation.ts)
// =============================================================================

function drawECGGrid(ctx, x0, y0, W, H, fs, samplesVisible) {
  const pxPerSample = W / samplesVisible;

  // Minor grid (40ms)
  const minorPx = pxPerSample * (fs * 0.04);
  ctx.strokeStyle = ECG_GRID_MINOR_COLOR;
  ctx.lineWidth = 0.5;
  for (let x = x0; x <= x0 + W; x += minorPx) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + H); ctx.stroke();
  }

  // Major grid (200ms)
  const majorPx = pxPerSample * (fs * 0.20);
  ctx.strokeStyle = ECG_GRID_MAJOR_COLOR;
  ctx.lineWidth = 0.5;
  for (let x = x0; x <= x0 + W; x += majorPx) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + H); ctx.stroke();
  }

  // Center baseline
  const centerY = y0 + H / 2;
  ctx.strokeStyle = ECG_GRID_CENTER_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x0, centerY);
  ctx.lineTo(x0 + W, centerY);
  ctx.stroke();
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function WaveformCanvas({ channels = DEFAULT_CHANNELS, height, onChannelClick }) {
  const canvasRef  = useRef(null);
  const dataRef    = useRef({});       // ring buffers for non-ECG channels
  const animRef    = useRef(null);
  const timeRef    = useRef(0);

  // Physics state (Pleth, ABP, PAP, CO2)
  const physicsRef = useRef({
    cardiacPhase:      0,
    respiratoryPhase:  0,
    cardiacOutputScale: 1.0,
    co2Suppression:    1.0,
    runningABP:        80,
    runningPAP:        10,
    runningPleth:      0,
    runningCO2:        0,
  });

  // ECG scrolling state (ecg-master)
  const ecgSignalRef = useRef(null);   // Float32Array of Lead II samples
  const ecgFsRef     = useRef(360);    // sample rate from JSON
  const ecgHeadRef   = useRef(0.0);    // floating sample index (head)
  const ecgLastTsRef = useRef(0);      // last rAF timestamp

  // Allocate ring buffers for non-ECG channels
  useEffect(() => {
    channels.forEach((ch) => {
      if (ch.type !== "ecg" && !dataRef.current[ch.type])
        dataRef.current[ch.type] = new Float32Array(600).fill(0);
    });
  }, [channels]);

  // ── ECG JSON Loader ─────────────────────────────────────────────────────────
  const loadECG = useCallback((rhythm) => {
    const filename = RHYTHM_TO_ECG_FILE[rhythm] || "Sinus_Rhythm";
    const url = `${ECG_WAVEFORM_BASE}/${filename}.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const leadII = data.leads && data.leads["II"];
        if (!leadII) throw new Error("Missing Lead II in waveform JSON");
        ecgSignalRef.current = new Float32Array(leadII);
        ecgFsRef.current     = data.fs ?? 360;
        ecgHeadRef.current   = 0;
        ecgLastTsRef.current = 0;
      })
      .catch((err) => {
        console.warn("[ECG Loader]", err.message);
        ecgSignalRef.current = null;
      });
  }, []);

  // Load on mount
  useEffect(() => {
    const rhythm = useMonitorStore.getState().rhythm || "Sinus Rhythm";
    loadECG(rhythm);
  }, [loadECG]);

  // Subscribe to rhythm changes -> reload ECG JSON
  useEffect(() => {
    let prevRhythm = useMonitorStore.getState().rhythm;
    const unsub = useMonitorStore.subscribe((state) => {
      if (state.rhythm !== prevRhythm) {
        prevRhythm = state.rhythm;
        loadECG(state.rhythm);
      }
    });
    return unsub;
  }, [loadECG]);

  // =============================================================================
  // MAIN DRAW LOOP
  // =============================================================================

  const draw = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W   = canvas.width;
    const H   = canvas.height;
    const chH = H / channels.length;

    // Read state
    const state   = useMonitorStore.getState();
    const hr      = state.HR      ?? 80;
    const spo2    = state.SpO2    ?? 98;
    const abpSys  = state.ABP_sys ?? 120;
    const abpDia  = state.ABP_dia ?? 80;
    const papSys  = state.PAP_sys ?? 20;
    const papDia  = state.PAP_dia ?? 10;
    const etCO2   = state.etCO2   ?? 35;
    const inCO2   = state.inCO2   ?? 0;
    const avRR    = state.avRR    ?? 14;

    const dt = 1 / 60;
    timeRef.current += dt;
    const ph = physicsRef.current;

    // ── Physics for non-ECG channels ─────────────────────────────────────────
    if (hr > 0) {
      ph.cardiacOutputScale = Math.min(1.0, ph.cardiacOutputScale + dt * 0.3);
      ph.cardiacPhase += dt * (hr / 60);
      if (ph.cardiacPhase >= 1.0) ph.cardiacPhase -= 1.0;
    } else {
      ph.cardiacOutputScale = Math.max(0.0, ph.cardiacOutputScale - dt * 0.4);
      ph.cardiacPhase = 0;
    }

    if (avRR > 0) {
      ph.respiratoryPhase += dt * (avRR / 60);
      if (ph.respiratoryPhase >= 1.0) ph.respiratoryPhase -= 1.0;
    } else {
      ph.respiratoryPhase = 0;
    }

    let targetABP   = abpDia;
    let targetPAP   = papDia;
    let targetPleth = 0;
    let targetCO2   = inCO2;

    if (hr > 0) {
      const delayPhase = 0.15 * (hr / 60);
      const hemoPhase  = (ph.cardiacPhase - 0.5 - delayPhase + 2.0) % 1.0;
      const artPulse   = (abpSys - abpDia) * ph.cardiacOutputScale;
      targetABP   = abpDia * ph.cardiacOutputScale + artPulse * getABPShape(hemoPhase);
      const papPulse = (papSys - papDia) * ph.cardiacOutputScale;
      targetPAP   = papDia * ph.cardiacOutputScale + papPulse * getPAPShape(hemoPhase);
      const spo2Amp = Math.max(0.05, spo2 / 100);
      targetPleth = getPlethShape(hemoPhase) * ph.cardiacOutputScale * spo2Amp;
    } else {
      targetABP   = 8.0;
      targetPAP   = 4.0;
    }

    const sysBP = hr > 0 ? abpSys * ph.cardiacOutputScale : ph.runningABP;
    if (sysBP < 40)
      ph.co2Suppression = Math.max(0.0, ph.co2Suppression - dt * 0.5);
    else
      ph.co2Suppression = Math.min(1.0, ph.co2Suppression + dt * 0.5);

    if (avRR > 0)
      targetCO2 = inCO2 + (etCO2 - inCO2) * getCO2Shape(ph.respiratoryPhase) * ph.co2Suppression;

    const hemoSmooth = hr > 0 ? 0.30 : 0.05;
    ph.runningABP   += (targetABP   - ph.runningABP)   * hemoSmooth;
    ph.runningPAP   += (targetPAP   - ph.runningPAP)   * hemoSmooth;
    ph.runningPleth += (targetPleth - ph.runningPleth)  * hemoSmooth;
    ph.runningCO2   += (targetCO2   - ph.runningCO2)   * 0.40;

    // Push non-ECG samples to ring buffers
    channels.forEach((ch) => {
      if (ch.type === "ecg") return;
      const buf = dataRef.current[ch.type];
      if (!buf) return;
      for (let j = 0; j < buf.length - 1; j++) buf[j] = buf[j + 1];
      switch (ch.type) {
        case "pleth": buf[buf.length - 1] = ph.runningPleth; break;
        case "abp":   buf[buf.length - 1] = ph.runningABP;   break;
        case "pap":   buf[buf.length - 1] = ph.runningPAP;   break;
        case "co2":   buf[buf.length - 1] = ph.runningCO2;   break;
        default: break;
      }
    });

    // ── ECG head advancement (ecg-master scrolling) ───────────────────────────
    const ecgSignal = ecgSignalRef.current;
    const ecgFs     = ecgFsRef.current;

    if (ecgSignal && ecgSignal.length > 0) {
      if (ecgLastTsRef.current === 0) ecgLastTsRef.current = timestamp || 0;
      const deltaMs = Math.min((timestamp || 0) - ecgLastTsRef.current, 100);
      ecgLastTsRef.current = timestamp || 0;
      // Playback speed scales with HR: normal at 80 bpm
      const playbackSpeed = hr > 0 ? hr / 80 : 0;
      const advance = (deltaMs / 1000) * ecgFs * playbackSpeed;
      ecgHeadRef.current = (ecgHeadRef.current + advance) % ecgSignal.length;
    }

    // ── Render all channels ───────────────────────────────────────────────────
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    channels.forEach((ch, i) => {
      const y0 = i * chH;

      // Channel divider
      if (i > 0) {
        ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
      }

      if (ch.type === "ecg") {
        // ── ECG channel: PTB scrolling waveform from ecg-master ──────────────
        const samplesVisible = ecgFs * ECG_DISPLAY_DURATION_SEC;
        drawECGGrid(ctx, 0, y0, W, chH, ecgFs, samplesVisible);

        ctx.shadowBlur  = 6;
        ctx.shadowColor = ch.color;
        ctx.strokeStyle = ch.color;
        ctx.lineWidth   = 1.8;
        ctx.lineJoin    = "round";
        ctx.lineCap     = "round";
        ctx.beginPath();

        if (ecgSignal && ecgSignal.length > 0 && hr > 0) {
          const signalLength = ecgSignal.length;
          const playbackSpeed = hr / 80;
          const samplesInView = ecgFs * ECG_DISPLAY_DURATION_SEC * playbackSpeed;
          const centerY   = y0 + chH / 2;
          const amplitude = chH * ECG_AMPLITUDE_RATIO * 0.5;
          const head      = ecgHeadRef.current;

          let penDown = false;
          for (let px = 0; px < W; px++) {
            const samplesBack = (1 - px / (W - 1)) * (samplesInView || 1);
            const rawIdx  = head - samplesBack;
            const sIdx    = ((Math.round(rawIdx) % signalLength) + signalLength) % signalLength;
            const y       = centerY - ecgSignal[sIdx] * amplitude;
            if (!penDown) { ctx.moveTo(px, y); penDown = true; }
            else          { ctx.lineTo(px, y); }
          }
          ctx.stroke();
        } else {
          // Flat dashed line while loading or on cardiac arrest
          const cy = y0 + chH / 2;
          ctx.globalAlpha = 0.3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;

      } else {
        // ── Non-ECG channels: math-based ring buffer ──────────────────────────
        const buf = dataRef.current[ch.type];
        if (!buf) return;

        // Simple grid
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 0.5;
        for (let gx = 0; gx < W; gx += 40) {
          ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y0 + chH); ctx.stroke();
        }
        for (let gy = y0; gy < y0 + chH; gy += 20) {
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }

        // Y scale
        let yMin, yMax;
        switch (ch.type) {
          case "pleth": yMin = -0.1; yMax = 1.4;  break;
          case "abp":   yMin = 0;    yMax = 200;  break;
          case "pap":   yMin = 0;    yMax = 40;   break;
          case "co2":   yMin = 0;    yMax = 60;   break;
          default:      yMin = 0;    yMax = 1;
        }
        const range = yMax - yMin;

        ctx.shadowBlur  = 6;
        ctx.shadowColor = ch.color;
        ctx.strokeStyle = ch.color;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        const pad = chH * 0.08;
        for (let x = 0; x < buf.length; x++) {
          const px   = (x / buf.length) * W;
          const norm = (buf[x] - yMin) / range;
          const py   = y0 + chH - pad - norm * (chH - 2 * pad);
          x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Edit hint
        if (ch.dialogKey && onChannelClick) {
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.font      = "10px sans-serif";
          ctx.textAlign = "right";
          ctx.fillText("  edit", W - 6, y0 + 14);
        }
      }

      // Channel label & unit
      ctx.fillStyle = ch.color;
      ctx.font      = "bold 11px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(ch.label, 6, y0 + 14);
      ctx.fillStyle = "#888";
      ctx.font      = "10px 'Inter', sans-serif";
      ctx.fillText(ch.unit, 6, y0 + 26);
    });

    // Sweep line (for non-ECG region, cosmetic)
    const sweepX = ((timeRef.current * 50) % 600) / 600 * W;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(sweepX, chH);   // start at bottom of ECG channel
    ctx.lineTo(sweepX, H);
    ctx.stroke();

    animRef.current = requestAnimationFrame(draw);
  }, [channels, onChannelClick]);

  // ── Mount / Resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);

    animRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback((e) => {
    if (!onChannelClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    const chH  = rect.height / channels.length;
    const idx  = Math.floor(y / chH);
    const ch   = channels[idx];
    if (ch?.dialogKey) onChannelClick(ch.dialogKey);
  }, [channels, onChannelClick]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: height || "100%",
        display: "block",
        background: "#000",
        cursor: onChannelClick ? "pointer" : "default",
      }}
    />
  );
}
