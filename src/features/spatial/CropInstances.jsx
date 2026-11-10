import { useLayoutEffect, useMemo, useRef } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { Box3, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { containsPoint } from "../../../shared/spatial";

export default function CropInstances({ asset, frame, geometry, terrain, exaggeration, compact }) {
  const { scene } = useLoader(GLTFLoader, asset);
  const invalidate = useThree(state => state.invalidate);
  const groups = useRef([]);
  const { meshes, box } = useMemo(() => {
    const entries = [];
    scene.updateMatrixWorld(true);
    scene.traverse(object => { if (object.isMesh) entries.push(object); });
    return { meshes: entries, box: new Box3().setFromObject(scene) };
  }, [scene]);
  const locations = useMemo(() => {
    const points = [];
    const side = compact ? 12 : 21;
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      const east = ((x + 0.5) / side - 0.5) * frame.width;
      const south = ((z + 0.5) / side - 0.5) * frame.depth;
      if (containsPoint(geometry, frame.coordinate(east, south))) points.push([east, south]);
    }
    return points;
  }, [frame, geometry, compact]);

  useLayoutEffect(() => {
    const instances = groups.current.slice(0, meshes.length);
    return () => instances.forEach(instance => instance?.dispose());
  }, [meshes, locations.length]);

  useLayoutEffect(() => {
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const height = Math.max(size.y, 0.001);
    const displayScale = (compact ? 0.038 : 0.028) / height;
    const instance = new Object3D();
    for (let groupIndex = 0; groupIndex < meshes.length; groupIndex++) {
      const target = groups.current[groupIndex];
      for (const [index, [x, z]] of locations.entries()) {
        const ground = terrain?.sample(x, z);
        const y = Number.isFinite(ground) ? (ground - terrain.reference) * exaggeration / frame.span : 0;
        instance.position.set(x / frame.span - center.x * displayScale,
          y - box.min.y * displayScale, z / frame.span - center.z * displayScale);
        instance.scale.setScalar(displayScale);
        instance.updateMatrix();
        target.setMatrixAt(index, instance.matrix.multiply(meshes[groupIndex].matrixWorld));
      }
      target.instanceMatrix.needsUpdate = true;
      target.computeBoundingSphere();
    }
    invalidate();
  }, [meshes, box, locations, frame.span, terrain, exaggeration, compact, invalidate]);

  return meshes.map((mesh, index) => <instancedMesh key={mesh.uuid} dispose={null}
    ref={object => { groups.current[index] = object; }}
    args={[mesh.geometry, mesh.material, locations.length]} />);
}
