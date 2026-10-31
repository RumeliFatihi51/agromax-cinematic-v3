import { useEffect, useRef } from "react";
export default function useDialogFocus(onClose) {
  const ref = useRef(),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement,
      dialog = ref.current;
    if (!dialog) return;
    const selectors =
      'button:not([disabled]),input:not([disabled]),a[href],select,textarea,[tabindex="0"]';
    (dialog.querySelector("input") || dialog.querySelector(selectors))?.focus();
    function key(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const nodes = [...dialog.querySelectorAll(selectors)].filter(
          (n) => n.getClientRects().length,
        );
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, []);
  return ref;
}
