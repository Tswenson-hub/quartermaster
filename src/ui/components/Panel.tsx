import type { ReactNode } from 'react';

export function Panel({ title, flavour, actions, children, className = '', testId }: {
  title: ReactNode;
  flavour?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`panel ${className}`} data-testid={testId}>
      <header className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {flavour && <p className="panel-flavour">{flavour}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
