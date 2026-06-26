import { useState } from "react";
import socket from "../../socket";
import useMonitorStore from "../../store/monitorStore";

export default function SetArterialBP({ isOpen, onClose, sessionCode }) {
  const currentSys = useMonitorStore((s) => s.ABP_sys);
  const currentDia = useMonitorStore((s) => s.ABP_dia);
  const [sysTo, setSysTo] = useState(currentSys);
  const [diaTo, setDiaTo] = useState(currentDia);
  const [coupled, setCoupled] = useState(false);
  const [transferTime, setTransferTime] = useState(0);

  if (!isOpen) return null;

  const handleOk = () => {
    socket.emit("update_parameter", {
      session_code: sessionCode,
      field: "ABP_sys",
      value: sysTo,
      transfer_time: transferTime,
    });
    socket.emit("update_parameter", {
      session_code: sessionCode,
      field: "ABP_dia",
      value: diaTo,
      transfer_time: transferTime,
    });
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">Set Arterial Blood Pressure</div>
        <div className="dialog-body">
          <div className="dialog-group">
            <div className="dialog-group-title">Systolic</div>
            <div className="dialog-row">
              <span className="dialog-label">From (current):</span>
              <span className="dialog-current">{Math.round(currentSys)} mmHg</span>
            </div>
            <input
              type="range"
              min={0} max={300} value={sysTo}
              onChange={(e) => {
                setSysTo(Number(e.target.value));
                if (coupled) setDiaTo(Math.round(Number(e.target.value) * 0.67));
              }}
              className="dialog-slider"
            />
            <div className="dialog-row">
              <span className="dialog-label">To (new):</span>
              <input
                type="number"
                value={sysTo}
                onChange={(e) => setSysTo(Number(e.target.value))}
                className="dialog-input"
              />
              <span className="dialog-unit">mmHg</span>
            </div>
          </div>

          <div className="dialog-group">
            <div className="dialog-group-title">Diastolic</div>
            <div className="dialog-row">
              <span className="dialog-label">From (current):</span>
              <span className="dialog-current">{Math.round(currentDia)} mmHg</span>
            </div>
            <input
              type="range"
              min={0} max={200} value={diaTo}
              onChange={(e) => setDiaTo(Number(e.target.value))}
              className="dialog-slider"
            />
            <div className="dialog-row">
              <span className="dialog-label">To (new):</span>
              <input
                type="number"
                value={diaTo}
                onChange={(e) => setDiaTo(Number(e.target.value))}
                className="dialog-input"
              />
              <span className="dialog-unit">mmHg</span>
            </div>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={coupled} onChange={(e) => setCoupled(e.target.checked)} />
            Coupled
          </label>

          <div className="dialog-row">
            <span className="dialog-label">Transfer time:</span>
            <select value={transferTime} onChange={(e) => setTransferTime(Number(e.target.value))} className="dialog-select">
              <option value={0}>0 min (instant)</option>
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
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
