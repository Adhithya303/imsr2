import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import StudentMonitor from "./pages/StudentMonitor";
import InstructorDashboard from "./pages/InstructorDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/monitor/:sessionCode" element={<StudentMonitor />} />
        <Route path="/instructor" element={<InstructorDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
