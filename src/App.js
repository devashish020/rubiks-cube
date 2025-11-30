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
    samples: { value: 6, min: 1, max: 32, step: 1 }, // Reduced from 10 to 6
    resolution: { value: 1024, min: 256, max: 2048, step: 256 }, // Reduced from 2048 to 1024
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
  const smoothness = 2; // Reduced from 4 to 2 for better performance

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

      state.explosionRotationAxes[i] = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
    });
  }

  useFrame((state, delta) => {
    const animState = animationState.current;
    const deltaTime = Math.min(delta * 1000, 100);

    raycaster.current.setFromCamera(mouse.current, camera);
    const validCubes = cubesRef.current.filter((c) => c !== null);
    const intersects = raycaster.current.intersectObjects(validCubes, true);

    if (intersects.length > 0) {
      let intersectedCubeGroup = intersects[0].object;
      while (
        intersectedCubeGroup &&
        !cubesRef.current.includes(intersectedCubeGroup)
      ) {
        intersectedCubeGroup = intersectedCubeGroup.parent;
      }

      const hoveredIndex = cubesRef.current.indexOf(intersectedCubeGroup);
      if (hoveredIndex !== -1 && hoveredIndex !== hoveredCube) {
        setHoveredCube(hoveredIndex);
        onHoverChange(hoveredIndex);
      }
    } else {
      if (hoveredCube !== null) {
        setHoveredCube(null);
        onHoverChange(null);
      }
    }

    if (sphereRef.current) {
      const targetScale = hoveredCube !== null ? 0.5 : 0;
      sphereScale.current += (targetScale - sphereScale.current) * 0.35;

      sphereRef.current.scale.setScalar(sphereScale.current);

      if (hoveredCube !== null && cubesRef.current[hoveredCube]) {
        const hoveredCubeObj = cubesRef.current[hoveredCube];

        if (sphereRef.current.parent !== hoveredCubeObj) {
          hoveredCubeObj.add(sphereRef.current);
          sphereRef.current.position.set(0, 0, 0);
          sphereScale.current = 0.2;
          hoveredCubeObj.getWorldPosition(hoverPoint.current);
        }
      } else {
        if (sphereRef.current.parent !== groupRef.current) {
          groupRef.current.add(sphereRef.current);
        }
        sphereRef.current.position.set(0, -1000, 0);
      }
    }

    cubesRef.current.forEach((cubeGroup, i) => {
      if (!cubeGroup || !repulsionOffsets.current[i]) return;

      cubeGroup.updateMatrixWorld(true);

      const cubeWorldPos = new THREE.Vector3();
      cubeGroup.getWorldPosition(cubeWorldPos);

      const distance = cubeWorldPos.distanceTo(mouseWorldPos.current);
      const repulsionRadius = pauseRotations ? 6 : 4;

      if (distance < repulsionRadius) {
        const repulsionDir = new THREE.Vector3()
          .subVectors(cubeWorldPos, mouseWorldPos.current)
          .normalize();

        const strength =
          (1 - distance / repulsionRadius) * (pauseRotations ? 0.6 : 0.4);
        repulsionOffsets.current[i].copy(repulsionDir.multiplyScalar(strength));
      } else {
        repulsionOffsets.current[i].lerp(new THREE.Vector3(0, 0, 0), 0.15);
      }

      if (!pauseRotations && basePositions.current[i]) {
        cubeGroup.position
          .copy(basePositions.current[i])
          .add(repulsionOffsets.current[i]);
      }
    });

    if (pauseRotations && animState.snapshotPositions.length > 0) {
      if (isReassembling) {
        const increment = deltaTime / 600;
        animState.reassemblyProgress += increment;

        if (animState.reassemblyProgress >= 1) {
          animState.reassemblyProgress = 1;
        }

        const eased = easeInOutCubic(animState.reassemblyProgress);

        cubesRef.current.forEach((cube, i) => {
          if (
            !cube ||
            !animState.snapshotPositions[i] ||
            !basePositions.current[i]
          )
            return;

          cube.position.lerpVectors(
            animState.snapshotPositions[i],
            basePositions.current[i],
            eased
          );

          const baseQuat = new THREE.Quaternion().setFromEuler(
            baseRotations.current[i]
          );
          cube.quaternion.slerpQuaternions(
            animState.snapshotRotations[i],
            baseQuat,
            eased
          );
        });

        if (animState.reassemblyProgress >= 1) {
          cubesRef.current.forEach((cube, i) => {
            if (!cube) return;
            cube.position.copy(basePositions.current[i]);
            cube.quaternion.setFromEuler(baseRotations.current[i]);
          });

          setIsReassembling(false);
          setPauseRotations(false);
          animState.reassemblyProgress = 0;
          setExplosionProgress(0);
          animState.snapshotPositions = [];
          animState.snapshotRotations = [];
          animState.explosionRotationAxes = [];
        }
      } else {
        cubesRef.current.forEach((cube, i) => {
          if (!cube || !animState.snapshotPositions[i]) return;

          const targetPos = animState.snapshotPositions[i]
            .clone()
            .add(
              animState.explosionDirections[i]
                .clone()
                .multiplyScalar(explosionProgress)
            );

          if (repulsionOffsets.current[i]) {
            targetPos.add(repulsionOffsets.current[i]);
          }

          cube.position.copy(targetPos);

          const baseQuat = animState.snapshotRotations[i].clone();
          const spinAmount = explosionProgress * Math.PI * 2;
          const spinQuat = new THREE.Quaternion().setFromAxisAngle(
            animState.explosionRotationAxes[i],
            spinAmount * (0.5 + (i % 10) * 0.05)
          );

          cube.quaternion.copy(baseQuat).multiply(spinQuat);
        });
      }
    } else if (!pauseRotations) {
      if (isAnimating && animState.rotationGroup) {
        animState.animationProgress += deltaTime / 500;
        if (animState.animationProgress >= 1) animState.animationProgress = 1;

        const eased = easeInOutCubic(animState.animationProgress);
        const newRotation = animState.targetRotation * eased;
        const rotationDelta = newRotation - animState.currentRotation;

        animState.rotationGroup.rotateOnWorldAxis(
          animState.rotationAxis,
          rotationDelta
        );
        animState.currentRotation = newRotation;

        if (animState.animationProgress >= 1) {
          animState.rotatingCubes.forEach((cube) => {
            groupRef.current.attach(cube);

            const cubeIndex = cubesRef.current.indexOf(cube);
            if (
              cubeIndex !== -1 &&
              basePositions.current[cubeIndex] &&
              repulsionOffsets.current[cubeIndex]
            ) {
              cube.position
                .copy(basePositions.current[cubeIndex])
                .add(repulsionOffsets.current[cubeIndex]);
            }
          });

          groupRef.current.remove(animState.rotationGroup);
          animState.rotationGroup = null;
          animState.rotatingCubes = [];
          setIsAnimating(false);

          if (animState.animationQueue.length > 0 && !pauseRotations) {
            const next = animState.animationQueue.shift();
            startRotation(next.face, next.direction);
          }
        }
      }

      if (!isAnimating && animState.animationQueue.length === 0) {
        const currentTime = Date.now();
        if (currentTime - animState.lastMoveTime > AUTO_ANIMATION_DELAY) {
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
    let targetProgress = 0;
    let animationFrameId = null;

    function handleWheel(e) {
      // Calculate target progress from wheel
      const delta = e.deltaY * 0.001;
      targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
      
      // Start smooth animation loop if not already running
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(smoothUpdate);
      }
    }

    function handleKeyDown(e) {
      // Handle arrow keys (works on Vercel direct)
      if (e.key === 'ArrowDown') {
        const delta = 0.2; // 30% per arrow key
        targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
        
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(smoothUpdate);
        }
      } else if (e.key === 'ArrowUp') {
        const delta = -0.2; // 30% per arrow key
        targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
        
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(smoothUpdate);
        }
      } else if (e.key === 'PageDown') {
        const delta = 0.8; // 80% per page down
        targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
        
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(smoothUpdate);
        }
      } else if (e.key === 'PageUp') {
        const delta = -0.8; // 80% per page up
        targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
        
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(smoothUpdate);
        }
      }
    }

    function handleMessage(event) {
      // Listen for messages from parent (Framer)
      if (event.data && event.data.type === 'keyboard') {
        // Keyboard event from parent
        if (event.data.key === 'ArrowDown') {
          const delta = 0.45; // 45% per arrow key
          targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
          
          if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(smoothUpdate);
          }
        } else if (event.data.key === 'ArrowUp') {
          const delta = -0.45; // 45% per arrow key
          targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
          
          if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(smoothUpdate);
          }
        } else if (event.data.key === 'PageDown') {
          const delta = 0.9; // 90% per page down
          targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
          
          if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(smoothUpdate);
          }
        } else if (event.data.key === 'PageUp') {
          const delta = -0.9; // 90% per page up
          targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
          
          if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(smoothUpdate);
          }
        }
      } else if (event.data && typeof event.data.scrollProgress === 'number') {
        // Scroll progress from parent
        targetProgress = event.data.scrollProgress;
        
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(smoothUpdate);
        }
      }
    }

    function smoothUpdate() {
      // Fast interpolation for smooth animation without lag
      const speed = 0.2;
      const diff = targetProgress - progress.value;
      
      // Move towards target
      progress.value += diff * speed;
      
      // Update explosion
      updateDisintegration(progress.value);
      
      // Continue animating if there's still movement
      if (Math.abs(diff) > 0.001) {
        animationFrameId = requestAnimationFrame(smoothUpdate);
      } else {
        // Snap to target when close enough
        progress.value = targetProgress;
        updateDisintegration(progress.value);
        animationFrameId = null;
      }
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
        
        // IMPORTANT: Set explosion progress immediately so it shows on first key press
        setExplosionProgress(progressValue);
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
                    background={new THREE.Color("#f0f0f0")}
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
    <div style={{ width: "100vw", height: "100vh", background: "transparent" }}>
      <Canvas 
        camera={{ position: [8, 8, 8], fov: 50 }}
        gl={{ 
          alpha: true, 
          premultipliedAlpha: false,
          antialias: false, // Disable for performance
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
        dpr={[1, 1.5]} // Limit pixel ratio for performance
        performance={{ min: 0.5 }} // Allow framerate to drop if needed
        style={{ background: "transparent" }}
      >
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
