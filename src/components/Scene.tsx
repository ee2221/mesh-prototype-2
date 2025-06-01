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
  const [controlMeshRadius, setControlMeshRadius] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  // Find connected vertices
  const findConnectedVertices = () => {
    const connectedIndices = new Set<number>();
    const index = geometry.index;
    
    if (!index) return connectedIndices;

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      if (a === vertexIndex) {
        connectedIndices.add(b);
        connectedIndices.add(c);
      } else if (b === vertexIndex) {
        connectedIndices.add(a);
        connectedIndices.add(c);
      } else if (c === vertexIndex) {
        connectedIndices.add(a);
        connectedIndices.add(b);
      }
    }

    return connectedIndices;
  };

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    if (selected && mesh.current) {
      setIsDragging(true);
      const planeNormal = new THREE.Vector3();
      camera.getWorldDirection(planeNormal);
      
      const worldPosition = new THREE.Vector3();
      mesh.current.getWorldPosition(worldPosition);
      
      dragPlane.current = new THREE.Plane();
      dragPlane.current.setFromNormalAndCoplanarPoint(planeNormal, worldPosition);
      dragStart.current = worldPosition.clone();
    }
  };

  const onPointerMove = (e: any) => {
    if (!dragStart.current || !selected || !positionAttribute || !mesh.current || !dragPlane.current || !isDragging) return;

    const mouse = new THREE.Vector2(
      (e.point.x / window.innerWidth) * 2 - 1,
      -(e.point.y / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersectionPoint);

    const worldToLocal = selectedObject.matrixWorld.clone().invert();
    const localIntersection = intersectionPoint.clone().applyMatrix4(worldToLocal);
    const localStart = dragStart.current.clone().applyMatrix4(worldToLocal);
    const localDelta = localIntersection.sub(localStart);

    const currentPos = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
    const newPosition = currentPos.clone().add(localDelta);

    // Check if the new position is within the control mesh radius
    const distance = currentPos.distanceTo(newPosition);
    if (distance <= controlMeshRadius) {
      // Update the selected vertex
      positionAttribute.setXYZ(vertexIndex, newPosition.x, newPosition.y, newPosition.z);

      // Update connected vertices to maintain cube structure
      const connectedVertices = findConnectedVertices();
      connectedVertices.forEach(connectedIndex => {
        const connectedPos = new THREE.Vector3().fromBufferAttribute(positionAttribute, connectedIndex);
        const direction = connectedPos.clone().sub(currentPos).normalize();
        const newConnectedPos = newPosition.clone().add(direction.multiplyScalar(1));
        positionAttribute.setXYZ(connectedIndex, newConnectedPos.x, newConnectedPos.y, newConnectedPos.z);
      });

      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    dragStart.current = intersectionPoint;
  };

  const onPointerUp = () => {
    dragStart.current = undefined;
    dragPlane.current = undefined;
    setIsDragging(false);
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
  
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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
        enabled={!isShiftPressed}
      />
    </Canvas>
  );
};

export default Scene;