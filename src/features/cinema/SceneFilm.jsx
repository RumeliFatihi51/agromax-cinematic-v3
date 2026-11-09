import { useCallback, useEffect, useRef, useState } from "react";

const phoneScreen = "(max-width: 720px)";
const motionAllowed = "(prefers-reduced-motion: no-preference)";
const slowConnections = new Set(["slow-2g", "2g", "3g"]);

function SceneVideo({ source, active, loop }) {
  const video = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const attachVideo = useCallback((element) => {
    video.current = element;
    if (!element) return;
    return () => {
      video.current = null;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active && !element.ended) void element.play().catch(() => {});
    else element.pause();
    return () => element.pause();
  }, [active]);

  return failed ? null : (
    <video ref={attachVideo} className={playing ? "is-playing" : undefined}
      src={source} preload="none" muted playsInline loop={loop} disablePictureInPicture tabIndex={-1}
      onPlaying={() => setPlaying(true)} onError={() => setFailed(true)} />
  );
}

// The poster stays mounted. Only the selected, in-view rendition requests bytes.
export default function SceneFilm({ film, priority = false, loop = false }) {
  const host = useRef(null);
  const [active, setActive] = useState(false);
  const [source, setSource] = useState(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !film.video) return;
    const preference = window.matchMedia(motionAllowed);
    const phone = window.matchMedia(phoneScreen);
    const connection = navigator.connection;
    let visible = false;
    let startTimer;

    function update() {
      window.clearTimeout(startTimer);
      const rendition = phone.matches ? film.mobileVideo : film.video;
      const allowed = preference.matches && !connection?.saveData &&
        (loop || !slowConnections.has(connection?.effectiveType));
      if (!allowed || !rendition) {
        setActive(false);
        setSource(null);
        return;
      }
      setActive(false);
      setSource((current) => current === rendition ? current : null);
      if (!visible || document.hidden) return;
      // Give the poster and workspace a paint before the decoder starts. Brief
      // visits during fast touch navigation never request a clip.
      startTimer = window.setTimeout(() => {
        setSource(rendition);
        setActive(true);
      }, phone.matches ? 300 : 85);
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.18;
      update();
    }, { threshold: 0.18 });
    observer.observe(host.current);
    preference.addEventListener("change", update);
    phone.addEventListener("change", update);
    connection?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      window.clearTimeout(startTimer);
      observer.disconnect();
      preference.removeEventListener("change", update);
      phone.removeEventListener("change", update);
      connection?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [film, loop]);

  return (
    <>
    <span className="scene-film" ref={host} aria-hidden="true">
      <picture>
        {film.mobilePoster && <source media={phoneScreen} srcSet={film.mobilePoster} />}
        <img src={film.poster} alt="" decoding="async" fetchPriority={priority ? "high" : undefined} />
      </picture>
      {source && <SceneVideo key={source} source={source} active={active && !paused} loop={loop} />}
    </span>
    {loop && source && <button type="button" className="scene-film-toggle" onClick={() => setPaused(!paused)}>
      {paused ? "Videoyu oynat" : "Videoyu duraklat"}
    </button>}
    </>
  );
}
