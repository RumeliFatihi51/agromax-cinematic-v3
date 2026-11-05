import BusinessWorkspace from "./BusinessWorkspace";
import type { Field, Workspace } from "./types";
import type { DomainKind } from "../../../shared/contracts/commercial";
import { choose, type Locale } from "./i18n";
import {
  Sprout,
  Droplets,
  Leaf,
  ShieldCheck,
  FlaskConical,
  ClipboardCheck,
} from "lucide-react";
const icons = [
  Sprout,
  Droplets,
  Leaf,
  ShieldCheck,
  FlaskConical,
  ClipboardCheck,
];
const tabs = [
  ["seasons", "Sezon planı", "Seasons", "season"],
  ["irrigation", "Sulama", "Irrigation", "irrigation"],
  ["nutrition", "Besleme", "Nutrition", "nutrition"],
  ["protection", "Koruma", "Protection", "protection"],
  ["soil", "Toprak analizi", "Soil analysis", "soil"],
  ["evaluations", "Değerlendirme", "Evaluation", "evaluation"],
] as const;
export default function OperationsWorkspace({
  active,
  onActive,
  ...props
}: {
  active: string;
  onActive: (id: string) => void;
  fields: Field[];
  workspace: Workspace;
  userId: string;
  locale: Locale;
}) {
  const selected = tabs.find(([id]) => id === active) || tabs[0];
  return (
    <div className="canopy-operations">
      <nav
        className="weather-period-tabs business-operation-tabs"
        aria-label={choose(
          props.locale,
          "Sezon ve saha araçları",
          "Season and field tools",
        )}
      >
        {tabs.map(([id, tr, en], index) => {
          const Icon = icons[index];
          return (
            <button
              key={id}
              aria-current={selected[0] === id ? "page" : undefined}
              className={selected[0] === id ? "active" : ""}
              onClick={() => onActive(id)}
            >
              <Icon size={19} aria-hidden="true" />
              {choose(props.locale, tr, en)}
            </button>
          );
        })}
      </nav>
      <BusinessWorkspace
        key={selected[0]}
        kind={selected[3] as DomainKind}
        {...props}
      />
    </div>
  );
}
