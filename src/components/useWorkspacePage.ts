import { useCallback, useEffect, useState } from "react";
import { modules, canonicalPage } from "../features/modules";

const readPage = () => {
  const id = canonicalPage(window.location.hash.slice(1).split("?")[0]);
  return modules.some(([key]) => key === id) ? id : "overview";
};

// Browser history and refresh retain the current workspace screen.
export default function useWorkspacePage() {
  const [page, updatePage] = useState(readPage);
  useEffect(() => {
    const changed = () => updatePage(readPage());
    window.addEventListener("popstate", changed);
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  const setPage = useCallback((id: string) => {
    const next = canonicalPage(id);
    if (window.location.hash !== `#${next}`)
      window.history.pushState({}, "", `#${next}`);
    updatePage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return [page, setPage] as const;
}
