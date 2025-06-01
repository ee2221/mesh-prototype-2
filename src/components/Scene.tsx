import React, { useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import { useSceneStore } from '../store/sceneStore';
import * as THREE from 'three';

const DraggableVertex = ({ position, selected, onClick, vertexIndex }: { position: THREE.Vector3, selected: boolean, onClick: () => void, vertexIndex: number }) => {
  const selectedObject = useSceneStore(state => state.selectedObject as THREE.Mesh);
  const geometry = selectedObject?.geometry as THREE.BufferGeometry;
  const positionAttribute = geometry?.attributes.position;
  const dragStart = useRef<THREE.Vector3 | null>(null);

  // Find connected vertices (sharing faces)
  const getConnectedVertices = (vertexIndex: number) => {
    const indices = geometry.index ? Array.from(geometry.index.array) : [];
    const connected = new Set<number>();
    
    // Loop through faces (triangles)
    for (let i = 0; i < indices.length; i += 3) {
      const face = [indices[i], indices[i + 1], indices[i + 2]];
      if (face.includes(vertexIndex)) {
        // Add other vertices from the same face
        face.forEach(idx => {
          if (idx !== vertexIndex) connected.add(idx);
        });
      }
    }
    
    return Array.from(connected);
  };

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    if (selected) {
      dragStart.current = e.point.clone();
    }
  };

  const onPointerMove = (e: any) => {
    if (!dragStart.current || !selected || !positionAttribute) return;

    const currentPoint = e.point.clone();
    const delta = currentPoint.sub(dragStart.current);
    
    // Convert world space delta to object space
    const worldToLocal = selectedObject.matrixWorld.clone().invert();
    const localDelta = delta.applyMatrix4(worldToLocal);

    // Get the original position of the selected vertex
    const originalPos = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
    
    // Update selected vertex
    const newPos = originalPos.clone().add(localDelta);
    positionAttribute.setXYZ(vertexIndex, newPos.x, newPos.y, newPos.z);

    // Update connected vertices with weighted movement
    const connectedVertices = getConnectedVertices(vertexIndex);
    connectedVertices.forEach(connectedIndex => {
      const connectedPos = new THREE.Vector3().fromBufferAttribute(positionAttribute, connectedIndex);
      const distance = originalPos.distanceTo(connectedPos);
      const weight = 1 / (1 + distance); // Weight based on distance
      const weightedDelta = localDelta.clone().multiplyScalar(weight);
      connectedPos.add(weightedDelta);
      positionAttribute.setXYZ(connectedIndex, connectedPos.x, connectedPos.y, connectedPos.z);
    });

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    
    dragStart.current = currentPoint;
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  return (
    <mesh
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