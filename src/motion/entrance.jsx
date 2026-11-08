import { useEffect } from "react";
import { LogoMark } from "../components/Brand";

let played = false;
export function useDashboardEntrance(host) {
  useEffect(() => {
    if (played || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let mounted = true;
    let media;
    import("gsap").then(({ gsap }) => {
      if (!mounted || !host.current) return;
      media = gsap.matchMedia(host.current);
      media.add("(prefers-reduced-motion: no-preference)", () => {
        played = true;
        const line = { yPercent: 0, duration: 0.66, stagger: 0.1, clearProps: "transform" };
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } })
          .fromTo(".dashboard-hero-media img", { scale: 1.055, y: 10 }, { scale: 1, y: 0, duration: 1.05, clearProps: "transform" }, 0)
          .fromTo(".dashboard-hero-media", { clipPath: "inset(0 0 9% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.85, clearProps: "clipPath" }, 0)
          .fromTo(".motion-line > span", { yPercent: 102 }, line, 0.1)
          .fromTo("[data-enter]", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.43, stagger: 0.04, clearProps: "opacity,transform" }, 0.2);
        const deadline = setTimeout(() => timeline.progress(1), 1250);
        const finishWhenHidden = () => { if (document.hidden) timeline.progress(1); };
        document.addEventListener("visibilitychange", finishWhenHidden);
        return () => {
          clearTimeout(deadline);
          document.removeEventListener("visibilitychange", finishWhenHidden);
        };
      }, host.current);
    }).catch(() => {});
    return () => { mounted = false; media?.revert(); };
  }, [host]);
}

export function TextReveal({ lines }) {
  return <h1>{lines.map((line, index) =>
    <span className="motion-line" key={line}><span>{line}{index < lines.length - 1 ? " " : ""}</span></span>)}</h1>;
}

export function CinematicLoader() {
  return <div className="earth-loader" role="status">
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <path d="M5 85 38 43 101 20 168 35 224 63 229 111 194 144 125 150 62 127Z" />
      <path d="M23 83 49 51 103 32 161 46 209 70 214 104 185 132 125 137 70 116Z" />
      <path d="M44 80 62 61 107 45 156 58 194 78 196 99 174 118 127 125 80 106Z" />
    </svg>
    <div><LogoMark size={46} /><strong>agromax.</strong><span>Çalışma alanınız hazırlanıyor</span></div>
  </div>;
}
