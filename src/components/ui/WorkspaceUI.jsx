import { ArrowUpRight } from "lucide-react";

export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <header className="workspace-heading">
      <div>
        {eyebrow && <span className="workspace-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="workspace-heading-actions">{children}</div>}
    </header>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  tone = "green",
  onClick,
}) {
  return (
    <button className={`workspace-metric tone-${tone}`} onClick={onClick}>
      <span className="workspace-metric-top">
        <span>{label}</span>
        <Icon size={19} />
      </span>
      <span className="workspace-metric-value">
        {value}
        <small>{unit}</small>
      </span>
      <span className="workspace-metric-bottom">
        <span>{detail}</span>
        <ArrowUpRight size={16} />
      </span>
    </button>
  );
}

export function SectionHeading({ eyebrow, title, children }) {
  return (
    <header className="workspace-section-heading">
      <div>
        {eyebrow && <span className="workspace-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="workspace-empty">
      <span className="workspace-empty-icon">
        <Icon size={26} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
