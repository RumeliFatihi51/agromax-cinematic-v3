export function LogoMark({ size = 40, className = "" }) {
  return <svg className={`agromax-logo-mark ${className}`} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="11" fill="currentColor"/><path d="M10 29 20 10l10 19M14 23h12M17 18h6" stroke="var(--atlas-logo-ink, #121817)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export default function Brand({ size = 36 }) {
  return <span className="agromax-lockup" aria-label="AgroMax"><LogoMark size={size}/><span className="agromax-wordmark">AGRO<strong>MAX</strong><i>.</i></span></span>;
}
export function FilizAvatar({ size = 48, className = "" }) {
  return <span className={`filiz-brand-avatar ${className}`} style={{width:size,height:size}} aria-hidden="true"><svg width="58%" height="58%" viewBox="0 0 32 32" fill="none"><path d="m16 4 3.5 8.5L28 16l-8.5 3.5L16 28l-3.5-8.5L4 16l8.5-3.5L16 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M16 11v10m-5-5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span>;
}
