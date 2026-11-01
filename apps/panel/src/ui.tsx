import type { ReactNode } from "react";

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** The short "what is this section about" box the panel shows at the top of every section. */
export function About({ children }: { children: ReactNode }) {
  return (
    <div className="about">
      <span className="about-tag">De qué trata</span>
      <p>{children}</p>
    </div>
  );
}

export function Term({ children }: { children: ReactNode }) {
  return <span className="term">{children}</span>;
}
