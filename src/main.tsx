import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  initDiscordActivity,
  showActivityBootError
} from "./discordActivity";

async function start() {
  try {
    const activity = await initDiscordActivity();

    if (!activity.allowed) {
      return;
    }

    const rootElement = document.getElementById("root");

    if (!rootElement) {
      throw new Error("The Tactical Centre root element is missing.");
    }

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    showActivityBootError(error);
  }
}

void start();
