import { useState, useEffect, useRef } from "react";
import useMonitorStore from "../../store/monitorStore";
import socket from "../../socket";

export default function SimulationControl({ sessionCode }) {
  const [elapsed, setElapsed] = useState(0);
  const [events, setEvents] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const startRef = useRef(Date.now());
  const eventEndRef = useRef(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Trend data sampling every 5s
  useEffect(() => {
    if (frozen) return;
    const interval = setInterval(() => {
      const s = useMonitorStore.getState();
      setTrendData((prev) => {
        const next = [
          ...prev,
          {
            t: Math.floor((Date.now() - startRef.current) / 1000),
            HR: s.HR,
            RR: s.avRR,
            SpO2: s.SpO2,
            SAP: s.ABP_sys,
            DAP: s.ABP_dia,
          },
        ];
        // Keep last 120 samples (10 min)
        return next.slice(-120);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [frozen]);

  // Listen for session events
  useEffect(() => {
    const handleEvent = (entry) => {
      setEvents((prev) => [...prev, entry]);
      setTimeout(() => {
        eventEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    };
    socket.on("session_event", handleEvent);
    return () => socket.off("session_event", handleEvent);
  }, []);

  const formatTime = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const handleAddComment = () => {
    if (!comment.trim()) return;
    socket.emit("add_event_log", {
      session_code: sessionCode,
      event: comment.trim(),
    });
    setComment("");
    setShowComment(false);
  };

  const handleEndSession = async () => {
    if (!window.confirm("End this simulation session?")) return;
    const token = localStorage.getItem("token");
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/${sessionCode}/end`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    window.location.reload();
  };

  // Mini trend chart using canvas
  const trendCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = trendCanvasRef.current;
    if (!canvas || trendData.length < 2) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "#0e0e0e";
    ctx.fillRect(0, 0, W, H);

    const lines = [
      { key: "HR", color: "#FF3333", max: 200 },
      { key: "RR", color: "#00CCFF", max: 40 },
      { key: "SpO2", color: "#00FF00", max: 100 },
      { key: "SAP", color: "#FFFF00", max: 250 },
      { key: "DAP", color: "#FF9900", max: 200 },
    ];

    lines.forEach(({ key, color, max }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trendData.forEach((d, i) => {
        const x = (i / (trendData.length - 1)) * W;
        const y = H - (d[key] / max) * H * 0.9 - H * 0.05;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Legend
    ctx.font = "10px Inter, sans-serif";
    lines.forEach(({ key, color }, i) => {
      ctx.fillStyle = color;
      ctx.fillText(key, 5 + i * 45, 12);
    });
  }, [trendData]);

  return (
    <div className="sim-control">
      <div className="sim-timer">
        <span className="sim-timer-label">SESSION</span>
        <span className="sim-timer-value">{formatTime(elapsed)}</span>
        <span className="sim-session-code">{sessionCode}</span>
      </div>

      {/* Trend */}
      <div className="sim-trend">
        <div className="sim-section-header">
          <span>Trends</span>
          <button className="btn-classic btn-sm" onClick={() => setFrozen(!frozen)}>
            {frozen ? "▶ Resume" : "❚❚ Freeze"}
          </button>
        </div>
        <canvas ref={trendCanvasRef} className="trend-canvas" />
      </div>

      {/* Event Log */}
      <div className="sim-log">
        <div className="sim-section-header">
          <span>Event Log</span>
          <button className="btn-classic btn-sm" onClick={() => setShowComment(true)}>
            + Comment
          </button>
        </div>
        <div className="event-list">
          {events.map((e, i) => (
            <div key={i} className="event-entry">
              <span className="event-time">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className="event-text">{e.event}</span>
            </div>
          ))}
          <div ref={eventEndRef} />
        </div>
      </div>

      {/* Comment popup */}
      {showComment && (
        <div className="comment-popup">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add comment..."
            className="comment-input"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
          />
          <button className="btn-classic btn-sm" onClick={handleAddComment}>Add</button>
          <button className="btn-classic btn-sm" onClick={() => setShowComment(false)}>✕</button>
        </div>
      )}

      <button className="btn-classic btn-end" onClick={handleEndSession}>
        End Session
      </button>
    </div>
  );
}
