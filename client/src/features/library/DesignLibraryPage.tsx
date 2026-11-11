import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { duplicateDesign, listDesigns, listTemplates, type Design } from "../../lib/api";

export function DesignLibraryPage() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [templates, setTemplates] = useState<Design[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [openingID, setOpeningID] = useState<string | null>(null);

  useEffect(() => {
    void listDesigns()
      .then(setDesigns)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to list designs"));
    void listTemplates()
      .then(setTemplates)
      .catch((err) =>
        setTemplateError(err instanceof Error ? err.message : "Failed to list samples"),
      );
  }, []);

  async function openTemplate(template: Design) {
    setOpeningID(template.id);
    try {
      const copy = await duplicateDesign(template.id, { name: template.name });
      navigate(`/designs/${copy.id}`);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to open sample");
      setOpeningID(null);
    }
  }

  return (
    <main className="library-page">
      <div className="library-page__inner">
        <header className="library-page__header">
          <p className="brand">Luka</p>
          <h1>Design library</h1>
          <p className="lead">
            Open a blank canvas, start from a sample architecture, or continue a saved design. Built
            for system design interview practice.
          </p>
        </header>

        <section className="library-grid library-grid--spaced-sm">
          <Link className="library-card" to="/designs/new">
            <h2>Blank design</h2>
            <p>Start fresh and drag components onto the blueprint canvas.</p>
          </Link>
          <Link className="library-card" to="/draft">
            <h2>Ad-hoc draft</h2>
            <p>Scratch pad that stays unsaved until you choose Save.</p>
          </Link>
        </section>

        <h2 className="library-section-title">Samples</h2>
        {templateError ? <p className="library-error">{templateError}</p> : null}
        <section className="library-grid library-grid--spaced-lg">
          {templates.map((template) => (
            <button
              className="library-card"
              key={template.id}
              type="button"
              disabled={openingID !== null}
              onClick={() => void openTemplate(template)}
            >
              <h2>{template.name}</h2>
              <p>{template.description || `${template.graph.nodes.length} nodes`}</p>
            </button>
          ))}
          {templates.length === 0 && !templateError ? (
            <div className="library-card">
              <h2>No samples available</h2>
            </div>
          ) : null}
        </section>

        <h2 className="library-section-title">Saved designs</h2>
        {error ? <p className="library-error">{error}</p> : null}
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
