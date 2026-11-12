import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { Catalog, CatalogItem, Workload } from "../../lib/api";
import { useCatalog } from "../catalog/useCatalog";
import { writeLastRunPassed } from "../problems/problem-status";
import { useProblem } from "../problems/useProblems";
import { BriefPanel } from "./BriefPanel";
import { Canvas, type CanvasView } from "./Canvas";
import { ComponentLibrary } from "./ComponentLibrary";
import { Inspector } from "./Inspector";
import { ResultOverlay } from "./ResultOverlay";
import { ResultsPanel } from "./ResultsPanel";
import { type EditorIssue, TopBar } from "./TopBar";
import { TrafficBar } from "./TrafficBar";
import { targetSummary } from "./lib/results";
import {
  addElements,
  replaceElements,
  selectElement,
  selectElements,
  updateLukaData,
  viewportCenter,
} from "./scene-actions";
import { insertComponent, makeComponent } from "./scene/insert-component";
import { resolveSelection } from "./scene/selection";
import { strokeStyleFor } from "./scene/style";
import type { ConnectionData } from "./scene/types";
import { type DesignDocument, useDesignDocument } from "./useDesignDocument";
import { DEFAULT_WORKLOAD, runSignature, useSimulation } from "./useSimulation";
import "./EditorPage.css";

export function EditorPage() {
  const { designId = "" } = useParams();
  const catalogState = useCatalog();
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const doc = useDesignDocument(designId, catalog);

  if (catalogState.status === "error") {
    return (
      <EditorError
        title="Couldn't load the component catalog"
        detail={`GET /catalog failed: ${catalogState.message}. The editor needs it to know what each component is.`}
      />
    );
  }
  if (doc.status === "error") {
    return <EditorError title="Couldn't open this design" detail={doc.message} />;
  }
  if (!catalog || doc.status !== "ready") {
    return <p className="editor-status">Loading…</p>;
  }
  return <EditorWorkspace key={doc.design.id} doc={doc} catalog={catalog} />;
}

function EditorError(props: { title: string; detail: string }) {
  return (
    <div className="editor-status" role="alert">
      <h1>{props.title}</h1>
      <p>{props.detail}</p>
      <div className="editor-status__actions">
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Try again
        </button>
        <Link className="btn" to="/">
          Back to home
        </Link>
      </div>
    </div>
  );
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
  const [ownWorkload, setOwnWorkload] = useState<Workload>(DEFAULT_WORKLOAD);
  const [resultsOpen, setResultsOpen] = useState(false);
  const simulation = useSimulation();
  const { derived, design } = doc;
  const { problem, error: problemError } = useProblem(design.problem_id);

  // A problem fixes the workload; the server uses it, so the client sends none.
  const workload = problem?.workload ?? ownWorkload;
  const sentWorkload = design.problem_id ? undefined : ownWorkload;
  const result = simulation.result;
  const stale =
    simulation.signature !== null &&
    simulation.signature !== runSignature(derived.graph, sentWorkload);
  const targets = useMemo(() => targetSummary(result?.targets), [result]);

  const issues = useMemo<EditorIssue[]>(() => {
    const warnings = derived.warnings.map<EditorIssue>((warning) => ({
      ...warning,
      severity: "warning",
    }));
    const errors: EditorIssue[] = [];
    if (simulation.error) {
      errors.push({ message: simulation.error, elementIds: [], severity: "error" });
    }
    if (problemError) {
      errors.push({
        message: `Couldn't load the problem: ${problemError}`,
        elementIds: [],
        severity: "error",
      });
    }
    return [...errors, ...warnings];
  }, [derived, simulation.error, problemError]);

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
    const next = await simulation.run(
      {
        id: design.id,
        name: doc.name || "Untitled design",
        problem_id: design.problem_id,
        graph: derived.graph,
      },
      sentWorkload,
    );
    if (!next) {
      return;
    }
    const summary = targetSummary(next.targets);
    if (summary) {
      writeLastRunPassed(design.id, summary.allPassed);
    }
    setResultsOpen(true);
  };

  const selectNodes = (nodeIds: string[]) => {
    const elementIds = nodeIds.flatMap((id) => derived.elementIdByNodeId.get(id) ?? []);
    if (api && elementIds.length > 0) {
      selectElements(api, elementIds);
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
        targets={targets}
        onTargetsClick={() => setResultsOpen(true)}
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
              result={resultsOpen ? result : null}
            />
            {problem ? (
              <div className="editor__brief">
                <BriefPanel problem={problem} results={result?.targets} />
              </div>
            ) : null}
            <div className="editor__inspector">
              <Inspector
                target={selection}
                catalog={catalog}
                onComponentChange={(elementId, properties) =>
                  api && updateLukaData(api, elementId, { properties })
                }
                onConnectionChange={(elementId, patch) => {
                  if (!api || selection?.kind !== "connection") {
                    return;
                  }
                  // Write the full data so the arrow keeps its edge id after duplication.
                  // A cleared weight stays as `undefined`, which JSON drops on save.
                  const data: ConnectionData = { ...selection.data, ...patch };
                  updateLukaData(api, elementId, data, { strokeStyle: strokeStyleFor(data.mode) });
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
                onWorkloadChange={setOwnWorkload}
                lockedBy={problem?.title}
              />
            </div>
          </Canvas>
        </div>
        {resultsOpen && result ? (
          <div className="editor__results">
            <ResultsPanel
              result={result}
              stale={stale}
              onSelectNodes={selectNodes}
              onClose={() => setResultsOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
