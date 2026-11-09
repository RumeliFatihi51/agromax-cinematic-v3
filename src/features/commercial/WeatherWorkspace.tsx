import { lazy, Suspense, useState } from "react";
import { LoaderCircle, CloudSun, History as HistoryIcon } from "lucide-react";
import { choose, type Locale } from "./i18n";
import type { Field } from "./types";
import SceneSurface from "../cinema/SceneSurface";
import "./commercial.css";
const Forecast = lazy(() => import("../weather/WeatherDashboard"));
const History = lazy(() => import("./HistoricalWeather"));
export default function WeatherWorkspace({
  fields,
  locale,
  onNavigate,
}: {
  fields: Field[];
  locale: Locale;
  onNavigate: (page: string) => void;
}) {
  const [tab, setTab] = useState("forecast");
  return (
    <div>
      <nav
        className="weather-period-tabs canopy-weather-tabs"
        aria-label={choose(locale, "Meteoroloji araçları", "Weather tools")}
      >
        {[
          ["forecast", "Hava tahmini", "Forecast"],
          ["history", "Geçmiş veriler", "History"],
        ].map(([id, tr, en]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id!)}
          >
            {id === "forecast" ? (
              <CloudSun size={17} aria-hidden="true" />
            ) : (
              <HistoryIcon size={17} aria-hidden="true" />
            )}
            {choose(locale, tr!, en!)}
          </button>
        ))}
      </nav>
      <SceneSurface id={tab === "history" ? "weather-history" : "weather"} localTransition>
        <Suspense fallback={<LoaderCircle size={24} className="spin" />}>
          {tab === "forecast" ? (
            <Forecast fields={fields} onNavigate={onNavigate} />
          ) : (
            <History fields={fields} locale={locale} />
          )}
        </Suspense>
      </SceneSurface>
    </div>
  );
}
