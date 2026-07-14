import React from "react";
import ReactDOM from "react-dom/client";
import { initDarkMode } from "@collab/shared/dark-mode";
import "@collab/shared/styles/Theme.css";
import App from "./App";
import { AnalyticsProvider } from "../../shared/PostHogProvider";

initDarkMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </React.StrictMode>,
);
