import { useLayoutEffect } from "react";

const stableControlSurfaces = new Set([".fw-calendar", ".fw-planner-agenda", ".field-comparison-table", ".map-workbench"]);

export default function useWorkspaceEntrance(host, id, stage) {
  useLayoutEffect(() => {
    const surface = host.current;
    if (!surface || !stage || !Element.prototype.animate || document.hidden) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const narrow = window.matchMedia("(max-width: 720px)").matches;
    const sideTravel = window.innerWidth < 1100 ? 15 : 28;
    const [, ...selectors] = stage;
    const seen = new Set();
    const running = new Map();
    const observer = new MutationObserver(reveal);
    const bounds = { duration: narrow ? 340 : 460, easing: "cubic-bezier(.18,.8,.24,1)", fill: "backwards" };

    function reveal() {
      selectors.forEach((selector, index) => {
        if (seen.has(selector)) return;
        const target = [...surface.querySelectorAll(selector)].find(node =>
          node.closest(".workspace-scene") === surface && node.getClientRects().length,
        );
        if (!target) return;
        seen.add(selector);
        const rect = target.getBoundingClientRect();
        if (target.contains(document.activeElement) || rect.top >= window.innerHeight || rect.bottom <= 0) return;

        const from = narrow || stableControlSurfaces.has(selector) ? "none" : index === 0 &&
          ["terrain", "timeline", "calendar", "survey", "notebook"].includes(stage[0])
          ? "translateY(21px)" : `translateX(${sideTravel}px)`;
        const animation = target.animate([
          { transform: from, opacity: 0.38 },
          { transform: "none", opacity: 1 },
        ], { ...bounds, delay: (narrow ? 100 : 165) + index * 45 });
        animation.id = "workspace-entrance";
        running.set(target, animation);
        animation.onfinish = () => running.delete(target);
      });
      if (seen.size === selectors.length) observer.disconnect();
    }

    function stop() {
      observer.disconnect();
      window.clearTimeout(timeout);
      running.forEach(animation => animation.cancel());
      running.clear();
    }
    function revealFocused(event) {
      running.forEach((animation, node) => {
        if (node.contains(event.target)) {
          animation.cancel();
          running.delete(node);
        }
      });
    }
    const cancelWhenHidden = () => { if (document.hidden) stop(); };
    const timeout = window.setTimeout(() => observer.disconnect(), 1800);
    observer.observe(surface, { childList: true, subtree: true });
    reveal();
    surface.addEventListener("focusin", revealFocused);
    preference.addEventListener("change", stop);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      stop();
      surface.removeEventListener("focusin", revealFocused);
      preference.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [host, id, stage]);
}
