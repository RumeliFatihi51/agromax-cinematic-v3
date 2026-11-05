import { useState } from "react";

/** Decorative terrain study; deliberately independent of live parcel data. */
export default function HologramTerrain({ compact = false }) {
  const [paused, setPaused] = useState(false);
  return <div className={`holo-terrain ${compact ? "is-compact" : ""} ${paused ? "is-paused" : ""}`}>
    <div className="holo-scene" aria-hidden="true">
      <div className="holo-orbit orbit-one" /><div className="holo-orbit orbit-two" />
      <div className="holo-land">
        {Array.from({ length: 25 }, (_, i) => <div key={i} className="holo-cell" style={{ "--x": i % 5, "--y": Math.floor(i / 5), "--rise": `${12 + ((i * 13) % 5) * 9}px` }}><i /></div>)}
        <div className="holo-sweep" />
      </div>
      <div className="holo-beacon"><i /><span /></div>
    </div>
    <span className="holo-caption">ARAZİ MODELİ / KAVRAMSAL GÖRSEL</span>
    <button type="button" className="holo-motion" onClick={() => setPaused(v => !v)} aria-pressed={paused} aria-label={paused ? "Görsel hareketini başlat" : "Görsel hareketini duraklat"}>{paused ? "HAREKETİ BAŞLAT" : "HAREKETİ DURAKLAT"}</button>
  </div>;
}
