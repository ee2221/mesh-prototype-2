import React, { useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import { useSceneStore } from '../store/sceneStore';
import * as THREE from 'three';

const DraggableVertex = ({ position, selected, onClick, vertexIndex }: { 
  position: THREE.Vector3, 
  selected: boolean, 
  onClick: () => void, 
  vertexIndex: number 
}) => {
  const mesh = useRef<THREE.Mesh>(null);
  const selectedObject = useSceneStore(state => state.selectedObject as THREE.Mesh);
  const geometry = selectedObject?.geometry as THREE.BufferGeometry;
  const positionAttribute = geometry?.attributes.position;
  const dragStart = useRef<{
    point: THREE.Vector3;
    vertexPositions: Float32Array;
    vertexConnections: Map<number, number[]>;
  } | null>(null);

  // Calculate vertex connections (which vertices share edges)
  const calculateVertexConnections = () => {
    const connections = new Map<number, number[]>();
    const indices = geometry.index ? Array.from(geometry.index.array) : null;
    
    if (indices) {
      // Using indexed geometry
      for (let i = 0; i < indices.length; i += 3) {
        const face = [indices[i], indices[i + 1], indices[i + 2]];
        face.forEach((v1, i) => {
          const v2 = face[(i + 1) % 3];
          if (!connections.has(v1)) connections.set(v1, []);
          if (!connections.has(v2)) connections.set(v2, []);
          if (!connections.get(v1)!.includes(v2)) connections.get(v1)!.push(v2);
          if (!connections.get(v2)!.includes(v1)) connections.get(v2)!.push(v1);
        });
      }
    } else {
      // Non-indexed geometry, assume every three vertices form a triangle
      for (let i = 0; i < positionAttribute.count; i += 3) {
        const face = [i, i + 1, i + 2];
        face.forEach((v1, i) => {
          const v2 = face[(i + 1) % 3];
          if (!connections.has(v1)) connections.set(v1, []);
          if (!connections.has(v2)) connections.set(v2, []);
          if (!connections.get(v1)!.includes(v2)) connections.get(v1)!.push(v2);
          if (!connections.get(v2)!.includes(v1)) connections.get(v2)!.push(v1);
        });
      }
    }
    return connections;
  };

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    if (selected && mesh.current && positionAttribute) {
      dragStart.current = {
        point: e.point.clone(),
        vertexPositions: new Float32Array(positionAttribute.array),
        vertexConnections: calculateVertexConnections()
      };
    }
  };

  const onPointerMove = (e: any) => {
    if (!dragStart.current || !selected || !positionAttribute) return;

    const currentPoint = e.point.clone();
    const delta = currentPoint.sub(dragStart.current.point);
    
    // Convert to object space
    const worldToLocal = selectedObject.matrixWorld.clone().invert();
    const localDelta = delta.applyMatrix4(worldToLocal);

    // Get connected vertices for smooth deformation
    const connectedVertices = dragStart.current.vertexConnections.get(vertexIndex) || [];
    
    // Update vertex positions with falloff
    for (let i = 0; i < positionAttribute.count; i++) {
      if (i === vertexIndex) {
        // Move selected vertex fully
        const x = dragStart.current.vertexPositions[i * 3] + localDelta.x;
        const y = dragStart.current.vertexPositions[i * 3 + 1] + localDelta.y;
        const z = dragStart.current.vertexPositions[i * 3 + 2] + localDelta.z;
        positionAttribute.setXYZ(i, x, y, z);
      } else if (connectedVertices.includes(i)) {
        // Move connected vertices with falloff
        const falloff = 0.5; // Adjust this value to control the influence
        const x = dragStart.current.vertexPositions[i * 3] + localDelta.x * falloff;
        const y = dragStart.current.vertexPositions[i * 3 + 1] + localDelta.y * falloff;
        const z = dragStart.current.vertexPositions[i * 3 + 2] + localDelta.z * falloff;
        positionAttribute.setXYZ(i, x, y, z);
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    dragStart.current.point = currentPoint;
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  return (
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

  // Get vertices in world space
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3();
    vertex.fromBufferAttribute(position, i);
    vertex.applyMatrix4(matrix);
    vertices.push(vertex);
    vertexIndices.push(i);
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
      if (e.key === 'Shift') setIsShiftPressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
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