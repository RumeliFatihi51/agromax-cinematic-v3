export function LogoMark({ size = 40, light = false, className = "" }) {
  return (
    <img
      className={`agromax-logo-mark ${className}`}
      src={
        light
          ? "/brand/agromax-mark-light-v1.svg"
          : "/brand/agromax-mark-v1.svg"
      }
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}
export default function Brand({ light = false, size = 40 }) {
  return (
    <span
      className={`agromax-lockup ${light ? "agromax-lockup-light" : ""}`}
      aria-label="Agromax"
    >
      <LogoMark size={size} light={light} />
      <span className="agromax-wordmark">
        agro<strong>max</strong>
        <i>.</i>
      </span>
    </span>
  );
}
export function FilizAvatar({ size = 48, className = "" }) {
  return (
    <img
      className={`filiz-brand-avatar ${className}`}
      src="/brand/filiz-emblem-v1-256.webp"
      srcSet="/brand/filiz-emblem-v1-256.webp 256w, /brand/filiz-emblem-v1-512.webp 512w"
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}
