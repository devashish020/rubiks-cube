import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MeshTransmissionMaterial,
  Environment,
  GradientTexture,
  RoundedBox,
} from "@react-three/drei";
import { useControls } from "leva";
import { useRef, useState, useEffect } from "react";
import gsap from "gsap";

function RubiksCube({ onHoverChange }) {
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

  // Set renderer to fully transparent
  useEffect(() => {
    if (gl) {
      gl.setClearColor(0x000000, 0);
      gl.setClearAlpha(0);
    }
  }, [gl]);

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
    samples: { value: 10, min: 1, max: 32, step: 1 },
    resolution: { value: 2048, min: 256, max: 2048, step: 256 },
    backside: false,
  });

  const centerConfig = useControls("Center Cube", {
    emissiveIntensity: { value: 2, min: 0, max: 5, step: 0.1 },
    gradientStart: "#d500ff",
    gradientEnd: "#0049ff",
  });

  const gradientConfig = useControls("Gradient Cubes", {
    gradientColor1: "#ffffff",
    gradientColor2: "#53abff",
  });

  const spacing = 1.05;
  const cubeSize = 0.95;
  const radius = 0.08;
  const smoothness = 4;

  useEffect(() => {
    let cubeIndex = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          basePositions.current[cubeIndex] = new THREE.Vector3(
            x * spacing,
            y * spacing,
            z * spacing
          );
          baseRotations.current[cubeIndex] = new THREE.Euler(0, 0, 0);
          repulsionOffsets.current[cubeIndex] = new THREE.Vector3(0, 0, 0);
          cubeIndex++;
        }
      }
    }
  }, []);

  const gradientCubeIndices = useRef([3, 9, 17, 23]);
  const faces = ["front", "back", "right", "left", "top", "bottom"];
  const AUTO_ANIMATION_DELAY = 1000;

  function getCubeGridPosition(cube) {
    if (!cube) return { x: 0, y: 0, z: 0 };
    const pos = new THREE.Vector3();
    cube.getWorldPosition(pos);
    return {
      x: Math.round(pos.x * 2) / 2,
      y: Math.round(pos.y * 2) / 2,
      z: Math.round(pos.z * 2) / 2,
    };
  }

  function getCubesForFace(face) {
    const cubesToRotate = [];
    const tolerance = 0.55;

    cubesRef.current.forEach((cube) => {
      if (!cube) return;
      const gridPos = getCubeGridPosition(cube);

      switch (face) {
        case "front":
          if (gridPos.z >= tolerance) cubesToRotate.push(cube);
          break;
        case "back":
          if (gridPos.z <= -tolerance) cubesToRotate.push(cube);
          break;
        case "right":
          if (gridPos.x >= tolerance) cubesToRotate.push(cube);
          break;
        case "left":
          if (gridPos.x <= -tolerance) cubesToRotate.push(cube);
          break;
        case "top":
          if (gridPos.y >= tolerance) cubesToRotate.push(cube);
          break;
        case "bottom":
          if (gridPos.y <= -tolerance) cubesToRotate.push(cube);
          break;
      }
    });

    return cubesToRotate;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function startRotation(face, direction) {
    const state = animationState.current;

    if (isAnimating || pauseRotations) {
      if (!pauseRotations) {
        state.animationQueue.push({ face, direction });
      }
      return;
    }

    setIsAnimating(true);
    state.rotatingCubes = getCubesForFace(face);

    if (state.rotatingCubes.length === 0) {
      setIsAnimating(false);
      return;
    }

    state.rotationGroup = new THREE.Group();
    groupRef.current.add(state.rotationGroup);

    let axis = new THREE.Vector3();
    switch (face) {
      case "front":
        axis.set(0, 0, 1);
        break;
      case "back":
        axis.set(0, 0, -1);
        break;
      case "right":
        axis.set(1, 0, 0);
        break;
      case "left":
        axis.set(-1, 0, 0);
        break;
      case "top":
        axis.set(0, 1, 0);
        break;
      case "bottom":
        axis.set(0, -1, 0);
        break;
    }

    state.rotationAxis = axis;
    state.targetRotation = (Math.PI / 2) * direction;
    state.currentRotation = 0;
    state.animationProgress = 0;

    state.rotatingCubes.forEach((cube) => {
      state.rotationGroup.attach(cube);
    });
  }

  function takeSnapshot() {
    const state = animationState.current;
    state.snapshotPositions = [];
    state.snapshotRotations = [];
    state.explosionDirections = [];
    state.explosionRotationAxes = [];

    cubesRef.current.forEach((cube, i) => {
      if (!cube) return;

      const worldPos = new THREE.Vector3();
      cube.getWorldPosition(worldPos);
      state.snapshotPositions[i] = worldPos.clone();

      const worldQuat = new THREE.Quaternion();
      cube.getWorldQuaternion(worldQuat);
      state.snapshotRotations[i] = worldQuat.clone();

      const direction = worldPos.clone().normalize();
      const distance = worldPos.length();
      const randomOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );
      state.explosionDirections[i] = direction.add(randomOffset).normalize();
      state.explosionDirections[i].multiplyScalar(8 + distance * 2);

      const randomAxis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      state.explosionRotationAxes[i] = randomAxis;
    });
  }

  useFrame((state, delta) => {
    const animState = animationState.current;

    if (isReassembling && animState.reassemblyProgress < 1) {
      animState.reassemblyProgress += delta * 1.5;

      if (animState.reassemblyProgress >= 1) {
        animState.reassemblyProgress = 1;
        setIsReassembling(false);
        setPauseRotations(false);
        setExplosionProgress(0);
      }

      const progress = easeInOutCubic(animState.reassemblyProgress);

      cubesRef.current.forEach((cube, i) => {
        if (!cube || !animState.snapshotPositions[i]) return;

        const targetPos = basePositions.current[i];
        const startPos = animState.snapshotPositions[i];
        const explosionDir = animState.explosionDirections[i];

        if (explosionDir) {
          const explosionPos = startPos.clone().add(explosionDir);
          const currentPos = new THREE.Vector3().lerpVectors(
            explosionPos,
            targetPos,
            progress
          );
          cube.position.copy(currentPos);
        }

        const startQuat = animState.snapshotRotations[i];
        const targetQuat = new THREE.Quaternion().setFromEuler(
          baseRotations.current[i]
        );
        if (startQuat && targetQuat) {
          const currentQuat = new THREE.Quaternion().slerpQuaternions(
            startQuat,
            targetQuat,
            progress
          );
          cube.quaternion.copy(currentQuat);
        }
      });
    }

    if (
      pauseRotations &&
      !isReassembling &&
      animState.snapshotPositions.length > 0
    ) {
      cubesRef.current.forEach((cube, i) => {
        if (!cube || !animState.snapshotPositions[i]) return;

        const basePos = animState.snapshotPositions[i];
        const explosionDir = animState.explosionDirections[i];

        if (explosionDir) {
          const offset = explosionDir.clone().multiplyScalar(explosionProgress);
          cube.position.copy(basePos.clone().add(offset));
        }

        const rotationAxis = animState.explosionRotationAxes[i];
        const baseQuat = animState.snapshotRotations[i];
        if (rotationAxis && baseQuat) {
          const angle = explosionProgress * Math.PI * 4;
          const rotQuat = new THREE.Quaternion().setFromAxisAngle(
            rotationAxis,
            angle
          );
          const finalQuat = baseQuat.clone().multiply(rotQuat);
          cube.quaternion.copy(finalQuat);
        }
      });

      if (sphereRef.current) {
        sphereScale.current = Math.min(explosionProgress * 2, 1);
        sphereRef.current.scale.setScalar(sphereScale.current * 0.5);
      }
    }

    if (isAnimating && animState.rotationGroup && animState.rotationAxis) {
      const rotationSpeed = 3;
      const rotationDelta = rotationSpeed * delta;

      animState.animationProgress +=
        rotationDelta / Math.abs(animState.targetRotation);

      if (animState.animationProgress >= 1) {
        animState.rotationGroup.rotateOnAxis(
          animState.rotationAxis,
          animState.targetRotation - animState.currentRotation
        );
        animState.currentRotation = animState.targetRotation;

        animState.rotatingCubes.forEach((cube) => {
          groupRef.current.attach(cube);
        });

        groupRef.current.remove(animState.rotationGroup);
        animState.rotationGroup = null;
        animState.rotatingCubes = [];
        setIsAnimating(false);

        if (animState.animationQueue.length > 0) {
          const nextMove = animState.animationQueue.shift();
          if (nextMove) {
            setTimeout(() => {
              startRotation(nextMove.face, nextMove.direction);
            }, 50);
          }
        }
      } else {
        const easedProgress = easeInOutCubic(animState.animationProgress);
        const targetRot = animState.targetRotation * easedProgress;
        const rotDiff = targetRot - animState.currentRotation;

        animState.rotationGroup.rotateOnAxis(animState.rotationAxis, rotDiff);
        animState.currentRotation = targetRot;
      }
    }

    if (!isAnimating && !pauseRotations) {
      const currentTime = state.clock.elapsedTime * 1000;

      if (currentTime - animState.lastMoveTime > AUTO_ANIMATION_DELAY) {
        if (animState.animationQueue.length === 0) {
          const randomFace = faces[Math.floor(Math.random() * faces.length)];
          const randomDirection = Math.random() > 0.5 ? 1 : -1;
          startRotation(randomFace, randomDirection);
          animState.lastMoveTime = currentTime;
        }
      }
    }
  });

  useEffect(() => {
    const progress = { value: 0 };

    function handleWheel(e) {
      e.preventDefault();

      const delta = e.deltaY * 0.001;
      const targetProgress = Math.max(0, Math.min(1, progress.value + delta));

      gsap.killTweensOf(progress);

      gsap.to(progress, {
        value: targetProgress,
        duration: 0.3,
        ease: "power2.out",
        onUpdate: () => {
          updateDisintegration(progress.value);
        },
      });
    }

    function updateDisintegration(progressValue) {
      if (progressValue > 0.01 && !pauseRotations) {
        setPauseRotations(true);
        animationState.current.animationQueue = [];

        if (animationState.current.rotationGroup) {
          animationState.current.rotatingCubes.forEach((cube) => {
            groupRef.current.attach(cube);
          });
          groupRef.current.remove(animationState.current.rotationGroup);
          animationState.current.rotationGroup = null;
          animationState.current.rotatingCubes = [];
          setIsAnimating(false);
        }

        takeSnapshot();
      }

      if (progressValue <= 0.01 && pauseRotations && !isReassembling) {
        setIsReassembling(true);
        animationState.current.reassemblyProgress = 0;
        setExplosionProgress(0);
      } else if (progressValue > 0.01 && isReassembling) {
        setIsReassembling(false);
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

    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
    }
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      if (canvas) {
        canvas.removeEventListener("wheel", handleWheel);
      }
      window.removeEventListener("wheel", handleWheel);
      gsap.killTweensOf(progress);
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
              <mesh castShadow receiveShadow>
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
              >
                {isGradientCube ? (
                  <MeshTransmissionMaterial
                    {...glassConfig}
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

  return (
    <div 
      style={{ 
        width: "100vw", 
        height: "100vh", 
        margin: 0,
        padding: 0,
        background: "transparent",
        position: "fixed",
        top: 0,
        left: 0
      }}
    >
      <Canvas 
        shadows 
        camera={{ position: [8, 8, 8], fov: 50 }}
        gl={{ 
          alpha: true, 
          premultipliedAlpha: false,
          antialias: true
        }}
        style={{ 
          background: "transparent",
          display: "block",
          width: "100%",
          height: "100%"
        }}
      >
        {/* No background color - fully transparent */}
        <ambientLight intensity={Math.PI} />
        <RubiksCube onHoverChange={setHoveredCube} />
        
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
