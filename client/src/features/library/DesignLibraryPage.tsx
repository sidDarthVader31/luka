import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getDesign, listDesigns, type Design } from "../../lib/api";

const SAMPLES = [
  {
    id: "sample-cache-aside",
    title: "Cache-aside read path",
    body: "Client → service → cache → DB on miss. Great first demo.",
  },
  {
    id: "sample-queue-workflow",
    title: "Queue write path",
    body: "Gateway → service → queue → worker → DB with fanout.",
  },
];

export function DesignLibraryPage() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const items = await listDesigns();
        setDesigns(items.filter((item) => !item.id.startsWith("sample-")));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list designs");
      }
    })();
  }, []);

  return (
    <main className="library-page">
      <div className="library-page__inner">
        <header className="library-page__header">
          <p className="brand">Luka</p>
          <h1>Design library</h1>
          <p className="lead">
            Open a blank canvas, load a sample architecture, or continue a saved design.
            Built for interview practice and architecture review what-ifs.
          </p>
        </header>

        <section className="library-grid" style={{ marginBottom: "1.5rem" }}>
          <Link className="library-card" to="/designs/new">
            <h2>Blank design</h2>
            <p>Start fresh and drag components onto the blueprint canvas.</p>
          </Link>
          <Link className="library-card" to="/draft">
            <h2>Ad-hoc draft</h2>
            <p>Scratch pad that stays unsaved until you choose Save.</p>
          </Link>
        </section>

        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Samples</h2>
        <section className="library-grid" style={{ marginBottom: "1.75rem" }}>
          {SAMPLES.map((sample) => (
            <SampleCard key={sample.id} {...sample} />
          ))}
        </section>

        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Saved designs</h2>
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        <section className="library-grid">
          {designs.map((design) => (
            <Link className="library-card" key={design.id} to={`/designs/${design.id}`}>
              <h2>{design.name}</h2>
              <p>{design.description || `${design.graph.nodes.length} nodes`}</p>
            </Link>
          ))}
          {designs.length === 0 && !error ? (
            <div className="library-card">
              <h2>No saved designs yet</h2>
              <p>Save from the editor to see designs listed here.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SampleCard(props: { id: string; title: string; body: string }) {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    void getDesign(props.id)
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false));
  }, [props.id]);

  if (!available) {
    return (
      <div className="library-card">
        <h2>{props.title}</h2>
        <p>Sample unavailable from API.</p>
      </div>
    );
  }

  return (
    <Link className="library-card" to={`/designs/${props.id}`}>
      <h2>{props.title}</h2>
      <p>{props.body}</p>
    </Link>
  );
}
