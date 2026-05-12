import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDarkMode } from "@collab/shared/dark-mode";
import "@collab/theme/styles.css";
import { AnalyticsProvider } from "../../shared/PostHogProvider";

initDarkMode();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </StrictMode>,
);
