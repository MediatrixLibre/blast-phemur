import type { ReactNode } from 'react';

/** A collapsible section: native <details>, so keyboard and screen readers work with no code */
export function Fold({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="gs-fold" open={open}>
      <summary>
        <span className="gs-fold-title">{title}</span>
        {hint && <span className="gs-fold-hint">{hint}</span>}
      </summary>
      <div className="gs-fold-body">{children}</div>
    </details>
  );
}
