import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { ArrowLeft } from "lucide-react";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InstancedMesh, Matrix4, Vector3 } from "three";

export function StudyPoster() {
  return <img className="spatial-study-poster" src="/visuals/spatial-field-study.webp"
    alt="Blender'da hazırlanan temsili buğday sıraları ve toprak yüzeyi" />;
}

function StudyModel({ compact, near }) {
  const [{ scene }, { scene: detail }] = useLoader(GLTFLoader, [
    "/visuals/spatial-field-study.glb", "/visuals/spatial-wheat.glb",
  ]);
  const { gl, invalidate } = useThree();
  const model = useMemo(() => {
    const model = scene.clone(true);
    const matrix = new Matrix4();
    const position = new Vector3();
    const detailMesh = detail.getObjectByProperty("isMesh", true);
    const replacements = [];
    model.traverse(object => {
      if (object.isMesh) {
        object.receiveShadow = !compact;
        object.castShadow = !compact && object.isInstancedMesh;
      }
      if (object.isInstancedMesh) {
        const positions = Array.from({ length: object.count }, (_, index) => index)
          .filter(index => !compact || index % 2 === 0);
        const nearby = near && detailMesh ? positions.map(index => {
          object.getMatrixAt(index, matrix);
          position.setFromMatrixPosition(matrix);
          return { index, distance: (position.x + 4) ** 2 + (position.z - 3) ** 2 };
        }).sort((a, b) => a.distance - b.distance).slice(0, compact ? 32 : 60) : [];
        const replaced = new Set(nearby.map(item => item.index));
        if (nearby.length) {
          const high = new InstancedMesh(detailMesh.geometry, detailMesh.material, nearby.length);
          nearby.forEach(({ index }, i) => {
            object.getMatrixAt(index, matrix);
            high.setMatrixAt(i, matrix);
          });
          high.computeBoundingSphere();
          high.castShadow = high.receiveShadow = !compact;
          replacements.push([object, high]);
        }
        let count = 0;
        positions.filter(index => !replaced.has(index)).forEach(index => {
          object.getMatrixAt(index, matrix);
          object.setMatrixAt(count++, matrix);
        });
        object.count = count;
        object.computeBoundingSphere();
      }
    });
    for (const [source, high] of replacements) source.add(high);
    return model;
  }, [scene, detail, compact, near]);
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, model]);
  useEffect(() => () => model.traverse(object => { if (object.isInstancedMesh) object.dispose(); }), [model]);
  return <primitive object={model} scale={0.044} />;
}

function StudyCamera({ command, compact, reduced }) {
  const { camera, gl, invalidate } = useThree();
  const orbit = useRef(null);
  const transition = useRef(null);
  useLayoutEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 0.48;
    controls.maxDistance = 3.6;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0.04, 0);
    controls.update();
    controls.addEventListener("change", invalidate);
    controls.addEventListener("start", () => { transition.current = null; });
    orbit.current = controls;
    return () => { controls.dispose(); orbit.current = null; };
  }, [camera, gl, invalidate]);
  useLayoutEffect(() => {
    if (!command || !orbit.current) return;
    const rows = command.view === "rows";
    const position = new Vector3(...(rows ? [compact ? 0.66 : 0.48, 0.27, 0.74] :
      compact ? [1.24, 1.2, 1.73] : [0.98, 0.81, 1.34]));
    const target = rows ? new Vector3(-0.18, 0.05, 0.12) : new Vector3(0, 0.04, 0);
    if (reduced) {
      transition.current = null;
      camera.position.copy(position);
      orbit.current.target.copy(target);
      orbit.current.update();
    } else {
      transition.current = { position, target, origin: camera.position.clone(), focus: orbit.current.target.clone(), elapsed: 0 };
    }
    invalidate();
  }, [camera, command, compact, invalidate, reduced]);
  useFrame((_, delta) => {
    const move = transition.current;
    if (!move || !orbit.current) return;
    move.elapsed += Math.min(delta, .05);
    const progress = Math.min(1, move.elapsed / .65);
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(move.origin, move.position, eased);
    orbit.current.target.lerpVectors(move.focus, move.target, eased);
    orbit.current.update();
    if (progress === 1) transition.current = null;
    else invalidate();
  });
  return null;
}

function ModelGauges({ values, capacity }) {
  return <group position={[-.37, .035, .08]}>
    {values.map((value, index) => {
      const height = Math.max(.008, value / capacity * .18);
      return <group key={index} position={[index * .17, 0, 0]}>
        <mesh position={[0, .09, 0]}>
          <boxGeometry args={[.065, .18, .065]} />
          <meshBasicMaterial color="#e7eee5" transparent opacity={.14} depthWrite={false} />
        </mesh>
        <mesh position={[0, height / 2, 0]}>
          <boxGeometry args={[.052, height, .052]} />
          <meshStandardMaterial color={index ? "#ffc083" : "#bdf4ae"} emissive={index ? "#c46f2b" : "#397e46"} emissiveIntensity={.45} />
        </mesh>
      </group>;
    })}
  </group>;
}

export default function FieldStudy({ compact, onBack, backLabel = "Parsel modeline dön", modelDay, reduced }) {
  const [command, setCommand] = useState(null);
  const [software, setSoftware] = useState(false);
  const shadows = !compact && !software;
  return <section className="spatial-workbench spatial-study" aria-label="Temsili tarla etüdü">
    <header className="spatial-workbench-header">
      <div><small className="spatial-eyebrow">TEMSİLİ SAHNE</small>
        <h2>Buğday sıraları ve toprak yüzeyi</h2>
        <p>Blender etüdü. Bitkiler, eğim ve konumlar örnektir.</p></div>
      <button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17}/> {backLabel}</button>
    </header>
    <div className="spatial-stage">
      <Canvas className="spatial-three" frameloop="demand" dpr={software ? 0.8 : [1, compact ? 1.05 : 1.45]}
        shadows={shadows} camera={{ position: compact ? [1.24, 1.2, 1.73] : [0.98, 0.81, 1.34], fov: 45 }}
        onCreated={({ gl }) => {
          gl.shadowMap.autoUpdate = false;
          const context = gl.getContext();
          const renderer = context.getExtension("WEBGL_debug_renderer_info");
          if (renderer && /swiftshader|llvmpipe|software rasterizer/i.test(context.getParameter(renderer.UNMASKED_RENDERER_WEBGL))) {
            gl.shadowMap.enabled = false;
            setSoftware(true);
          }
        }}
        gl={{ antialias: !compact, powerPreference: "low-power" }} fallback={<StudyPoster />}>
        <hemisphereLight args={["#e7efff", "#877251", 1.4]} />
        <directionalLight position={[-2, 3, -1.2]} intensity={2.0} color="#ffe3aa" castShadow={shadows}
          shadow-mapSize={[1024, 1024]} shadow-normalBias={0.012} shadow-camera-left={-1.25}
          shadow-camera-right={1.25} shadow-camera-top={1.25} shadow-camera-bottom={-1.25} />
        <Suspense fallback={null}><StudyModel compact={compact || software} near={command?.view === "rows"} /></Suspense>
        {modelDay && <ModelGauges values={modelDay.values} capacity={modelDay.capacity} />}
        <StudyCamera command={command} compact={compact} reduced={reduced ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      </Canvas>
      {modelDay && <div className="twin-scene-readout">
        <small>{modelDay.day}. GÜN · PARSEL GENELİ SU AÇIĞI</small>
        {modelDay.values.map((value, index) => <span key={index} data-plan={index}>{"AB"[index]} <strong>{value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mm</strong></span>)}
      </div>}
    </div>
    <footer className="spatial-footer">
      <button type="button" className="secondary" onClick={() => setCommand({ view: "wide" })}>Tarla geneli</button>
      <button type="button" className="secondary" onClick={() => setCommand({ view: "rows" })}>Bitki sıralarına yaklaş</button>
      <a href="/visuals/spatial-models.txt">Model ve materyal kaynakları</a>
    </footer>
  </section>;
}
