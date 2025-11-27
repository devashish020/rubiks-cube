import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Leva } from "leva";
import "./index.css";
import App from "./App";

// Get the root element from the HTML
const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

// Render the app with StrictMode for better development warnings
// Leva is hidden so the control panel doesn't show
root.render(
  <StrictMode>
    <App />
    <Leva hidden />
  </StrictMode>
);
