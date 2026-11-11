import { createBrowserRouter } from "react-router-dom";

import { HomePage } from "../features/home/HomePage";

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  {
    path: "/designs/:designId",
    // Excalidraw is large; load it only when a design is opened.
    lazy: () =>
      import("../features/editor/EditorPage").then((module) => ({
        Component: module.EditorPage,
      })),
  },
]);
