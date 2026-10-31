import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Altraz from "@/Altraz";

// BASE_URL is "/" by default; set VITE_BASE=/repo-name/ only for GitHub Pages project sites.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<Altraz />} />
        <Route path="/feed" element={<Altraz />} />
        <Route path="/youtube-scams" element={<Altraz key="scams" initial="scams" />} />
        <Route path="/check-video" element={<Altraz key="video" initial="video" />} />
        <Route path="/check-forward" element={<Altraz key="forward" initial="forward" />} />
        <Route path="/verify-link" element={<Altraz key="link" initial="link" />} />
        <Route path="/about" element={<Altraz key="about" initial="about" />} />
        <Route path="/terms" element={<Altraz key="terms" initial="terms" />} />
        <Route path="/profile" element={<Altraz key="profile" initial="profile" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
