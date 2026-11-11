import { getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Catalog, type Design, getDesign, updateDesign } from "../../lib/api";
import { graphToScene } from "./scene/graph-to-scene";
import { migrateSceneElements } from "./scene/migrate";
import { type DerivedGraph, sceneToGraph } from "./scene/scene-to-graph";
import { type LukaScene, type PersistedAppState, isScene } from "./scene/types";

const AUTOSAVE_DELAY_MS = 800;

export type SaveState = "saved" | "unsaved" | "saving" | "error";

export type DesignDocument =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      design: Design;
      initialScene: LukaScene;
      name: string;
      setName: (name: string) => void;
      elements: readonly ExcalidrawElement[];
      /** Feed every Excalidraw onChange here; appState-only changes are ignored. */
      onElementsChange: (
        elements: readonly ExcalidrawElement[],
        appState: PersistedAppState,
      ) => void;
      derived: DerivedGraph;
      saveState: SaveState;
    };

/** Loads a design, derives its graph from the scene and autosaves both. */
export function useDesignDocument(designId: string, catalog: Catalog | null): DesignDocument {
  const [loaded, setLoaded] = useState<{ design: Design; scene: LukaScene } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setNameState] = useState("");
  const [elements, setElements] = useState<readonly ExcalidrawElement[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [revision, setRevision] = useState(0);

  const sceneVersion = useRef(0);
  const appState = useRef<PersistedAppState>({});
  const latestRevision = useRef(0);
  latestRevision.current = revision;

  useEffect(() => {
    if (!catalog) {
      return;
    }
    let active = true;
    setLoaded(null);
    setLoadError(null);
    getDesign(designId)
      .then((design) => {
        if (!active) {
          return;
        }
        const scene = isScene(design.scene)
          ? {
              ...design.scene,
              elements: migrateSceneElements(design.scene.elements),
              appState: design.scene.appState ?? {},
            }
          : graphToScene(design.graph, catalog.items);
        sceneVersion.current = getSceneVersion(scene.elements);
        appState.current = scene.appState;
        setLoaded({ design, scene });
        setNameState(design.name);
        setElements(scene.elements);
        setSaveState("saved");
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load this design");
        }
      });
    return () => {
      active = false;
    };
  }, [designId, catalog]);

  const markDirty = useCallback(() => {
    setSaveState("unsaved");
    setRevision((value) => value + 1);
  }, []);

  const onElementsChange = useCallback(
    (next: readonly ExcalidrawElement[], nextAppState: PersistedAppState) => {
      const version = getSceneVersion(next);
      if (version === sceneVersion.current) {
        return;
      }
      sceneVersion.current = version;
      appState.current = nextAppState;
      // Excalidraw reuses and mutates the array it passes; copy it so React sees a change.
      setElements([...next]);
      markDirty();
    },
    [markDirty],
  );

  const setName = useCallback(
    (next: string) => {
      setNameState(next);
      markDirty();
    },
    [markDirty],
  );

  const derived = useMemo(
    () => sceneToGraph(elements, catalog?.items ?? []),
    [elements, catalog],
  );

  // Debounced autosave of name, scene and derived graph.
  const latest = useRef({ name, derived, elements });
  latest.current = { name, derived, elements };
  useEffect(() => {
    if (revision === 0 || !loaded) {
      return;
    }
    const timer = window.setTimeout(() => {
      const {
        name: currentName,
        derived: currentDerived,
        elements: currentElements,
      } = latest.current;
      const scene: LukaScene = {
        type: "luka-scene",
        version: 1,
        elements: currentElements.filter((element) => !element.isDeleted),
        appState: appState.current,
      };
      const savedRevision = revision;
      setSaveState("saving");
      updateDesign(loaded.design.id, {
        name: currentName.trim() || "Untitled design",
        graph: currentDerived.graph,
        scene,
      })
        .then(() =>
          setSaveState((state) => (latestRevision.current === savedRevision ? "saved" : state)),
        )
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [revision, loaded]);

  if (loadError) {
    return { status: "error", message: loadError };
  }
  if (!loaded) {
    return { status: "loading" };
  }
  return {
    status: "ready",
    design: loaded.design,
    initialScene: loaded.scene,
    name,
    setName,
    elements,
    onElementsChange,
    derived,
    saveState,
  };
}
