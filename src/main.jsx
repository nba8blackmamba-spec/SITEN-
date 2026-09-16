import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { TableBoardPage } from "./TableBoard.jsx";

const isBoardPage = window.location.pathname.replace(/\/+$/, "") === "/board";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBoardPage ? <TableBoardPage /> : <App />}
  </React.StrictMode>
);
