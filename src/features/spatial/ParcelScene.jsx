import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, NearestFilter, PlaneGeometry, SRGBColorSpace } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { containsPoint, pixelBounds, polygons, unproject } from "../../../shared/spatial";
import { colorFor, rgb } from "./colors";
const CropInstances = lazy(() => import("./CropInstances"));

function Camera({ command, sync, onCamera, onContextLoss, reduced, frame, terrain, exaggeration }) {
  const { camera, gl, invalidate } = useThree();
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
    const startTarget = controls.target.clone();
    const endTarget = startTarget.clone();
    if (command.type === "focus") {
      endTarget.set(command.local[0], 0, command.local[1]);
      end.add(endTarget).sub(startTarget);
    }
    if (command.type === "fit") {
      end.set(1.28, 1.23, 1.38).multiplyScalar(Math.max(1, 1.06 / camera.aspect));
      endTarget.set(0, 0, 0);
    }
    if (command.type === "north") end.set(0, Math.max(0.28, start.y),
      start.distanceTo(startTarget) * 0.7).add(startTarget);
    if (command.type === "top") end.set(0, 2.1, 0.032).add(startTarget);
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
  }, [camera, command, invalidate, reduced]);
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

function createTexture({ frame, field, width, depth, raster, scale, opacity, boundary, imagery, contextImagery, zones, activeZone, tone }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 768;
  const ctx = canvas.getContext("2d");
  const xy = (point) => {
    const [x, z] = frame.local(point);
    return [(x / width + 0.5) * canvas.width, (z / depth + 0.5) * canvas.height];
  };
  const wash = ctx.createLinearGradient(0, 0, 768, 768);
  wash.addColorStop(0, "#718471");
  wash.addColorStop(1, "#394d43");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 768, 768);
  if (contextImagery) {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(contextImagery, 0, 0, 768, 768);
    ctx.globalAlpha = 1;
  } else {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#c1d9b32d";
    for (let cell = 0; cell <= 768; cell += 32) {
      ctx.beginPath();
      ctx.moveTo(cell, 0); ctx.lineTo(cell, 768);
      ctx.moveTo(0, cell); ctx.lineTo(768, cell);
      ctx.stroke();
    }
  }

  trace(ctx, field.geometry, xy);
  ctx.save();
  ctx.clip("evenodd");
  ctx.fillStyle = tone || "#738852";
  ctx.globalAlpha = contextImagery && !tone ? 0.18 : 1;
  ctx.fillRect(0, 0, 768, 768);
  ctx.globalAlpha = 1;
  if (imagery) {
    const [west, south, east, north] = imagery.bounds;
    const [left, top] = xy([west, north]), [right, bottom] = xy([east, south]);
    ctx.globalAlpha = opacity;
    ctx.drawImage(imagery.bitmap, left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
  } else if (!contextImagery) {
    // Fine engraved lines are the cartographic surface, not measured crop rows.
    ctx.strokeStyle = "#f5f7c529";
    for (let line = -320; line < 1060; line += 9) {
      ctx.beginPath();
      ctx.moveTo(line, 0); ctx.lineTo(line + 300, 768);
      ctx.stroke();
    }
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
    ctx.strokeStyle = "#eef7c9";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  return texture;
}

function Surface({ frame, field, terrain, exaggeration, raster, scale, opacity, boundary, imagery, contextImagery,
  zones, activeZone, tone, onPoint, compact }) {
  const width = frame.width + frame.span * 0.70, depth = frame.depth + frame.span * 0.70;
  const segments = terrain ? compact ? 32 : 54 : 1;
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
  const skirt = useMemo(() => {
    const positions = surface.attributes.position;
    const stride = segments + 1;
    const edge = [
      ...Array.from({ length: segments }, (_, i) => i),
      ...Array.from({ length: segments }, (_, i) => i * stride + segments),
      ...Array.from({ length: segments }, (_, i) => segments * stride + segments - i),
      ...Array.from({ length: segments }, (_, i) => (segments - i) * stride),
    ];
    const base = Math.min(0, ...Array.from({ length: positions.count }, (_, i) => positions.getY(i))) - 0.048;
    const vertices = [];
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length];
      const point = index => [positions.getX(index), positions.getY(index), positions.getZ(index)];
      const topA = point(a), topB = point(b);
      const bottomA = [topA[0], base, topA[2]], bottomB = [topB[0], base, topB[2]];
      vertices.push(...topA, ...bottomA, ...bottomB, ...topA, ...bottomB, ...topB);
    }
    const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [surface, segments]);
  const texture = useMemo(() => createTexture({
    frame, field, width, depth, raster, scale, opacity, boundary, imagery, contextImagery, zones, activeZone, tone,
  }), [frame, field, width, depth, raster, scale, opacity, boundary, imagery, contextImagery, zones, activeZone, tone]);
  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => skirt.dispose(), [skirt]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <><mesh geometry={skirt}><meshStandardMaterial color="#27372d" side={2} roughness={1} /></mesh>
    <mesh geometry={surface} onClick={(event) => {
    if (event.delta > 4 || !onPoint) return;
    const x = event.point.x * frame.span, z = event.point.z * frame.span;
    const coordinate = frame.coordinate(x, z);
    if (containsPoint(field.geometry, coordinate)) onPoint({ x, z, coordinate });
  }}>
    <meshStandardMaterial map={texture} roughness={0.94} />
  </mesh></>;
}

const emptyZones = [];
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
  tone, command, sync, onCamera, onContextLoss, onPoint, cropAsset, markers = emptyZones,
  reduced = false, compact = false, fallback = null }) {
  const camera = useMemo(() => ({
    position: compact ? [1.73, 1.66, 1.86] : [1.28, 1.23, 1.38], fov: 40, near: 0.012, far: 28,
  }), [compact]);
  return <Canvas
    className="spatial-three"
    frameloop="demand"
    dpr={[1, compact ? 1.25 : 1.6]}
    camera={camera}
    gl={{ antialias: !compact, powerPreference: "low-power" }}
    fallback={fallback}
  >
    <ambientLight intensity={1.45} />
    <directionalLight position={[-3, 5, -2]} intensity={2.1} color="#fff2d7" />
    <Surface {...{ frame, field, terrain, exaggeration, raster, scale, opacity, boundary, imagery, contextImagery, zones, activeZone, tone, onPoint, compact }} />
    {cropAsset && <Suspense fallback={null}>
      <CropInstances asset={cropAsset} geometry={field.geometry} {...{ frame, terrain, exaggeration, compact }} />
    </Suspense>}
    <ObservationMarkers {...{ markers, frame, terrain, exaggeration, onPoint }} />
    <Camera {...{ command, sync, onCamera, onContextLoss, reduced, frame, terrain, exaggeration }} />
  </Canvas>;
}
