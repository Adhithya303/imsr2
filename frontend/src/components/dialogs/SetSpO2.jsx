import { useState } from "react";
import socket from "../../socket";
import useMonitorStore from "../../store/monitorStore";

export default function SetSpO2({ isOpen, onClose, sessionCode }) {
  const current = useMonitorStore((s) => s.SpO2);
  const [target, setTarget] = useState(current);
  const [transferTime, setTransferTime] = useState(0);

  if (!isOpen) return null;

  const handleOk = () => {
    socket.emit("update_parameter", {
      session_code: sessionCode,
      field: "SpO2",
      value: target,
      transfer_time: transferTime,
    });
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">Set SpO₂</div>
        <div className="dialog-body">
          <div className="dialog-row">
            <span className="dialog-label">Current:</span>
            <span className="dialog-current">{current} %</span>
          </div>
          <input type="range" min={0} max={100} value={target}
            onChange={(e) => setTarget(Number(e.target.value))} className="dialog-slider" />
          <div className="dialog-row">
            <span className="dialog-label">Target:</span>
            <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))}
              className="dialog-input" />
            <span className="dialog-unit">%</span>
          </div>
          <div className="dialog-row">
            <span className="dialog-label">Transfer time:</span>
            <select value={transferTime} onChange={(e) => setTransferTime(Number(e.target.value))} className="dialog-select">
              <option value={0}>0 min</option><option value={1}>1 min</option>
              <option value={2}>2 min</option><option value={5}>5 min</option>
            </select>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn-classic btn-ok" onClick={handleOk}>OK</button>
          <button className="btn-classic btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
