import { createBrowserRouter } from "react-router-dom";

import { HomePage } from "../features/home/HomePage";

function RouteLoading() {
  return <p className="route-loading">Loading…</p>;
}

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  {
    path: "/designs/:designId",
    // Excalidraw is large: the editor is a separate chunk, loaded only when a design is opened.
    lazy: () =>
      import("../features/editor/EditorPage").then((module) => ({
        Component: module.EditorPage,
      })),
    HydrateFallback: RouteLoading,
  },
]);
