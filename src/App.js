import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { RoundedBox, Environment } from "@react-three/drei";

// Simple test component
function TestCube() {
  return (
    <RoundedBox args={[1, 1, 1]} radius={0.1}>
      <meshStandardMaterial color="hotpink" transparent opacity={0.8} />
    </RoundedBox>
  );
}

export default function App() {
  return (
    <div 
      style={{ 
        width: "100vw", 
        height: "100vh", 
        margin: 0,
        padding: 0,
        background: "transparent",
        position: "relative"
      }}
    >
      <Canvas 
        camera={{ position: [3, 3, 3], fov: 50 }}
        gl={{ 
          alpha: true, 
          premultipliedAlpha: false,
          antialias: true 
        }}
        style={{ 
          background: "transparent",
          display: "block"
        }}
      >
        <color attach="background" args={[0, 0, 0, 0]} />
        <ambientLight intensity={1} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <TestCube />
        <Environment preset="sunset" background={false} />
      </Canvas>
    </div>
  );
}
