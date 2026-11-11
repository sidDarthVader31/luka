import { IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  type Design,
  createDesign,
  duplicateDesign,
  listDesigns,
  listTemplates,
} from "../../lib/api";
import { allTrafficTemplate } from "../editor/lib/traffic-paths";
import "./HomePage.css";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function describe(design: Design) {
  const count = design.graph.nodes.length;
  return design.description || `${count} component${count === 1 ? "" : "s"}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [templates, setTemplates] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDesigns()
      .then(setDesigns)
      .catch((err: unknown) => setError(errorMessage(err, "Could not load your designs")));
    listTemplates()
      .then(setTemplates)
      .catch((err: unknown) => setError(errorMessage(err, "Could not load templates")));
  }, []);

  async function open(action: () => Promise<Design>) {
    setBusy(true);
    try {
      const design = await action();
      navigate(`/designs/${design.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not open the design"));
      setBusy(false);
    }
  }

  const sortedDesigns = [...(designs ?? [])].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );

  return (
    <main className="home">
      <header className="home__header">
        <p className="home__brand">Luka</p>
        <h1>Practise system design</h1>
        <p>Sketch an architecture, set the traffic, and see where it breaks.</p>
      </header>

      {error ? <p className="home__error">{error}</p> : null}

      <button
        type="button"
        className="btn btn--primary home__blank"
        disabled={busy}
        onClick={() =>
          void open(() =>
            createDesign({
              name: "Untitled design",
              graph: { nodes: [], edges: [], request_classes: allTrafficTemplate() },
            }),
          )
        }
      >
        <IconPlus size={18} aria-hidden />
        Blank sandbox
      </button>

      <section className="home__section">
        <h2>Templates</h2>
        <div className="home__grid">
          {templates?.map((template) => (
            <button
              key={template.id}
              type="button"
              className="home__card"
              disabled={busy}
              onClick={() => void open(() => duplicateDesign(template.id, { name: template.name }))}
            >
              <h3>{template.name}</h3>
              <p>{describe(template)}</p>
            </button>
          ))}
          {templates?.length === 0 ? <p className="home__empty">No templates yet.</p> : null}
        </div>
      </section>

      <section className="home__section">
        <h2>Your designs</h2>
        <div className="home__grid">
          {sortedDesigns.map((design) => (
            <Link key={design.id} className="home__card" to={`/designs/${design.id}`}>
              <h3>{design.name}</h3>
              <p>{describe(design)}</p>
            </Link>
          ))}
          {designs?.length === 0 ? (
            <p className="home__empty">Nothing yet. Start with a blank sandbox or a template.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
