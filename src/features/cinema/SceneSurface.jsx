import { useRef } from "react";
import SceneFilm from "./SceneFilm";
import { filmForScene } from "./sceneFilms";
import useSceneTitle from "./useSceneTitle";
import RouteCurtain from "./RouteCurtain";
import { stageForScene } from "./workspaceStages";
import useWorkspaceEntrance from "./useWorkspaceEntrance";

// Art is editorial context. Measurements, readiness and statuses belong to each workspace.
const scenes = {
  overview: ["landscape", "mask", "moss"],
  platform: ["atlas", "panels", "moss"],
  fields: ["parcel", "trace", "moss"],
  satellite: ["orbital", "scan", "sky"],
  temporal: ["chronology", "shift", "moss"],
  history: ["ledger", "stack", "sand"],
  weather: ["horizon", "drift", "sky"],
  intelligence: ["signals", "focus", "sky"],
  evidence: ["archive", "stack", "moss"],
  contradictions: ["alignment", "split", "clay"],
  investigation: ["notebook", "unfold", "sand"],
  twin: ["contour", "trace", "moss"],
  scenarios: ["branches", "trace", "sky"],
  economics: ["bars", "scale", "sand"],
  finance: ["ledger", "unfold", "sand"],
  tasks: ["calendar", "shift", "sand"],
  operations: ["season", "trace", "moss"],
  prescriptions: ["bands", "panels", "moss"],
  drones: ["waypoints", "trace", "sky"],
  reports: ["papers", "stack", "sand"],
  mrv: ["chain", "trace", "moss"],
  access: ["devices", "split", "sky"],
  assistant: ["botany", "mask", "moss"],
  notifications: ["events", "shift", "clay"],
  integrations: ["junction", "trace", "sky"],
  settings: ["identity", "focus", "sand"],
  "settings-preferences": ["alignment", "split", "moss"],
  "settings-security": ["shield", "focus", "clay"],
  "settings-sessions": ["devices", "shift", "sky"],
  "settings-team": ["junction", "trace", "moss"],
  "settings-billing": ["ledger", "stack", "sand"],
  "fields-atlas": ["atlas", "panels", "moss"],
  "fields-map": ["parcel", "trace", "moss"],
  "fields-list": ["ledger", "shift", "sand"],
  "field-detail": ["parcel", "trace", "moss"],
  "weather-history": ["chronology", "shift", "sky"],
  "operations-seasons": ["season", "trace", "moss"],
  "operations-irrigation": ["water", "drift", "sky"],
  "operations-nutrition": ["groups", "panels", "moss"],
  "operations-protection": ["shield", "focus", "clay"],
  "operations-soil": ["strata", "stack", "sand"],
  "operations-evaluations": ["notebook", "unfold", "moss"],
  "report-preview": ["papers", "unfold", "sand"],
};

const art = {
  atlas: "M20 156 110 95 204 123 320 60 430 108 520 47 M110 95l13 88m81-60 18 72M320 60l25 116m85-68 22 76",
  parcel: "M42 192 102 71l165-19 58 120-136 43z M102 71l88 144m77-163-14 147M325 172l146-86 55 60m-68-52 31-60",
  orbital: "M54 144c113-107 318-105 440-31-110 107-316 106-440 31Zm125 26c25-75 144-127 242-128-31 76-141 133-242 128Z M281 79l28 29-26 29-28-29z",
  chronology: "M25 130h491M72 106v50m75-62v74m75-56v40m75-61v82m75-57v35m75-66v95 M72 83h75m150 93h75",
  ledger: "M47 52h433M47 87h433M47 122h433M47 157h433M47 192h433 M140 35v170M313 35v170",
  horizon: "M20 150c64-64 153-20 231-67 74-45 161-24 255 9M26 175c72-35 143-17 217-51 85-40 163-32 265 2M28 201c128-43 194-14 286-52 69-27 146-17 195 7",
  signals: "M39 143h96l33-46 50 67 67-83 54 37h164 M168 97l0-36m117 20 0-35m-67 118v39",
  archive: "M54 56h163v132H54zm228 0h197v132H282z M77 91h111m-111 35h91m-91 35h63m222-69h66m-66 33h99m-99 35h76M217 121h65",
  alignment: "M44 87h196l29 43 32-43h183M44 162h196l29-30 32 30h183M130 52v37m242 73v41 M38 126h165m139 0h150",
  notebook: "M88 54h341v143H88z M128 54v143m28-101h234m-234 34h234m-234 34h171M72 85h31m-31 35h31m-31 35h31",
  contour: "M34 159c27-72 165-106 236-67s183-71 239-12c70 68-49 122-190 100S91 228 34 159Zm66-7c19-38 100-56 165-30s135-41 175-17-26 58-117 49S145 184 100 152Z",
  branches: "M42 171h113c60 0 58-106 127-106h226M155 171c55 0 77-42 127-42h226M155 171c61 0 79 27 127 27h226",
  bars: "M43 178h455M94 178V99h43v79m57 0V60h43v118m57 0v-54h43v54m57 0V78h43v100",
  calendar: "M65 56h418v138H65zm0 38h418m-345 0v100m72-100v100m72-100v100m72-100v100m72-100v100M142 40v32m267-32v32",
  season: "M32 171c147 0 141-102 254-102s118 47 215 47M111 160v-32m111-46V48m110 27v36m110 2v38",
  bands: "M29 168 185 97 273 114 420 51l82 33M31 195l155-69 90 18 144-63 86 34M67 209l121-54 90 18 142-63 75 33",
  waypoints: "M57 145l83-57 106 79 121-94 115 69 M57 136v18m83-75v18m106 61v18m121-112v18m115 51v18",
  papers: "M109 65h204v135H109zm69 0V43h225v124h-90M139 99h138m-138 30h138m-138 30h93m112-80h29m-29 29h29",
  chain: "M56 104h94v60H56zm174-38h94v60h-94zm168 43h94v60h-94zM150 134h40V96h40m94 0h37v43h37",
  devices: "M57 51h290v125H57zm-28 126h350m22-82h89v104h-89zm33 93h24",
  botany: "M67 183c140-21 277-75 409-126M239 136c-26-50 39-86 113-84-17 47-63 83-113 84Zm-51 16c38 39 117 37 182 8-75-36-136-30-182-8Z",
  events: "M91 35v167m0-133h115m-115 48h214m-214 48h350M76 69h30m-30 48h30m-30 48h30",
  junction: "M58 61h90l78 60h98l71-59h104M58 181h90l78-60m98 0 71 60h104M239 86h71v70h-71z",
  identity: "M80 52h395v145H80zm61 113c0-42 97-42 97 0m-68-70a20 20 0 1 0 40 0 20 20 0 1 0-40 0m130-6h126m-126 36h97m-97 33h78",
  water: "M31 102c72 0 77-32 155-32s105 37 181 37 97-31 141-31M31 140c72 0 77-32 155-32s105 37 181 37 97-31 141-31M31 178c72 0 77-32 155-32s105 37 181 37 97-31 141-31",
  groups: "M95 76h92v90H95zm140-30h91v90h-91zm141 51h91v90h-91z M122 101v35m-17-17h34m122-46v35m-16-17h32m128 32v35m-16-17h32",
  shield: "M132 60 265 33l133 27v57c0 47-64 72-133 89-69-17-133-42-133-89zM206 114l42 29 86-58",
  strata: "M34 64c152 27 289-19 468 0M34 105c152 27 289-19 468 0M34 149c152 27 289-19 468 0M34 193c152 27 289-19 468 0M126 80v26m123 51v38m142-111v35",
};

export default function SceneSurface({ id, children, className = "", localTransition = false }) {
  const scene = scenes[id];
  const stage = stageForScene(id);
  const host = useRef(null);
  useSceneTitle(host, id === "overview" ? null : id, scene?.[1]);
  useWorkspaceEntrance(host, id, stage);
  if (!scene || id === "overview") return className ? <div className={className}>{children}</div> : children;
  const [drawing, motion, tone] = scene;
  const film = filmForScene(id);
  return (
    <div ref={host} className={className ? `workspace-scene ${className}` : "workspace-scene"} data-scene={id} data-scene-tone={tone} data-stage={stage?.[0]}>
      <div className="workspace-scene-art" data-motion={motion} data-film={film ? "" : undefined} data-composition={film?.composition} key={id} aria-hidden="true">
        {film && <SceneFilm film={film} />}
        <svg viewBox="0 0 540 225" preserveAspectRatio="xMidYMid slice" focusable="false">
          {film ? <path d={art[drawing]} pathLength="1" /> : <>
            <path className="scene-contours" d="M0 135Q90 58 206 104T400 90 540 72M0 153Q113 72 218 119T400 107 540 87M0 170Q106 91 223 133T400 121 540 104M0 189Q101 113 218 151T400 135 540 121" />
            <path className="scene-land" d="M146 185Q295 124 540 134M212 202Q345 133 540 140M278 212Q386 141 540 146M338 217Q429 151 540 152M394 220Q471 157 540 160M338 132l23-17 26 5 17 14m-59-7v11m13-20v16m20-11v12m27-2 14-13 22 16m43-9v-24m-8 22q0-30 8-40 9 10 8 40zM512 129v-28m-8 26q0-32 8-43 9 11 8 43z" />
            <path className="scene-signature" d={art[drawing]} pathLength="1" />
          </>}
        </svg>
      </div>
      {children}
      {localTransition && <RouteCurtain id={id} />}
    </div>
  );
}
