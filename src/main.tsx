import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* HashRouter (et non BrowserRouter) parce qu'on déploie sur
        GitHub Pages : les chemins propres /historique nécessitent une
        config serveur que GH Pages ne fait pas. Hash = #/historique → OK. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
