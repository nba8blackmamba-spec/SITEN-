import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { TableBoardPage } from "./TableBoard.jsx";
import { SeisekiAdminPage } from "./seiseki/SeisekiAdmin.jsx";

const path = window.location.pathname.replace(/\/+$/, "");
const isBoardPage = path === "/board";
const isSeisekiAdminPage = path === "/seiseki/admin";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBoardPage ? <TableBoardPage /> : isSeisekiAdminPage ? <SeisekiAdminPage /> : <App />}
  </React.StrictMode>
);
