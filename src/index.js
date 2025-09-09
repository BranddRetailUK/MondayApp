import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Import global styles if you had any CSS
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
