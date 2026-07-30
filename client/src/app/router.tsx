import { createBrowserRouter } from "react-router-dom";

import { CompareRunsPage } from "../features/compare/CompareRunsPage";
import { DesignEditorPage } from "../features/editor/DesignEditorPage";
import { DesignLibraryPage } from "../features/library/DesignLibraryPage";
import { PresentModePage } from "../features/present/PresentModePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DesignLibraryPage />,
  },
  {
    path: "/designs/new",
    element: <DesignEditorPage mode="new" />,
  },
  {
    path: "/draft",
    element: <DesignEditorPage mode="draft" />,
  },
  {
    path: "/designs/:designId",
    element: <DesignEditorPage mode="saved" />,
  },
  {
    path: "/designs/:designId/present",
    element: <PresentModePage />,
  },
  {
    path: "/designs/:designId/compare",
    element: <CompareRunsPage />,
  },
]);
