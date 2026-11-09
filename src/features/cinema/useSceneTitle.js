import { useLayoutEffect } from "react";

const easing = "cubic-bezier(.22,.75,.26,1)";
const lift = [
  { transform: "translateY(12px)", clipPath: "inset(0 -4px 82% -4px)", opacity: 0.55 },
  { transform: "translateY(0)", clipPath: "inset(-5px)", opacity: 1 },
];
const sweep = [
  { transform: "translateX(-7px)", clipPath: "inset(-5px 65% -5px -5px)", opacity: 0.55 },
  { transform: "translateX(0)", clipPath: "inset(-5px)", opacity: 1 },
];

export default function useSceneTitle(host, id, motion) {
  useLayoutEffect(() => {
    const surface = host.current;
    if (!surface || !id || !Element.prototype.animate || document.hidden) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const animations = [];
    const observer = new MutationObserver(reveal);
    const finish = () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
    const cancelWhenHidden = () => { if (document.hidden) finish(); };

    function reveal() {
      const heading = [...surface.querySelectorAll("[data-scene-heading], h1")].find(
        (node) => node.closest(".workspace-scene") === surface && node.getClientRects().length,
      );
      if (!heading) return false;
      observer.disconnect();

      const sideways = ["scan", "shift", "split", "panels"].includes(motion);
      animations.push(heading.animate(sideways ? sweep : lift, { duration: 235, easing }));
      for (const [line, delay] of [[heading.previousElementSibling, 12], [heading.nextElementSibling, 38]]) {
        if (line?.matches("span, p, small") && !line.querySelector("a, button, input, select")) {
          animations.push(line.animate(
            [{ transform: "translateY(4px)", opacity: 0.65 }, { transform: "translateY(0)", opacity: 1 }],
            { delay, duration: 190, easing },
          ));
        }
      }
      return true;
    }

    // Some modules load their heading in a Suspense boundary.
    if (!reveal()) observer.observe(surface, { childList: true, subtree: true });
    preference.addEventListener("change", finish);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      finish();
      preference.removeEventListener("change", finish);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [host, id, motion]);
}
