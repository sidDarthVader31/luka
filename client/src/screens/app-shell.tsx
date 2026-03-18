import { useEffect, useState } from "react";

import type { ComponentArchetype, Design, Run } from "../lib/api";
import {
  createDesign,
  createRun,
  getDesign,
  getRun,
  getStatus,
  listComponentArchetypes,
  updateDesign,
} from "../lib/api";
import { buildDemoDesign } from "../lib/demo-design";

const sampleDesignID = "sample-cache-aside";

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [feedback, setFeedback] = useState(
    "Use this screen to hit the live Luka APIs.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [activeDesign, setActiveDesign] = useState<Design | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [requestsPerSecond, setRequestsPerSecond] = useState("100000");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      const [status, archetypes, design] = await Promise.all([
        getStatus(),
        listComponentArchetypes(),
        getDesign(sampleDesignID),
      ]);

      setApiStatus(`${status.name} ${status.version} (${status.api})`);
      setCatalog(archetypes);
      setActiveDesign(design);
      setFeedback("Backend connected. Sample design loaded.");
    } catch (error) {
      setApiStatus("Backend unavailable");
      setFeedback(readError(error));
    }
  }

  async function withAction<T>(
    label: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    setBusyAction(label);
    setFeedback(`${label}...`);

    try {
      return await action();
    } catch (error) {
      setFeedback(readError(error));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLoadSample() {
    const design = await withAction("Loading sample design", () =>
      getDesign(sampleDesignID),
    );
    if (!design) {
      return;
    }

    setActiveDesign(design);
    setFeedback(`Loaded design ${design.id}.`);
  }

  async function handleCreateDemoDesign() {
    const design = await withAction("Creating demo design", () =>
      createDesign(buildDemoDesign("UI Demo Design")),
    );
    if (!design) {
      return;
    }

    setActiveDesign(design);
    setFeedback(`Created design ${design.id}.`);
  }

  async function handleUpdateActiveDesign() {
    if (!activeDesign) {
      setFeedback("Load or create a design before updating it.");
      return;
    }

    const updatedDesign = await withAction("Updating active design", () =>
      updateDesign(activeDesign.id, {
        name: `${activeDesign.name} (Updated)`,
        description: "Updated from the Luka UI integration console.",
      }),
    );
    if (!updatedDesign) {
      return;
    }

    setActiveDesign(updatedDesign);
    setFeedback(`Updated design ${updatedDesign.id}.`);
  }

  async function handleCreateRun() {
    if (!activeDesign) {
      setFeedback("Load or create a design before starting a run.");
      return;
    }

    const rps = Number(requestsPerSecond);
    if (!Number.isFinite(rps) || rps <= 0) {
      setFeedback("Requests per second must be a positive number.");
      return;
    }

    const run = await withAction("Creating run", () =>
      createRun({
        design_id: activeDesign.id,
        workload: {
          requests_per_second: rps,
        },
        simulation_config: {
          mode: "analytical",
        },
      }),
    );
    if (!run) {
      return;
    }

    setLastRun(run);
    setFeedback(`Created run ${run.id}.`);
  }

  async function handleReloadLastRun() {
    if (!lastRun) {
      setFeedback("Create a run before reloading it.");
      return;
    }

    const run = await withAction("Reloading run", () => getRun(lastRun.id));
    if (!run) {
      return;
    }

    setLastRun(run);
    setFeedback(`Reloaded run ${run.id}.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Luka</p>
          <h1>System design, but stress-tested.</h1>
          <p className="lede">
            This is the first UI integration pass. It exercises the real Go
            backend by loading archetypes, fetching designs, creating designs,
            updating them, and creating simulation runs.
          </p>
        </div>

        <aside className="hero-panel">
          <span className="panel-label">Backend status</span>
          <strong>{apiStatus}</strong>
          <p>{feedback}</p>
        </aside>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">API Controls</p>
              <h2>Drive the backend</h2>
            </div>
            {busyAction ? <span className="badge busy">{busyAction}</span> : null}
          </div>

          <div className="control-stack">
            <label className="field">
              <span>Requests per second</span>
              <input
                inputMode="numeric"
                value={requestsPerSecond}
                onChange={(event) => setRequestsPerSecond(event.target.value)}
              />
            </label>

            <div className="button-row">
              <button onClick={handleLoadSample} disabled={busyAction !== null}>
                Load sample design
              </button>
              <button
                onClick={handleCreateDemoDesign}
                disabled={busyAction !== null}
              >
                Create demo design
              </button>
              <button
                onClick={handleUpdateActiveDesign}
                disabled={busyAction !== null}
              >
                Update active design
              </button>
            </div>

            <div className="button-row">
              <button onClick={handleCreateRun} disabled={busyAction !== null}>
                Create run
              </button>
              <button
                onClick={handleReloadLastRun}
                disabled={busyAction !== null}
              >
                Reload last run
              </button>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Active design</p>
              <h2>{activeDesign?.name ?? "No design loaded"}</h2>
            </div>
            {activeDesign ? <span className="badge">{activeDesign.id}</span> : null}
          </div>

          {activeDesign ? (
            <div className="metric-stack">
              <p>{activeDesign.description || "No description provided."}</p>

              <div className="metric-grid">
                <div className="metric-card">
                  <span>Nodes</span>
                  <strong>{activeDesign.graph.nodes.length}</strong>
                </div>
                <div className="metric-card">
                  <span>Edges</span>
                  <strong>{activeDesign.graph.edges.length}</strong>
                </div>
              </div>

              <ul className="simple-list">
                {activeDesign.graph.nodes.map((node) => (
                  <li key={node.id}>
                    <strong>{node.label}</strong>
                    <span>{node.archetype}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="empty-state">
              No design loaded yet. Start by loading the sample or creating a
              demo design.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Latest run</p>
              <h2>{lastRun?.id ?? "No run created"}</h2>
            </div>
            {lastRun ? <span className="badge">{lastRun.status}</span> : null}
          </div>

          {lastRun?.result ? (
            <div className="metric-stack">
              <p>{lastRun.result.summary}</p>

              {lastRun.result.bottleneck ? (
                <div className="result-callout">
                  <span className="panel-label">Bottleneck</span>
                  <strong>{lastRun.result.bottleneck.label}</strong>
                  <p>{lastRun.result.bottleneck.explanation}</p>
                </div>
              ) : null}

              <div className="metric-grid">
                {lastRun.result.nodes.map((node) => (
                  <div className="metric-card" key={node.node_id}>
                    <span>{node.label}</span>
                    <strong>{Math.round(node.utilization * 100)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-state">
              Create a run to inspect the bottleneck and node metrics.
            </p>
          )}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Component catalog</p>
              <h2>Backend-powered archetypes</h2>
            </div>
          </div>

          <ul className="catalog-list">
            {catalog.map((item) => (
              <li className="catalog-item" key={item.archetype}>
                <div>
                  <strong>{item.display_name}</strong>
                  <p>{item.archetype}</p>
                </div>
                <small>{item.supported_routing_rules.join(", ")}</small>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the Luka API.";
}
