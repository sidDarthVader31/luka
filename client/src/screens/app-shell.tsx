export function AppShell() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Luka</p>
        <h1>System design, but stress-tested.</h1>
        <p className="lede">
          Model a distributed system visually, attach real assumptions, and
          inspect the bottleneck before you write code.
        </p>
      </section>

      <section className="status-grid" aria-label="Current scaffold status">
        <article className="status-card">
          <h2>Client</h2>
          <p>React + TypeScript + Vite scaffolded.</p>
        </article>
        <article className="status-card">
          <h2>Server</h2>
          <p>Go + Gin API bootstrap ready.</p>
        </article>
        <article className="status-card">
          <h2>Next</h2>
          <p>Canvas, graph schema editor, and simulation APIs.</p>
        </article>
      </section>
    </main>
  );
}
