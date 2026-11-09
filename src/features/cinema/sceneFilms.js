const directory = "/visuals/films/tarim2";

function shot(name, composition, playback = "responsive") {
  return {
    poster: `${directory}/${name}.webp`,
    mobilePoster: `${directory}/${name}-mobile.webp`,
    video: playback === "poster" ? undefined : `${directory}/${name}.mp4`,
    mobileVideo: playback === "responsive" ? `${directory}/${name}-mobile.mp4` : undefined,
    composition,
  };
}

const dawn = shot("dawn", "horizon");
const atlas = shot("atlas", "survey");
const relief = shot("relief", "survey");
const leaf = shot("leaf", "botany");
const wind = shot("wind", "horizon");
const harvest = shot("harvest", "ground", "desktop");
const orbit = shot("orbit", "optics");
const spectrum = shot("spectrum", "optics");
const canopy = shot("canopy", "botany", "desktop");
const terraces = shot("terraces", "ground");
const seasons = shot("seasons", "horizon", "poster");
const notebook = shot("notebook", "ground", "poster");
const archive = shot("archive", "archive", "poster");
const botanical = shot("botanical", "botany", "poster");
const enterprise = shot("enterprise", "survey", "poster");

const desktopFilm = (film) => ({ ...film, mobileVideo: undefined });

const routeFilms = {
  portal: shot("portal", "horizon"),
  overview: dawn,
  platform: terraces,
  fields: atlas,
  "fields-atlas": atlas,
  "fields-map": terraces,
  "fields-list": enterprise,
  "field-detail": atlas,
  satellite: orbit,
  temporal: seasons,
  history: archive,
  weather: wind,
  "weather-history": seasons,
  intelligence: spectrum,
  evidence: notebook,
  contradictions: spectrum,
  investigation: notebook,
  twin: relief,
  scenarios: desktopFilm(terraces),
  economics: harvest,
  finance: archive,
  tasks: dawn,
  operations: wind,
  "operations-seasons": wind,
  "operations-irrigation": desktopFilm(terraces),
  "operations-nutrition": canopy,
  "operations-protection": botanical,
  "operations-soil": harvest,
  "operations-evaluations": notebook,
  prescriptions: desktopFilm(atlas),
  drones: harvest,
  reports: archive,
  "report-preview": archive,
  mrv: enterprise,
  assistant: leaf,
  notifications: seasons,
  integrations: orbit,
  access: enterprise,
  settings: notebook,
  "settings-preferences": botanical,
  "settings-security": archive,
  "settings-sessions": enterprise,
  "settings-team": notebook,
  "settings-billing": archive,
};

export function filmForScene(id) {
  return routeFilms[id];
}
