import React, { useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import { useSceneStore } from '../store/sceneStore';
import * as THREE from 'three';

const ControlMesh = ({ vertex, radius }: { vertex: THREE.Vector3, radius: number }) => {
  return (
    <mesh position={vertex}>
      <sphereGeometry args={[radius, 8, 8]} />
      <meshBasicMaterial wireframe color="#00ff00" transparent opacity={0.5} />
    </mesh>
  );
};

const DraggableVertex = ({ position, selected, onClick, vertexIndex }: { position: THREE.Vector3, selected: boolean, onClick: () => void, vertexIndex: number }) => {
  const mesh = useRef<THREE.Mesh>(null);
  const dragStart = useRef<THREE.Vector3>();
  const dragPlane = useRef<THREE.Plane>();
  const selectedObject = useSceneStore(state => state.selectedObject as THREE.Mesh);
  const geometry = selectedObject?.geometry as THREE.BufferGeometry;
  const positionAttribute = geometry?.attributes.position;
  const { camera, raycaster } = useThree();
  const controls = useThree((state) => state.controls) as any;
  const [controlMeshRadius, setControlMeshRadius] = useState(1);

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    if (selected && mesh.current) {
      // Create drag plane perpendicular to camera
      const planeNormal = new THREE.Vector3();
      camera.getWorldDirection(planeNormal);
      
      const worldPosition = new THREE.Vector3();
      mesh.current.getWorldPosition(worldPosition);
      
      dragPlane.current = new THREE.Plane();
      dragPlane.current.setFromNormalAndCoplanarPoint(planeNormal, worldPosition);
      dragStart.current = worldPosition.clone();

      // Convert mouse coordinates to normalized device coordinates
      const mouse = new THREE.Vector2(
        (e.point.x / window.innerWidth) * 2 - 1,
        -(e.point.y / window.innerHeight) * 2 + 1
      );

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);
    }
  };

  const onPointerMove = (e: any) => {
    if (!dragStart.current || !selected || !positionAttribute || !mesh.current || !dragPlane.current) return;

    // Lock camera when holding shift
    if (e.shiftKey && controls) {
      controls.enabled = false;
    } else if (controls) {
      controls.enabled = true;
    }

    // Get intersection point with drag plane
    const mouse = new THREE.Vector2(
      (e.point.x / window.innerWidth) * 2 - 1,
      -(e.point.y / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersectionPoint);

    // Calculate movement in local space
    const worldToLocal = selectedObject.matrixWorld.clone().invert();
    const localIntersection = intersectionPoint.clone().applyMatrix4(worldToLocal);
    const localStart = dragStart.current.clone().applyMatrix4(worldToLocal);
    const localDelta = localIntersection.sub(localStart);

    // Get current vertex position
    const currentPos = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
    const newPosition = currentPos.clone().add(localDelta);

    // Check if new position is within control mesh radius
    const distance = currentPos.distanceTo(newPosition);
    if (distance <= controlMeshRadius) {
      positionAttribute.setXYZ(vertexIndex, newPosition.x, newPosition.y, newPosition.z);
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    // Update drag start position
    dragStart.current = intersectionPoint;
  };

  const onPointerUp = () => {
    dragStart.current = undefined;
    dragPlane.current = undefined;
    if (controls) {
      controls.enabled = true;
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (selected) {
      e.preventDefault();
      const delta = e.deltaY * 0.001;
      setControlMeshRadius(prev => Math.max(0.1, Math.min(5, prev - delta)));
    }
  };

  React.useEffect(() => {
    if (selected) {
      window.addEventListener('wheel', onWheel, { passive: false });
      return () => window.removeEventListener('wheel', onWheel);
    }
  }, [selected]);

  return (
    <>
      <mesh
        ref={mesh}
        position={position}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial 
          color={selected ? '#ff0000' : '#ffffff'}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </mesh>
      {selected && <ControlMesh vertex={position} radius={controlMeshRadius} />}
    </>
  );
};

const MeshHelpers = () => {
  const { selectedObject, editMode, selectedElements, selectElements } = useSceneStore();

  if (!(selectedObject instanceof THREE.Mesh) || editMode === 'object') return null;

  const geometry = selectedObject.geometry;
  const position = geometry.attributes.position;
  const vertices: THREE.Vector3[] = [];
  const vertexIndices: number[] = [];
  const matrix = selectedObject.matrixWorld;

  const uniqueVertices = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3();
    vertex.fromBufferAttribute(position, i);
    vertex.applyMatrix4(matrix);
    
    const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
    if (!uniqueVertices.has(key)) {
      uniqueVertices.set(key, i);
      vertices.push(vertex);
      vertexIndices.push(i);
    }
  }

  const handleElementSelect = (index: number) => {
    selectElements([vertexIndices[index]]);
  };

  if (editMode === 'vertex') {
    return (
      <group>
        {vertices.map((vertex, i) => (
          <DraggableVertex
            key={i}
            position={vertex}
            selected={selectedElements.includes(vertexIndices[i])}
            onClick={() => handleElementSelect(i)}
            vertexIndex={vertexIndices[i]}
          />
        ))}
      </group>
    );
  }

  return null;
};

const Scene: React.FC = () => {
  const { 
    objects, 
    selectedObject, 
    selectedObjects,
    setSelectedObject, 
    toggleObjectSelection,
    transformMode,
    editMode,
    clearElementSelection
  } = useSceneStore();

  return (
    <Canvas
      camera={{ position: [5, 5, 5], fov: 75 }}
      className="w-full h-full bg-gray-900"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedObject(null);
          clearElementSelection();
        }
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      <Grid
        infiniteGrid
        cellSize={1}
        sectionSize={3}
        fadeDistance={30}
        fadeStrength={1}
      />

      {objects.map(({ object, visible, id }) => (
        visible && (
          <primitive
            key={id}
            object={object}
            onClick={(e) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                toggleObjectSelection(id);
              } else {
                setSelectedObject(object);
              }
            }}
          />
        )
      ))}

      {selectedObject && editMode === 'object' && (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          onObjectChange={() => useSceneStore.getState().updateObjectProperties()}
          space="world"
        />
      )}

      <MeshHelpers />

      <OrbitControls
        makeDefault
        enabled={true}
      />
    </Canvas>
  );
};

export default Scene;