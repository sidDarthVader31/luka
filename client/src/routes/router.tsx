import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "../screens/app-shell";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
  },
]);
