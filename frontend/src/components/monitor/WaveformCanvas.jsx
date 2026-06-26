import { useRef, useEffect, useCallback } from "react";
import useMonitorStore from "../../store/monitorStore";

// ── Waveform Generators ──────────────────────────────────────────

function generateECGPoint(phase, rhythm, hr) {
  // phase is 0..1 within one beat cycle
  const p = phase;

  if (rhythm === "Asystole" || rhythm === "Ventricular Standstill") return 0;

  if (rhythm === "VF") {
    return (Math.random() - 0.5) * 0.6 + Math.sin(phase * Math.PI * 20) * 0.3;
  }

  if (rhythm === "VT") {
    // Wide bizarre QRS-like pattern, rate ~150
    const cycle = Math.sin(p * Math.PI * 2 * 3);
    return cycle * 0.7 + (Math.random() - 0.5) * 0.1;
  }

  if (rhythm === "AF") {
    // Irregular baseline + no P-wave + irregular RR
    const baseline = (Math.random() - 0.5) * 0.05;
    if (p > 0.15 && p < 0.22) return 0.9 + baseline;
    if (p > 0.22 && p < 0.25) return -0.3 + baseline;
    if (p > 0.25 && p < 0.28) return 0.15 + baseline;
    return baseline;
  }

  if (rhythm === "SVT") {
    // Narrow QRS, very fast
    if (p > 0.1 && p < 0.17) return 0.95;
    if (p > 0.17 && p < 0.2) return -0.25;
    if (p > 0.2 && p < 0.23) return 0.1;
    return 0;
  }

  if (rhythm === "AV Block 3°") {
    // P and QRS dissociated: P at one rate, QRS at another
    const pWave = Math.sin(p * Math.PI * 6) * 0.12;
    if (p > 0.4 && p < 0.47) return 0.85;
    if (p > 0.47 && p < 0.5) return -0.2;
    return pWave;
  }

  if (rhythm === "LBBB") {
    // Wide QRS with M-pattern
    if (p > 0.06 && p < 0.1) return 0.12; // P
    if (p > 0.15 && p < 0.2) return 0.5;
    if (p > 0.2 && p < 0.23) return 0.3;
    if (p > 0.23 && p < 0.28) return 0.7;
    if (p > 0.28 && p < 0.32) return -0.3;
    if (p > 0.4 && p < 0.5) return 0.08; // T
    return 0;
  }

  if (rhythm === "RBBB") {
    // RSR' pattern
    if (p > 0.06 && p < 0.1) return 0.12; // P
    if (p > 0.15 && p < 0.18) return 0.4;
    if (p > 0.18 && p < 0.2) return -0.1;
    if (p > 0.2 && p < 0.24) return 0.55;
    if (p > 0.24 && p < 0.28) return -0.15;
    if (p > 0.4 && p < 0.5) return 0.1;
    return 0;
  }

  if (rhythm === "ST Elevation") {
    // Normal PQRST but elevated ST
    if (p > 0.06 && p < 0.12) return 0.12; // P
    if (p > 0.18 && p < 0.21) return -0.08; // Q
    if (p > 0.21 && p < 0.25) return 0.9; // R
    if (p > 0.25 && p < 0.28) return -0.2; // S
    if (p > 0.28 && p < 0.42) return 0.35; // elevated ST
    if (p > 0.42 && p < 0.55) return 0.3 * Math.sin((p - 0.42) / 0.13 * Math.PI); // T
    return 0;
  }

  if (rhythm === "AV Block 1°") {
    // Prolonged PR
    if (p > 0.04 && p < 0.1) return 0.12;
    // Gap (prolonged PR)
    if (p > 0.22 && p < 0.25) return -0.08;
    if (p > 0.25 && p < 0.29) return 0.9;
    if (p > 0.29 && p < 0.32) return -0.2;
    if (p > 0.45 && p < 0.55) return 0.15 * Math.sin((p - 0.45) / 0.1 * Math.PI);
    return 0;
  }

  if (rhythm === "AV Block 2° Type 1") {
    // Wenckebach — approximate with occasionally missing QRS
    const beatNum = Math.floor(phase * 4); // 4 sub-beats in cycle
    if (beatNum === 3) return 0.08 * Math.sin(p * Math.PI * 8); // dropped beat, just P
    if (p > 0.18 && p < 0.21) return -0.08;
    if (p > 0.21 && p < 0.25) return 0.9;
    if (p > 0.25 && p < 0.28) return -0.2;
    if (p > 0.06 && p < 0.12) return 0.12;
    if (p > 0.42 && p < 0.52) return 0.15 * Math.sin((p - 0.42) / 0.1 * Math.PI);
    return 0;
  }

  if (rhythm === "AV Block 2° Type 2") {
    // Occasional dropped QRS with consistent PR
    const beatNum = Math.floor(phase * 3);
    if (beatNum === 2) return 0.08 * Math.sin(p * Math.PI * 6);
    // Normal otherwise
  }

  // ─── Default: Sinus Rhythm (and fallback) ───
  // P wave
  if (p > 0.06 && p < 0.12) {
    return 0.12 * Math.sin(((p - 0.06) / 0.06) * Math.PI);
  }
  // Q
  if (p > 0.18 && p < 0.21) return -0.08;
  // R
  if (p > 0.21 && p < 0.25) return 0.9;
  // S
  if (p > 0.25 && p < 0.28) return -0.2;
  // T wave
  if (p > 0.42 && p < 0.52) {
    return 0.15 * Math.sin(((p - 0.42) / 0.1) * Math.PI);
  }
  return 0;
}

function generatePlethPoint(phase, spo2) {
  // Plethysmograph — rounded pulse wave
  const amplitude = Math.max(0.1, spo2 / 100);
  const p = phase;
  if (p < 0.15) return amplitude * Math.sin((p / 0.15) * Math.PI);
  if (p < 0.35) return amplitude * 0.5 * Math.sin(((p - 0.15) / 0.2) * Math.PI);
  return 0;
}

function generateABPPoint(phase, sys, dia) {
  const range = sys - dia;
  const base = dia / 200;
  const p = phase;
  if (p < 0.1) return base + (range / 200) * Math.sin((p / 0.1) * Math.PI * 0.5);
  if (p < 0.15) return base + (range / 200);
  if (p < 0.25) return base + (range / 200) * 0.7;
  if (p < 0.35) {
    return base + (range / 200) * 0.4 * Math.sin(((p - 0.25) / 0.1) * Math.PI);
  }
  if (p < 0.6) return base + (range / 200) * 0.15 * (1 - (p - 0.35) / 0.25);
  return base;
}

function generatePAPPoint(phase, sys, dia) {
  const range = sys - dia;
  const base = dia / 200;
  const p = phase;
  if (p < 0.12) return base + (range / 200) * Math.sin((p / 0.12) * Math.PI * 0.5);
  if (p < 0.3) return base + (range / 200) * 0.5 * (1 - (p - 0.12) / 0.18);
  return base;
}

function generateCO2Point(phase, etCO2, avRR) {
  if (avRR === 0) return 0; // Apnea — flat line
  const p = phase;
  const amp = etCO2 / 60;
  // Capnograph: expiratory plateau then sharp inspiratory drop
  if (p < 0.1) return amp * (p / 0.1); // rise
  if (p < 0.45) return amp; // plateau
  if (p < 0.55) return amp * (1 - (p - 0.45) / 0.1); // drop
  return 0;
}

// ── Channel Configs ──────────────────────────────────────────────

const DEFAULT_CHANNELS = [
  { label: "II", unit: "mV", color: "#00FF00", type: "ecg" },
  { label: "Pleth", unit: "%", color: "#FFFF00", type: "pleth" },
  { label: "ABP", unit: "mmHg", color: "#FF3333", type: "abp" },
  { label: "PAP", unit: "mmHg", color: "#FF9900", type: "pap" },
  { label: "CO₂", unit: "mmHg", color: "#00CCFF", type: "co2" },
];

// ── Component ────────────────────────────────────────────────────

export default function WaveformCanvas({ channels = DEFAULT_CHANNELS, height }) {
  const canvasRef = useRef(null);
  const dataRef = useRef({});
  const animRef = useRef(null);
  const timeRef = useRef(0);

  // Initialize data buffers
  useEffect(() => {
    channels.forEach((ch) => {
      if (!dataRef.current[ch.type]) {
        dataRef.current[ch.type] = new Float32Array(600).fill(0);
      }
    });
  }, [channels]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const channelCount = channels.length;
    const chH = H / channelCount;

    // Get current store values
    const state = useMonitorStore.getState();
    const hr = state.HR || 80;
    const spo2 = state.SpO2 || 98;
    const abpSys = state.ABP_sys || 120;
    const abpDia = state.ABP_dia || 80;
    const papSys = state.PAP_sys || 20;
    const papDia = state.PAP_dia || 10;
    const etCO2 = state.etCO2 || 35;
    const avRR = state.avRR ?? 14;
    const rhythm = state.rhythm || "Sinus Rhythm";

    // Time progression
    timeRef.current += 1 / 60; // 60fps
    const t = timeRef.current;

    // Clear
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    channels.forEach((ch, i) => {
      const y0 = i * chH;
      const buf = dataRef.current[ch.type];

      // Shift buffer left
      for (let j = 0; j < buf.length - 1; j++) buf[j] = buf[j + 1];

      // Generate new point
      let val = 0;
      const beatsPerSec = hr / 60;
      const cardiacPhase = (t * beatsPerSec) % 1;
      const breathsPerSec = avRR / 60;
      const respPhase = breathsPerSec > 0 ? (t * breathsPerSec) % 1 : 0;

      switch (ch.type) {
        case "ecg":
          val = generateECGPoint(cardiacPhase, rhythm, hr);
          break;
        case "pleth":
          val = generatePlethPoint(cardiacPhase, spo2);
          break;
        case "abp":
          val = generateABPPoint(cardiacPhase, abpSys, abpDia);
          break;
        case "pap":
          val = generatePAPPoint(cardiacPhase, papSys, papDia);
          break;
        case "co2":
          val = generateCO2Point(respPhase, etCO2, avRR);
          break;
      }
      buf[buf.length - 1] = val;

      // Draw subtle grid
      ctx.strokeStyle = "#1A1A1A";
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 20) {
        ctx.beginPath();
        ctx.moveTo(gx, y0);
        ctx.lineTo(gx, y0 + chH);
        ctx.stroke();
      }
      for (let gy = y0; gy < y0 + chH; gy += 20) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Channel divider
      if (i > 0) {
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(W, y0);
        ctx.stroke();
      }

      // Draw waveform
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const mid = y0 + chH * 0.55;
      const scale = chH * 0.4;
      for (let x = 0; x < buf.length; x++) {
        const px = (x / buf.length) * W;
        const py = mid - buf[x] * scale;
        if (x === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Channel label
      ctx.fillStyle = ch.color;
      ctx.font = "bold 11px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${ch.label}`, 6, y0 + 14);
      ctx.font = "10px 'Inter', sans-serif";
      ctx.fillStyle = "#888";
      ctx.fillText(ch.unit, 6, y0 + 26);
    });

    // Sweep line
    const sweepX = ((timeRef.current * 50) % 600) / 600 * W;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sweepX, 0);
    ctx.lineTo(sweepX, H);
    ctx.stroke();

    animRef.current = requestAnimationFrame(draw);
  }, [channels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    resizeObserver.observe(canvas);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: height || "100%",
        display: "block",
        background: "#000",
      }}
    />
  );
}
