import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "./app/router";
import "@xyflow/react/dist/style.css";
import "./shared/styles/tokens.css";
import "./shared/styles/shell.css";
import "./shared/styles/nodes.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
