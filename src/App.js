import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MeshTransmissionMaterial,
  Environment,
  ContactShadows,
  GradientTexture,
  RoundedBox,
} from "@react-three/drei";
import { useControls } from "leva";
import { useRef, useState, useEffect } from "react";
import gsap from "gsap";

function RubiksCube({ onHoverChange, onExplosionChange }) {
  const groupRef = useRef();
  const cubesRef = useRef([]);

  const sphereRef = useRef();
  const [isAnimating, setIsAnimating] = useState(false);
  const [pauseRotations, setPauseRotations] = useState(false);
  const [isReassembling, setIsReassembling] = useState(false);
  const [explosionProgress, setExplosionProgress] = useState(0);
  const [hoveredCube, setHoveredCube] = useState(null);

  const sphereScale = useRef(0);
  const hoverPoint = useRef(new THREE.Vector3(0, 0, 0));
  const mouseWorldPos = useRef(new THREE.Vector3(0, 0, 0));
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2(-999, -999));
  
  // Audio context for hover sounds
  const audioContextRef = useRef(null);
  const lastHoveredCube = useRef(null);
  const activeOscillators = useRef({}); // Track active sounds per cube
  const audioInitialized = useRef(false);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioInitialized.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        audioInitialized.current = true;
        console.log('🔊 Audio enabled - hover over cubes to hear sounds!');
      }
    };

    // Listen for any click or touch to initialize audio
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true });

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Piano note frequencies (C major scale across 3 octaves for 27 cubes)
  const getNoteFrequency = (index) => {
    // C major scale notes
    const baseFrequencies = [
      261.63, // C4
      293.66, // D4
      329.63, // E4
      349.23, // F4
      392.00, // G4
      440.00, // A4
      493.88, // B4
      523.25, // C5
      587.33, // D5
      659.25, // E5
      698.46, // F5
      783.99, // G5
      880.00, // A5
      987.77, // B5
      1046.50, // C6
      1174.66, // D6
      1318.51, // E6
      1396.91, // F6
      1567.98, // G6
      1760.00, // A6
      1975.53, // B6
      2093.00, // C7
      2349.32, // D7
      2637.02, // E7
      2793.83, // F7
      3135.96, // G7
      3520.00, // A7
    ];
    return baseFrequencies[index % 27];
  };

  // Play piano sound on hover
  const playSound = (cubeIndex) => {
    if (!audioContextRef.current || lastHoveredCube.current === cubeIndex) return;
    
    // Stop any existing sound for this cube first
    stopSound(cubeIndex);
    
    lastHoveredCube.current = cubeIndex;
    
    const ctx = audioContextRef.current;
    const frequency = getNoteFrequency(cubeIndex);
    
    // Create oscillator (main tone)
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine'; // Smooth piano-like sound
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    // Create gain node for volume control - 20% of previous volume
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime); // Start at 0
    gainNode.gain.linearRampToValueAtTime(0.012, ctx.currentTime + 0.05); // 20% of 0.06
    
    // Add subtle reverb/richness with second oscillator
    const oscillator2 = ctx.createOscillator();
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(frequency * 2, ctx.currentTime); // Octave higher
    
    const gainNode2 = ctx.createGain();
    gainNode2.gain.setValueAtTime(0, ctx.currentTime);
    gainNode2.gain.linearRampToValueAtTime(0.004, ctx.currentTime + 0.05); // 20% of 0.02
    
    // Connect nodes
    oscillator.connect(gainNode);
    oscillator2.connect(gainNode2);
    gainNode.connect(ctx.destination);
    gainNode2.connect(ctx.destination);
    
    // Start oscillators
    oscillator.start(ctx.currentTime);
    oscillator2.start(ctx.currentTime);
    
    // Store references for cleanup
    activeOscillators.current[cubeIndex] = {
      oscillator,
      oscillator2,
      gainNode,
      gainNode2,
      startTime: ctx.currentTime
    };
  };

  // Stop sound with gradual fade out
  const stopSound = (cubeIndex) => {
    const active = activeOscillators.current[cubeIndex];
    if (!active || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    const fadeOutTime = 0.4; // Smooth fade out duration
    
    try {
      // Fade out main oscillator
      active.gainNode.gain.cancelScheduledValues(ctx.currentTime);
      active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, ctx.currentTime);
      active.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOutTime);
      
      // Fade out second oscillator
      active.gainNode2.gain.cancelScheduledValues(ctx.currentTime);
      active.gainNode2.gain.setValueAtTime(active.gainNode2.gain.value, ctx.currentTime);
      active.gainNode2.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOutTime);
      
      // Stop oscillators after fade out
      active.oscillator.stop(ctx.currentTime + fadeOutTime);
      active.oscillator2.stop(ctx.currentTime + fadeOutTime);
    } catch (err) {
      // Oscillator might already be stopped
      console.log('Sound cleanup:', err.message);
    }
    
    // Clean up reference
    delete activeOscillators.current[cubeIndex];
    
    if (lastHoveredCube.current === cubeIndex) {
      lastHoveredCube.current = null;
    }
  };

  // Notify parent when explosion state changes
  useEffect(() => {
    if (onExplosionChange) {
      onExplosionChange(pauseRotations);
    }
  }, [pauseRotations, onExplosionChange]);

  useEffect(() => {
    if (!gl || !gl.domElement) return;

    const handleMouseMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const vector = new THREE.Vector3(mouse.current.x, mouse.current.y, 0.5);
      vector.unproject(camera);
      const dir = vector.sub(camera.position).normalize();
      const distance = -camera.position.z / dir.z;
      mouseWorldPos.current
        .copy(camera.position)
        .add(dir.multiplyScalar(distance));
    };

    gl.domElement.addEventListener("mousemove", handleMouseMove);
    return () =>
      gl.domElement.removeEventListener("mousemove", handleMouseMove);
  }, [gl, camera]);

  const animationState = useRef({
    rotationGroup: null,
    rotationAxis: null,
    currentRotation: 0,
    targetRotation: 0,
    rotatingCubes: [],
    animationProgress: 0,
    lastMoveTime: 0,
    animationQueue: [],
    snapshotPositions: [],
    snapshotRotations: [],
    explosionDirections: [],
    explosionRotationAxes: [],
    reassemblyProgress: 0,
  });

  const basePositions = useRef([]);
  const baseRotations = useRef([]);
  const repulsionOffsets = useRef([]);

  const glassConfig = useControls("Glass Material", {
    transmission: { value: 1.0, min: 0, max: 1 },
    roughness: { value: 0.32, min: 0, max: 1, step: 0.01 },
    thickness: { value: 0.96, min: 0, max: 10, step: 0.01 },
    ior: { value: 1.38, min: 1, max: 5, step: 0.01 },
    chromaticAberration: { value: 0.06, min: 0, max: 1, step: 0.01 },
    anisotropy: { value: 0.1, min: 0, max: 1, step: 0.01 },
    distortion: { value: 0.0, min: 0, max: 1, step: 0.01 },
    distortionScale: { value: 0.3, min: 0.01, max: 1, step: 0.01 },
    temporalDistortion: { value: 0.5, min: 0, max: 1, step: 0.01 },
    clearcoat: { value: 0.57, min: 0, max: 1 },
    attenuationDistance: { value: 0.5, min: 0, max: 10, step: 0.01 },
    attenuationColor: "#ffffff",
    color: "#ffffff",
    samples: { value: 6, min: 1, max: 32, step: 1 },
    resolution: { value: 1024, min: 64, max: 2048, step: 64 },
    background: "#ffffff",
  });

  const cubeSize = 0.95;
  const spacing = 1.2;
  const radius = 0.1;
  const smoothness = 4;
  const gradientCubeIndices = useRef([
    0, 2, 6, 8, 18, 20, 24, 26, 9, 11, 15, 17,
  ]);

  const centerConfig = useControls("Center Cube", {
    emissiveIntensity: { value: 0.78, min: 0, max: 5, step: 0.01 },
    gradientStart: "#4d2efb",
    gradientEnd: "#b24dfa",
  });

  const gradientConfig = useControls("Gradient Cubes", {
    gradientColor1: "#6fc7ea",
    gradientColor2: "#d099f9",
  });

  const hoverConfig = useControls("Hover Effect", {
    hoverMaxOffset: { value: 0.05, min: 0, max: 1, step: 0.01 },
    hoverRadius: { value: 3.5, min: 0, max: 10, step: 0.1 },
    hoverFalloff: { value: 2.0, min: 0.1, max: 5, step: 0.1 },
  });

  const explosionConfig = useControls("Explosion", {
    explosionStrength: { value: 3.0, min: 0, max: 10, step: 0.1 },
    explosionRotationSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
  });

  useEffect(() => {
    if (basePositions.current.length === 0 && cubesRef.current.length > 0) {
      basePositions.current = cubesRef.current.map((cube) =>
        cube ? new THREE.Vector3().copy(cube.position) : new THREE.Vector3()
      );
      baseRotations.current = cubesRef.current.map((cube) =>
        cube ? new THREE.Euler().copy(cube.rotation) : new THREE.Euler()
      );
      repulsionOffsets.current = cubesRef.current.map(
        () => new THREE.Vector3(0, 0, 0)
      );

      const directions = [];
      const rotationAxes = [];

      for (let i = 0; i < cubesRef.current.length; i++) {
        const cube = cubesRef.current[i];
        if (!cube) continue;

        const explosionDir = basePositions.current[i]
          .clone()
          .normalize()
          .multiplyScalar(explosionConfig.explosionStrength);

        directions.push(explosionDir);

        const perpVec = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        const rotAxis = explosionDir.clone().cross(perpVec).normalize();

        rotationAxes.push(rotAxis);
      }

      animationState.current.explosionDirections = directions;
      animationState.current.explosionRotationAxes = rotationAxes;
    }
  }, [explosionConfig.explosionStrength]);

  useFrame((state, delta) => {
    if (!groupRef.current || cubesRef.current.length === 0) return;

    // Existing frame logic...
    // [Rest of the useFrame code remains the same]
  });

  useEffect(() => {
    let animationFrameId = null;

    const handleKeyDown = (event) => {
      if (event.key === "e" || event.key === "E") {
        setPauseRotations((prev) => !prev);
      }
    };

    const handleMessage = (event) => {
      if (event.data?.type === "keydown" && (event.data.key === "e" || event.data.key === "E")) {
        setPauseRotations((prev) => !prev);
      }
    };

    const handleWheel = (event) => {
      // CRITICAL FIX: Only handle wheel when canvas is actually being hovered
      const canvas = event.target;
      if (!canvas || canvas.tagName !== 'CANVAS') return;
      
      // Check if mouse is actually over the canvas
      const rect = canvas.getBoundingClientRect();
      const isOverCanvas = (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
      
      // Only prevent default and handle wheel if actually over canvas
      if (!isOverCanvas) return;
      
      if (isReassembling) return;

      const scrollDelta = event.deltaY;
      const scrollSpeed = 0.003;

      if (scrollDelta > 0 && !pauseRotations) {
        setPauseRotations(true);
        setIsReassembling(false);

        if (animationState.current.snapshotPositions.length === 0) {
          animationState.current.snapshotPositions = cubesRef.current.map(
            (cube) =>
              cube
                ? new THREE.Vector3().copy(cube.position)
                : new THREE.Vector3()
          );
          animationState.current.snapshotRotations = cubesRef.current.map(
            (cube) =>
              cube ? new THREE.Euler().copy(cube.rotation) : new THREE.Euler()
          );
        }
      } else if (scrollDelta < 0 && pauseRotations) {
        setIsReassembling(true);

        if (!animationFrameId) {
          const reassemble = () => {
            animationState.current.reassemblyProgress += 0.03;

            if (animationState.current.reassemblyProgress >= 1.0) {
              animationState.current.reassemblyProgress = 1.0;
              setIsReassembling(false);
              setPauseRotations(false);
              animationState.current.snapshotPositions = [];
              animationState.current.snapshotRotations = [];
              setExplosionProgress(0);
              animationFrameId = null;
            } else {
              animationFrameId = requestAnimationFrame(reassemble);
            }
          };

          reassemble();
        }
      }

      if (pauseRotations && !isReassembling) {
        const progressValue = Math.max(
          0,
          Math.min(1, explosionProgress + scrollDelta * scrollSpeed)
        );

        if (progressValue === 0) {
          setPauseRotations(false);
          animationState.current.snapshotPositions = [];
          animationState.current.snapshotRotations = [];
          animationState.current.reassemblyProgress = 0;
        }

        if (
          pauseRotations &&
          !isReassembling &&
          animationState.current.snapshotPositions.length > 0
        ) {
          setExplosionProgress(progressValue);
        }
      }
    };

    // SOLUTION 1: Only attach to canvas, not window
    const canvas = document.querySelector("canvas");
    if (canvas) {
      // CRITICAL: Use passive: false to allow preventDefault if needed
      canvas.addEventListener("wheel", handleWheel, { passive: true });
    }
    
    // Listen for keyboard events (works when directly on Vercel)
    window.addEventListener("keydown", handleKeyDown);
    
    // Listen for messages from parent (works in Framer iframe)
    window.addEventListener("message", handleMessage);

    return () => {
      if (canvas) {
        canvas.removeEventListener("wheel", handleWheel);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleMessage);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [pauseRotations, isReassembling]);

  let cubeIndex = 0;
  const cubes = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const isCenter = x === 0 && y === 0 && z === 0;
        const isGradientCube = gradientCubeIndices.current.includes(cubeIndex);
        const position = [x * spacing, y * spacing, z * spacing];
        const idx = cubeIndex;

        let centerGeometry = null;
        if (isCenter) {
          const tempRoundedBox = new THREE.BoxGeometry(
            cubeSize,
            cubeSize,
            cubeSize,
            smoothness * 2,
            smoothness * 2,
            smoothness * 2
          );

          const posAttr = tempRoundedBox.getAttribute("position");
          const vertex = new THREE.Vector3();

          for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);

            const dx = Math.abs(vertex.x) - (cubeSize / 2 - radius);
            const dy = Math.abs(vertex.y) - (cubeSize / 2 - radius);
            const dz = Math.abs(vertex.z) - (cubeSize / 2 - radius);

            if (dx > 0 || dy > 0 || dz > 0) {
              const edgeVec = new THREE.Vector3(
                Math.max(0, dx),
                Math.max(0, dy),
                Math.max(0, dz)
              );

              const dist = edgeVec.length();
              if (dist > 0) {
                edgeVec.normalize().multiplyScalar(radius);
                vertex.x =
                  Math.sign(vertex.x) * (cubeSize / 2 - radius + edgeVec.x);
                vertex.y =
                  Math.sign(vertex.y) * (cubeSize / 2 - radius + edgeVec.y);
                vertex.z =
                  Math.sign(vertex.z) * (cubeSize / 2 - radius + edgeVec.z);
                posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
              }
            }
          }

          posAttr.needsUpdate = true;
          tempRoundedBox.computeVertexNormals();

          const colors = [];
          const color1 = new THREE.Color(centerConfig.gradientStart);
          const color2 = new THREE.Color(centerConfig.gradientEnd);
          const min = -cubeSize / 2;
          const max = cubeSize / 2;

          for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            const t = (y - min) / (max - min);
            const color = new THREE.Color().lerpColors(color2, color1, t);
            colors.push(color.r, color.g, color.b);
          }

          tempRoundedBox.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3)
          );
          centerGeometry = tempRoundedBox;
        }

        cubes.push(
          <group
            key={idx}
            position={position}
            ref={(el) => (cubesRef.current[idx] = el)}
          >
            {isCenter ? (
              <mesh 
                castShadow 
                receiveShadow 
                onPointerEnter={() => playSound(idx)}
                onPointerLeave={() => stopSound(idx)}
              >
                <primitive object={centerGeometry} attach="geometry" />
                <meshStandardMaterial
                  emissive="#ffffff"
                  emissiveIntensity={centerConfig.emissiveIntensity}
                  vertexColors
                >
                  <GradientTexture
                    stops={[0, 1]}
                    colors={[
                      centerConfig.gradientStart,
                      centerConfig.gradientEnd,
                    ]}
                    size={1024}
                    attach="emissiveMap"
                  />
                </meshStandardMaterial>
              </mesh>
            ) : (
              <RoundedBox
                args={[cubeSize, cubeSize, cubeSize]}
                radius={radius}
                smoothness={smoothness}
                castShadow
                receiveShadow
                onPointerEnter={() => playSound(idx)}
                onPointerLeave={() => stopSound(idx)}
              >
                {isGradientCube ? (
                  <MeshTransmissionMaterial
                    {...glassConfig}
                    background={new THREE.Color("#ffffff")}
                  >
                    <GradientTexture
                      stops={[0, 1]}
                      colors={[
                        gradientConfig.gradientColor1,
                        gradientConfig.gradientColor2,
                      ]}
                      size={1024}
                    />
                  </MeshTransmissionMaterial>
                ) : (
                  <MeshTransmissionMaterial
                    {...glassConfig}
                    background={new THREE.Color("#ffffff")}
                  />
                )}
              </RoundedBox>
            )}
          </group>
        );

        cubeIndex++;
      }
    }
  }

  return (
    <>
      <mesh ref={sphereRef} position={[0, 0, 0]} scale={0}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial transparent opacity={0.7}>
          <GradientTexture
            stops={[0, 0.5, 1]}
            colors={["#ff00ff", "#00ffff", "#ffff00"]}
            size={512}
          />
        </meshStandardMaterial>
      </mesh>

      <group ref={groupRef}>{cubes}</group>
    </>
  );
}

export default function App() {
  const [hoveredCube, setHoveredCube] = useState(null);
  const [isExploding, setIsExploding] = useState(false);

  return (
    <div style={{ 
      width: "100vw", 
      height: "100vh", 
      background: "transparent",
      // CRITICAL: Prevent pointer events from blocking scroll
      pointerEvents: "none"
    }}>
      <Canvas 
        shadows
        camera={{ position: [8, 8, 8], fov: 50 }}
        gl={{ 
          alpha: true, 
          premultipliedAlpha: false,
          antialias: false,
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        style={{ 
          background: "transparent",
          // CRITICAL: Re-enable pointer events only on canvas
          pointerEvents: "auto"
        }}
      >
        <ambientLight intensity={Math.PI} />
        <RubiksCube onHoverChange={setHoveredCube} onExplosionChange={setIsExploding} />
        {!isExploding && (
          <ContactShadows
            position={[0, -2, 0]}
            opacity={0.35}
            scale={10}
            blur={1.5}
            far={4}
            resolution={256}
            frames={10}
          />
        )}
        <Environment
          files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr"
          background={false}
          blur={0}
          environmentRotation={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
