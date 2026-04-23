import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.lang = "pt-BR";
document.documentElement.setAttribute("translate", "no");
document.documentElement.classList.add("notranslate");

const currentPath = window.location.pathname;
if (!window.location.hash && currentPath.startsWith("/eventServiceSupplierChat/")) {
  const token = currentPath.replace("/eventServiceSupplierChat/", "").replace(/^\/+/, "").trim();
  if (token) {
    window.history.replaceState(null, "", `${window.location.origin}/#/eventServiceSupplierChat/${encodeURIComponent(token)}`);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
