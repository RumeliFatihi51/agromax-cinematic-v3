import { createContext, useContext } from "react";
const Preferences = createContext({ locale: "tr", areaUnit: "decare" });
export default function PreferenceProvider({ preferences, children }) {
  return (
    <Preferences.Provider
      value={preferences || { locale: "tr", areaUnit: "decare" }}
    >
      {children}
    </Preferences.Provider>
  );
}
export function useAreaFormat() {
  const { locale, areaUnit } = useContext(Preferences);
  const factor = areaUnit === "hectare" ? 0.1 : areaUnit === "sqm" ? 1000 : 1,
    unit =
      areaUnit === "hectare"
        ? "ha"
        : areaUnit === "sqm"
          ? "m²"
          : locale === "en"
            ? "daa"
            : "da";
  const value = (area) =>
    Number.isFinite(area)
      ? (area * factor).toLocaleString(locale === "en" ? "en-GB" : "tr-TR", {
          maximumFractionDigits: 3,
        })
      : "—";
  return { value, unit, format: (area) => `${value(area)} ${unit}` };
}
