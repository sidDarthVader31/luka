import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type { Catalog, CatalogItem, Workload } from "../../lib/api";
import { useCatalog } from "../catalog/useCatalog";
import { Canvas, type CanvasView } from "./Canvas";
import { ComponentLibrary } from "./ComponentLibrary";
import { Inspector } from "./Inspector";
import { ResultOverlay } from "./ResultOverlay";
import { ResultsPanel } from "./ResultsPanel";
import { type EditorIssue, TopBar } from "./TopBar";
import { TrafficBar } from "./TrafficBar";
import { validateGraphForRun } from "./lib/graph-validation";
import { OVERALL, resultViews } from "./lib/result-view";
import {
  addElements,
  replaceElements,
  selectElement,
  updateLukaData,
  viewportCenter,
} from "./scene-actions";
import { insertComponent, makeComponent } from "./scene/insert-component";
import { resolveSelection } from "./scene/selection";
import { type DesignDocument, useDesignDocument } from "./useDesignDocument";
import { DEFAULT_WORKLOAD, graphSignature, useSimulation } from "./useSimulation";
import "./EditorPage.css";

export function EditorPage() {
  const { designId = "" } = useParams();
  const catalogState = useCatalog();
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const doc = useDesignDocument(designId, catalog);

  if (catalogState.status === "error" || doc.status === "error") {
    const message =
      catalogState.status === "error" ? catalogState.message : (doc as { message: string }).message;
    return <p className="editor-status">Couldn't open this design: {message}</p>;
  }
  if (!catalog || doc.status !== "ready") {
    return <p className="editor-status">Loading…</p>;
  }
  return <EditorWorkspace key={doc.design.id} doc={doc} catalog={catalog} />;
}

const INITIAL_VIEW: CanvasView = { scrollX: 0, scrollY: 0, zoom: 1, selectedIds: [] };

function EditorWorkspace({
  doc,
  catalog,
}: {
  doc: Extract<DesignDocument, { status: "ready" }>;
  catalog: Catalog;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [view, setView] = useState<CanvasView>(INITIAL_VIEW);
  const [workload, setWorkload] = useState<Workload>(DEFAULT_WORKLOAD);
  const [activeResultId, setActiveResultId] = useState(OVERALL);
  const [resultsOpen, setResultsOpen] = useState(false);
  const simulation = useSimulation();
  const { derived } = doc;

  const views = useMemo(
    () => (simulation.result ? resultViews(simulation.result) : []),
    [simulation.result],
  );
  const activeView = views.find((entry) => entry.id === activeResultId) ?? views[0] ?? null;
  const stale =
    simulation.signature !== null && simulation.signature !== graphSignature(derived.graph);

  const issues = useMemo<EditorIssue[]>(() => {
    const preflight = validateGraphForRun(derived.graph).map((issue) => ({
      message: issue.message,
      elementIds: issue.nodeIds.flatMap((id) => derived.elementIdByNodeId.get(id) ?? []),
      blocking: true,
    }));
    const warnings = derived.warnings.map((warning) => ({ ...warning, blocking: false }));
    return simulation.error
      ? [{ message: simulation.error, elementIds: [], blocking: false }, ...preflight, ...warnings]
      : [...preflight, ...warnings];
  }, [derived, simulation.error]);

  const selection = useMemo(
    () => resolveSelection(view.selectedIds, doc.elements, catalog.items, derived),
    [view.selectedIds, doc.elements, catalog, derived],
  );

  const insertAt = useCallback(
    (item: CatalogItem, point: { x: number; y: number }) => {
      if (!api) {
        return;
      }
      const created = insertComponent(item, api.getSceneElements(), point);
      addElements(api, created, created[0]?.id);
    },
    [api],
  );

  const run = async () => {
    await simulation.run(
      { id: doc.design.id, name: doc.name || "Untitled design", graph: derived.graph },
      workload,
    );
    setActiveResultId(OVERALL);
    setResultsOpen(true);
  };

  const selectNode = (nodeId: string) => {
    const elementId = derived.elementIdByNodeId.get(nodeId);
    if (api && elementId) {
      selectElement(api, elementId);
    }
  };

  return (
    <div className="editor">
      <TopBar
        name={doc.name}
        onNameChange={doc.setName}
        saveState={doc.saveState}
        issues={issues}
        onIssueClick={(issue) =>
          api && issue.elementIds[0] && selectElement(api, issue.elementIds[0])
        }
        running={simulation.running}
        onRun={() => void run()}
      />
      <div className="editor__main">
        <div className="editor__library">
          <ComponentLibrary
            catalog={catalog}
            onInsert={(item) => api && insertAt(item, viewportCenter(api))}
          />
        </div>
        <div className="editor__canvas">
          <Canvas
            initialScene={doc.initialScene}
            onApi={setApi}
            onElementsChange={doc.onElementsChange}
            onViewChange={setView}
            onDropComponent={(componentId, point) => {
              const item = catalog.items.find((entry) => entry.id === componentId);
              if (item) {
                insertAt(item, point);
              }
            }}
          >
            <ResultOverlay
              elements={doc.elements}
              view={view}
              derived={derived}
              catalog={catalog.items}
              result={resultsOpen ? activeView : null}
            />
            <div className="editor__inspector">
              <Inspector
                target={selection}
                catalog={catalog}
                requestClasses={doc.requestClasses}
                onComponentChange={(elementId, properties) =>
                  api && updateLukaData(api, elementId, { properties })
                }
                onConnectionChange={(elementId, patch) => {
                  if (!api || selection?.kind !== "connection") {
                    return;
                  }
                  // Write the resolved edge id so the arrow keeps it after duplication.
                  updateLukaData(api, elementId, { edgeId: selection.edge.id, ...patch });
                }}
                onMakeComponent={(elementId, item) => {
                  const shape = api?.getSceneElements().find((entry) => entry.id === elementId);
                  if (api && shape) {
                    replaceElements(api, makeComponent(shape, item, api.getSceneElements()));
                  }
                }}
              />
            </div>
            <div className="editor__traffic">
              <TrafficBar
                workload={workload}
                onWorkloadChange={setWorkload}
                requestClasses={doc.requestClasses}
                onRequestClassesChange={doc.setRequestClasses}
                edges={derived.graph.edges}
              />
            </div>
          </Canvas>
        </div>
        {resultsOpen && views.length > 0 ? (
          <div className="editor__results">
            <ResultsPanel
              views={views}
              activeId={activeView?.id ?? OVERALL}
              onActiveChange={setActiveResultId}
              stale={stale}
              onSelectNode={selectNode}
              onClose={() => setResultsOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
