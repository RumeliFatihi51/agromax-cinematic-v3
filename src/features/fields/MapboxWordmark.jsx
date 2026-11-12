import "./mapbox-wordmark.css";
import { mapboxEnabled } from "./basemaps";
export default function MapboxWordmark({ visible = mapboxEnabled }) {
  return visible && <a className="agromax-mapbox-logo" href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">
    <img src="/visuals/mapbox-attribution.svg" alt="Mapbox" width="74" height="20" />
  </a>;
}
