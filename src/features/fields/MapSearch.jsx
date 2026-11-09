import { useEffect, useId, useRef, useState } from "react";
import { Search, MapPin, ArrowUpRight, LoaderCircle, X } from "lucide-react";
export default function MapSearch({ onSelect, getCenter }) {
  const resultsId = useId();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const controller = useRef(),
    input = useRef(),
    container = useRef(),
    requestId = useRef(0);
  useEffect(() => {
    const outside = (e) => {
      if (!container.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      controller.current?.abort();
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  function clear() {
    requestId.current++;
    controller.current?.abort();
    setQuery("");
    setResults([]);
    setBusy(false);
    setError("");
    setSearched(false);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }
  async function search(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setResults([]);
    setOpen(true);
    setActive(-1);
    setSearched(false);
    try {
      const center = getCenter(),
        r = await fetch("/api/places/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: query.trim(),
            lat: center.lat,
            lng: center.lng,
          }),
          signal: controller.current.signal,
        });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Arama tamamlanamadı.");
      if (requestId.current === id) {
        setResults(data.results);
        setSearched(true);
      }
    } catch (e) {
      if (e.name !== "AbortError" && requestId.current === id)
        setError(e.message);
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }
  function choose(place) {
    onSelect(place);
    setQuery(place.name);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="map-place-search" ref={container}>
      <form onSubmit={search} role="search" aria-label="Haritada yer ara">
        <Search size={18} />
        <input
          ref={input}
          value={query}
          placeholder="İl, ilçe, köy veya adres ara…"
          aria-label="Haritada yer ara"
          aria-expanded={open}
          aria-controls={open ? resultsId : undefined}
          autoComplete="off"
          maxLength={200}
          onChange={(e) => {
            requestId.current++;
            controller.current?.abort();
            setBusy(false);
            setQuery(e.target.value);
            setResults([]);
            setSearched(false);
            setError("");
            setActive(-1);
            setOpen(false);
          }}
          onFocus={() => {
            if (searched || error) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            } else if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && open && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
        {query && (
          <button
            className="place-search-clear"
            type="button"
            aria-label="Aramayı temizle"
            onClick={clear}
          >
            <X size={14} />
          </button>
        )}
        <button
          className="place-search-submit"
          type="submit"
          disabled={busy || query.trim().length < 2}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <>
              Ara
              <ArrowUpRight size={14} />
            </>
          )}
        </button>
      </form>
      {open && (
        <div className="place-search-dropdown" id={resultsId}>
          <div className="place-search-status" role="status">
            {busy
              ? "Konumlar aranıyor…"
              : error || (searched && !results.length)
                ? ""
                : `${results.length} konum bulundu`}
          </div>
          {error ? (
            <p className="place-search-error" role="alert">
              {error}
            </p>
          ) : searched && !results.length ? (
            <p className="place-search-empty">
              Konum bulunamadı. İl veya ilçe adı ekleyerek yeniden deneyin.
            </p>
          ) : (
            results.map((p, i) => (
              <button
                type="button"
                className={i === active ? "active" : ""}
                key={p.id}
                onClick={() => choose(p)}
              >
                <span>
                  <MapPin size={17} />
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                  </small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ))
          )}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap katkıcıları · Photon
          </a>
        </div>
      )}
    </div>
  );
}
