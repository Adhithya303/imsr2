import { useEffect } from "react";
import { useParams } from "react-router-dom";
import socket from "../socket";
import useMonitorStore from "../store/monitorStore";
import WaveformCanvas from "../components/monitor/WaveformCanvas";
import VitalsPanel from "../components/monitor/VitalsPanel";
import AlarmBar from "../components/monitor/AlarmBar";
import EyesPanel from "../components/monitor/EyesPanel";

export default function StudentMonitor() {
  const { sessionCode } = useParams();
  const setFullState = useMonitorStore((s) => s.setFullState);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/";
      return;
    }

    if (!socket.connected) socket.connect();

    socket.emit("join_session", { session_code: sessionCode, token });

    const handleState = (state) => setFullState(state);
    const handleRhythm = (data) => {
      setFullState(data);
    };
    const handleAlarm = (data) => {
      useMonitorStore.setState({ alarms: data.alarms });
    };

    socket.on("state_update", handleState);
    socket.on("rhythm_change", handleRhythm);
    socket.on("alarm_update", handleAlarm);

    return () => {
      socket.off("state_update", handleState);
      socket.off("rhythm_change", handleRhythm);
      socket.off("alarm_update", handleAlarm);
    };
  }, [sessionCode, setFullState]);

  return (
    <div className="student-monitor">
      <AlarmBar />
      <div className="monitor-main">
        <div className="monitor-waveforms">
          <WaveformCanvas />
        </div>
        <div className="monitor-vitals">
          <VitalsPanel />
        </div>
      </div>
      <EyesPanel editable={false} />
    </div>
  );
}
