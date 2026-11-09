import { useCallback, useEffect, useState } from "react";
import { modules, canonicalPage } from "../features/modules";

type WorkspaceParams = { field?: string; metric?: string };

function readLocation() {
  const [route, query] = window.location.hash.slice(1).split("?", 2);
  const id = canonicalPage(route);
  const params = new URLSearchParams(query);
  return {
    page: modules.some(([key]) => key === id) ? id : "overview",
    field: params.get("field") || "",
    metric: params.get("metric") || "",
  };
}

export default function useWorkspacePage() {
  const [location, updateLocation] = useState(readLocation);
  useEffect(() => {
    const changed = () => updateLocation(readLocation());
    window.addEventListener("popstate", changed);
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  const setPage = useCallback((id: string, params: WorkspaceParams = {}, replace = false) => {
    const next = canonicalPage(id);
    const search = new URLSearchParams();
    if (params.field) search.set("field", params.field);
    if (params.metric) search.set("metric", params.metric);
    const hash = `#${next}${search.size ? `?${search}` : ""}`;
    if (window.location.hash !== hash) {
      if (replace) window.history.replaceState({}, "", hash);
      else window.history.pushState({}, "", hash);
      updateLocation(readLocation());
    }
    if (!replace) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return [location.page, setPage, location] as const;
}
