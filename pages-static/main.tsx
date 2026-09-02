import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { InscricaoPage } from "@/components/InscricaoPage";
import { AdminPage } from "@/components/AdminPage";
import "@/styles.css";

// Roteamento por hash para funcionar em hospedagem estática:
// site normal em "/", área restrita em "#/admin"
function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.startsWith("#/admin") ? <AdminPage /> : <InscricaoPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
