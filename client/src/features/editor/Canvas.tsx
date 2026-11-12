import { Excalidraw, MainMenu, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIOptions,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { type DragEvent, type ReactNode, useCallback, useMemo, useRef } from "react";

import { reassignDuplicatedIds } from "./scene/insert-component";
import type { LukaScene, PersistedAppState } from "./scene/types";
import "./Canvas.css";

export const COMPONENT_DRAG_TYPE = "application/x-luka-component";

export type CanvasView = {
  scrollX: number;
  scrollY: number;
  zoom: number;
  selectedIds: string[];
};

const UI_OPTIONS: Partial<UIOptions> = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: true,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: true,
    toggleTheme: false,
  },
  tools: { image: false },
};

type CanvasProps = {
  initialScene: LukaScene;
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onElementsChange: (elements: readonly ExcalidrawElement[], appState: PersistedAppState) => void;
  onViewChange: (view: CanvasView) => void;
  onDropComponent: (componentId: string, scenePoint: { x: number; y: number }) => void;
  /** Rendered above the canvas, in the same coordinate space (overlay, floating panels). */
  children?: ReactNode;
};

function sameView(a: CanvasView | null, b: CanvasView): boolean {
  return (
    a !== null &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.zoom === b.zoom &&
    a.selectedIds.length === b.selectedIds.length &&
    a.selectedIds.every((id, index) => id === b.selectedIds[index])
  );
}

/** Excalidraw wrapper. Mount once per design (key it by design id). */
export function Canvas(props: CanvasProps) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastView = useRef<CanvasView | null>(null);
  const fitted = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;

  // Excalidraw reads initialData once; keep it stable.
  const initialData = useMemo<ExcalidrawInitialDataState>(
    () => ({
      elements: props.initialScene.elements,
      appState: { ...props.initialScene.appState, theme: "light" },
    }),
    [props.initialScene],
  );

  const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState) => {
    // Frame the design once it has loaded. (initialData's scrollToContent ignores our layout.)
    if (!fitted.current && api.current) {
      fitted.current = true;
      if (elements.some((element) => !element.isDeleted)) {
        api.current.scrollToContent(undefined, {
          fitToViewport: true,
          viewportZoomFactor: 0.7,
          maxZoom: 1,
        });
      }
    }
    callbacks.current.onElementsChange(elements, {
      viewBackgroundColor: appState.viewBackgroundColor,
    });
    const view: CanvasView = {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom.value,
      selectedIds: Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      ),
    };
    if (!sameView(lastView.current, view)) {
      lastView.current = view;
      callbacks.current.onViewChange(view);
    }
  }, []);

  const handleApi = useCallback((instance: ExcalidrawImperativeAPI) => {
    api.current = instance;
    callbacks.current.onApi(instance);
  }, []);

  const handleDuplicate = useCallback(
    (next: readonly ExcalidrawElement[], previous: readonly ExcalidrawElement[]) =>
      reassignDuplicatedIds(next, previous),
    [],
  );

  function handleDragOver(event: DragEvent) {
    if (event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(event: DragEvent) {
    const componentId = event.dataTransfer.getData(COMPONENT_DRAG_TYPE);
    if (!componentId || !api.current) {
      return;
    }
    // Stop Excalidraw from treating the drop as a file import.
    event.preventDefault();
    event.stopPropagation();
    const point = viewportCoordsToSceneCoords(
      { clientX: event.clientX, clientY: event.clientY },
      api.current.getAppState(),
    );
    callbacks.current.onDropComponent(componentId, point);
  }

  return (
    <div className="canvas" onDragOverCapture={handleDragOver} onDropCapture={handleDrop}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={handleApi}
        onChange={handleChange}
        onDuplicate={handleDuplicate}
        UIOptions={UI_OPTIONS}
        theme="light"
        aiEnabled={false}
        handleKeyboardGlobally
        isCollaborating={false}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
      {props.children}
    </div>
  );
}
