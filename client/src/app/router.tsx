import { createBrowserRouter } from "react-router-dom";

import { DesignEditorPage } from "../features/editor/DesignEditorPage";
import { DesignLibraryPage } from "../features/library/DesignLibraryPage";

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
]);
