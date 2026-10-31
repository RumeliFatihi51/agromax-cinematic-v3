import "./status.css";
export default function StatusIndicator({ tone = "neutral", children }) {
  return <span className={`workspace-status status-${tone}`}>{children}</span>;
}
