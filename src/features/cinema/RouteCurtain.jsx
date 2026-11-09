import { useLayoutEffect, useRef } from "react";
import { LogoMark } from "../../components/Brand";

export default function RouteCurtain({ id }) {
  const curtain = useRef(null);
  const previous = useRef(id);

  useLayoutEffect(() => {
    if (previous.current === id) return;
    previous.current = id;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || document.hidden || !curtain.current?.animate) return;
    const phone = window.matchMedia("(max-width: 720px)").matches;
    const animation = curtain.current.animate([
      { transform: "translateY(101%)", visibility: "visible", offset: 0, easing: "cubic-bezier(.69,0,.24,1)" },
      { transform: "translateY(0)", offset: .39 },
      { transform: "translateY(0)", offset: .48, easing: "cubic-bezier(.22,.72,.24,1)" },
      { transform: "translateY(-101%)", visibility: "visible", offset: 1 },
    ], { duration: phone ? 340 : 420 });
    const stop = () => animation.cancel();
    const hide = () => { if (document.hidden) stop(); };
    motion.addEventListener("change", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      stop();
      motion.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [id]);

  return <div className="cinema-route-cut" ref={curtain} aria-hidden="true">
    <LogoMark size={46} />
  </div>;
}
