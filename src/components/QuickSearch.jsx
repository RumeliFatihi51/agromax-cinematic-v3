import { useState } from "react";
import { Search, ArrowUpRight, MapPinned, Command, X } from "lucide-react";
import { modules } from "../features/modules";
import { I } from "./icons";
import useDialogFocus from "./useDialogFocus";
export default function QuickSearch({ fields, onNavigate, onField, onClose }) {
  const [query, setQuery] = useState("");
  const ref = useDialogFocus(onClose),
    needle = query.trim().toLocaleLowerCase("tr-TR");
  const items = [
    ...fields.map((f) => ({
      id: f.id,
      label: f.name,
      description: f.location || f.crop || "Tarla kaydı",
      icon: MapPinned,
      run: () => onField(f),
    })),
    ...modules.map(([id, label, icon]) => ({
      id,
      label,
      description: "Çalışma alanı",
      icon: I[icon] || I.Sprout,
      run: () => onNavigate(id),
    })),
  ]
    .filter((i) =>
      `${i.label} ${i.description}`.toLocaleLowerCase("tr-TR").includes(needle),
    )
    .slice(0, 10);
  return (
    <div className="quick-search-backdrop" onClick={onClose}>
      <section
        className="quick-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Tarlalarda ve modüllerde ara"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-search-input">
          <Search size={21} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tarla veya modül ara…"
            aria-label="Tarla veya modül ara"
          />
          <button aria-label="Aramayı kapat" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="quick-search-results">
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span>
                  <item.icon size={19} />
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))
          ) : (
            <p>Aramanızla eşleşen bir tarla veya modül bulunamadı.</p>
          )}
        </div>
        <footer>
          <Command size={13} />
          <span>Hızlı erişim</span>
          <kbd>Esc</kbd> kapat
        </footer>
      </section>
    </div>
  );
}
