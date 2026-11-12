import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, PlaneGeometry, SRGBColorSpace } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { containsPoint, pixelBounds, polygons, unproject } from "../../../shared/spatial";
import { colorFor, rgb } from "./colors";

function Camera({ command, sync, onCamera, onContextLoss, reduced, frame, terrain, exaggeration, split, stacked, interaction }) {
  const { camera, gl, invalidate, size } = useThree();
  const instance = useRef(null);
  const event = useRef(onCamera);
  event.current = onCamera;
  const loss = useRef(onContextLoss);
  loss.current = onContextLoss;
  const relief = useRef({ frame, terrain, exaggeration });
  relief.current = { frame, terrain, exaggeration };
  useLayoutEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 0.44;
    controls.maxDistance = 5.5;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI / 2.2;
    const change = () => {
      const active = relief.current;
      const position = camera.position;
      const height = active.terrain?.sample(position.x * active.frame.span, position.z * active.frame.span);
      if (Number.isFinite(height)) {
        const floor = (height - active.terrain.reference) * active.exaggeration / active.frame.span + 0.04;
        if (position.y < floor) { position.y = floor; camera.lookAt(controls.target); }
      }
      invalidate();
      event.current?.(camera.position.toArray());
    };
    controls.addEventListener("change", change);
    const contextLost = () => loss.current?.();
    gl.domElement.addEventListener("webglcontextlost", contextLost);
    instance.current = controls;
    change();
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.removeEventListener("change", change);
      controls.dispose();
      instance.current = null;
    };
  }, [camera, gl, invalidate]);
  useLayoutEffect(() => {
    if (!instance.current) return;
    instance.current.enabled = interaction;
    gl.domElement.style.touchAction = interaction ? "none" : "pan-y";
  }, [gl, interaction]);
  useLayoutEffect(() => {
    if (!sync) return;
    camera.position.fromArray(sync);
    camera.lookAt(0, 0, 0);
    invalidate();
  }, [camera, invalidate, sync]);
  useEffect(() => {
    if (!command) return;
    const controls = instance.current;
    const start = camera.position.clone();
    const end = start.clone();
    const viewAspect = size.height ? size.width / size.height * (split ? stacked ? 2 : 0.5 : 1) : 1;
    const fitScale = Math.max(1, 1.12 / viewAspect);
    const startTarget = controls.target.clone();
    const endTarget = startTarget.clone();
    if (command.type === "focus") {
      endTarget.set(command.local[0], 0, command.local[1]);
      end.add(endTarget).sub(startTarget);
    }
    if (command.type === "fit") {
      end.set(0.82, 0.90, 1.04).multiplyScalar(fitScale);
      endTarget.set(0, 0, 0);
    }
    if (command.type === "slope") {
      end.set(0.96, 0.51, 1.19).multiplyScalar(fitScale);
      endTarget.set(0, 0, 0);
    }
    if (command.type === "north") end.set(0, Math.max(0.28, start.y),
      start.distanceTo(startTarget) * 0.7).add(startTarget);
    if (command.type === "top") {
      end.set(0, 1.72 * fitScale, 0.032);
      endTarget.set(0, 0, 0);
    }
    if (command.type === "in" || command.type === "out")
      end.sub(startTarget).multiplyScalar(command.type === "in" ? 0.8 : 1.25).clampLength(0.45, 5.4).add(startTarget);
    let animation;
    const began = performance.now();
    const move = (now) => {
      const fraction = reduced ? 1 : Math.min(1, (now - began) / 240);
      const eased = 1 - (1 - fraction) ** 3;
      camera.position.copy(start).lerp(end, eased);
      controls.target.copy(startTarget).lerp(endTarget, eased);
      controls.update();
      invalidate();
      if (fraction < 1) animation = requestAnimationFrame(move);
    };
    animation = requestAnimationFrame(move);
    return () => cancelAnimationFrame(animation);
  }, [camera, command, invalidate, reduced, size.height, size.width, split, stacked]);
  return null;
}

function trace(ctx, geometry, xy) {
  ctx.beginPath();
  for (const polygon of polygons(geometry)) {
    for (const ring of polygon) {
      ring.forEach((point, index) => {
        const [x, y] = xy(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
}

function createTexture({ frame, field, width, depth, raster, scale, opacity, boundary, imagery,
  contextImagery, droneImagery, zones, activeZone, compact }) {
  const canvas = document.createElement("canvas");
  const size = compact ? 512 : 1024;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const xy = (point) => {
    const [x, z] = frame.local(point);
    return [(x / width + 0.5) * canvas.width, (z / depth + 0.5) * canvas.height];
  };
  const wash = ctx.createLinearGradient(0, 0, size, size);
  wash.addColorStop(0, "#697665");
  wash.addColorStop(1, "#35453d");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);
  if (contextImagery) {
    ctx.drawImage(contextImagery, 0, 0, size, size);
  }
  if (droneImagery) {
    const [west, south, east, north] = droneImagery.bounds;
    const [left, top] = xy(unproject([west, north]));
    const [right, bottom] = xy(unproject([east, south]));
    ctx.drawImage(droneImagery.bitmap, left, top, right - left, bottom - top);
  }

  trace(ctx, field.geometry, xy);
  ctx.save();
  ctx.clip("evenodd");
  if (imagery) {
    const [west, south, east, north] = imagery.bounds;
    const [left, top] = xy([west, north]), [right, bottom] = xy([east, south]);
    ctx.globalAlpha = opacity;
    ctx.drawImage(imagery.bitmap, left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
  }
  if (raster && scale) {
    ctx.globalAlpha = opacity;
    for (const [index, value] of raster.values.entries()) {
      if (!Number.isFinite(value)) continue;
      const [west, south, east, north] = pixelBounds(raster, index);
      const [left, top] = xy(unproject([west, north]));
      const [right, bottom] = xy(unproject([east, south]));
      ctx.fillStyle = rgb(colorFor(value, scale));
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    ctx.globalAlpha = 1;
  }
  for (const [index, zone] of zones.entries()) {
    trace(ctx, zone.geometry, xy);
    ctx.fillStyle = zone.id === activeZone ? "#e9ba69b8" : ["#c3d987a8", "#84bcc4a8", "#e1a779a8"][index % 3];
    ctx.fill("evenodd");
    ctx.strokeStyle = "#fff4c8";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
  if (boundary) {
    trace(ctx, field.geometry, xy);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#162d29";
    ctx.lineWidth = size / 210;
    ctx.stroke();
    ctx.strokeStyle = "#f5e8ac";
    ctx.lineWidth = size / 440;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-in";
  for (const vertical of [false, true]) {
    const fade = ctx.createLinearGradient(0, 0, vertical ? 0 : size, vertical ? size : 0);
    fade.addColorStop(0, "#0000");
    fade.addColorStop(0.065, "#000");
    fade.addColorStop(0.935, "#000");
    fade.addColorStop(1, "#0000");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = compact ? 2 : 4;
  return texture;
}

function Surface({ frame, field, terrain, exaggeration, raster, scale, opacity, boundary, imagery, contextImagery,
  droneImagery, zones, activeZone, onPoint, compact }) {
  const width = frame.width + frame.span * 0.70, depth = frame.depth + frame.span * 0.70;
  const segments = terrain ? compact ? 36 : terrain.drone ? 112 : 60 : 1;
  const surface = useMemo(() => {
    const mesh = new PlaneGeometry(width / frame.span, depth / frame.span, segments, segments);
    mesh.rotateX(-Math.PI / 2);
    if (terrain && Number.isFinite(terrain.reference)) {
      const positions = mesh.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const height = terrain.sample(positions.getX(i) * frame.span, positions.getZ(i) * frame.span);
        if (Number.isFinite(height)) positions.setY(i, (height - terrain.reference) * exaggeration / frame.span);
      }
      mesh.computeVertexNormals();
    }
    return mesh;
  }, [width, depth, frame.span, segments, terrain, exaggeration]);
  const texture = useMemo(() => createTexture({
    frame, field, width, depth, raster, scale, opacity, boundary, imagery, contextImagery, droneImagery, zones, activeZone, compact,
  }), [frame, field, width, depth, raster, scale, opacity, boundary, imagery, contextImagery, droneImagery, zones, activeZone, compact]);
  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh geometry={surface} onClick={(event) => {
    if (event.delta > 4 || !onPoint) return;
    const x = event.point.x * frame.span, z = event.point.z * frame.span;
    const coordinate = frame.coordinate(x, z);
    if (containsPoint(field.geometry, coordinate)) onPoint({ x, z, coordinate });
  }}>
    <meshBasicMaterial map={texture} toneMapped={false} transparent alphaTest={0.025} />
  </mesh>;
}

function SplitViews({ stacked }) {
  useFrame(({ gl, scene, camera, size }) => {
    const width = stacked ? size.width : Math.floor(size.width / 2);
    const height = stacked ? Math.floor(size.height / 2) : size.height;
    if (!width || !height) return;
    const originalAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    gl.setScissorTest(true);
    for (const [x, y] of stacked ? [[0, size.height - height], [0, 0]] : [[0, 0], [size.width - width, 0]]) {
      gl.setViewport(x, y, width, height);
      gl.setScissor(x, y, width, height);
      gl.render(scene, camera);
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    camera.aspect = originalAspect;
    camera.updateProjectionMatrix();
  }, 1);
  return null;
}

const emptyZones = [];
function SelectionPin({ selection, frame, terrain, exaggeration }) {
  const [x, z] = frame.local(selection);
  const height = terrain?.sample(x, z);
  const y = Number.isFinite(height) ? (height - terrain.reference) * exaggeration / frame.span : 0;
  return <mesh position={[x / frame.span, y + 0.037, z / frame.span]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[0.015, 0.022, 28]} />
    <meshBasicMaterial color="#ffde8c" side={2} toneMapped={false} />
  </mesh>;
}
function ObservationMarkers({ markers, frame, terrain, exaggeration, onPoint }) {
  return markers.map(marker => {
    const [x, z] = frame.local(marker.coordinate);
    const height = terrain?.sample(x, z);
    const y = Number.isFinite(height) ? (height - terrain.reference) * exaggeration / frame.span : 0;
    return <mesh key={marker.id} position={[x / frame.span, y + 0.019, z / frame.span]}
      onClick={event => {
        if (event.delta > 4) return;
        event.stopPropagation();
        onPoint({ x, z, coordinate: marker.coordinate, marker });
      }}>
      <sphereGeometry args={[0.015, 10, 8]} />
      <meshStandardMaterial color="#ffc169" emissive="#bc7530" emissiveIntensity={0.35} />
    </mesh>;
  });
}

export default function ParcelScene({ frame, field, terrain = null, exaggeration = 1, raster = null,
  scale = null, opacity = 0.84, boundary = true, imagery = null, contextImagery = null, zones = emptyZones, activeZone,
  droneImagery, command, sync, onCamera, onContextLoss, onPoint, markers = emptyZones, split = false, stacked = false,
  reduced = false, compact = false, fallback = null, selection = null, interaction = true }) {
  const [software, setSoftware] = useState(false);
  const camera = useMemo(() => ({
    position: compact && !split ? [1.14, 1.18, 1.42] : [0.82, 0.90, 1.04], fov: 46, near: 0.012, far: 28,
  }), [compact, split]);
  return <Canvas
    className="spatial-three"
    frameloop="demand"
    dpr={software ? 0.85 : [1, compact ? 1.15 : 1.5]}
    camera={camera}
    gl={{ antialias: !compact && !split, powerPreference: "low-power" }}
    onCreated={({ gl }) => {
      const context = gl.getContext();
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      setSoftware(!!extension && /swiftshader|llvmpipe|software rasterizer/i
        .test(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)));
    }}
    fallback={fallback}
  >
    <hemisphereLight args={["#e6eef7", "#82725a", 1.13]} />
    <directionalLight position={[-3, 3.5, -2]} intensity={1.52} color="#ffedcc" />
    <Surface {...{ frame, field, terrain, exaggeration, raster, scale, opacity, boundary, imagery, contextImagery, droneImagery, zones, activeZone, onPoint }} compact={compact || software} />
    <ObservationMarkers {...{ markers, frame, terrain, exaggeration, onPoint }} />
    {selection && <SelectionPin {...{ selection, frame, terrain, exaggeration }} />}
    <Camera {...{ command, sync, onCamera, onContextLoss, reduced, frame, terrain, exaggeration, split, stacked, interaction }} />
    {split && <SplitViews stacked={stacked} />}
  </Canvas>;
}
