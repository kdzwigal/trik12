/**
 * 3D Interactive Viewer for Żabka Triki (CAP001) puck
 * Built with Three.js according to skill directives:
 * - Multi-part procedural model (puck hull, grip ring, LED halo, concave button, USB-C port, coordinate axes)
 * - Studio PBR lighting & RoomEnvironment reflection
 * - Zero GC in render loop (reusable math objects)
 * - Ergonomic collapsible bottom dock
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CalibratedSample, ThemeMode, LedCommand } from '../types/triki';
import { trikiBle } from '../services/bleManager';
import { RotateCcw, Eye, Sparkles, Layers, Sliders } from 'lucide-react';

interface Triki3DViewerProps {
  latestSample: CalibratedSample | null;
  theme: ThemeMode;
  onResetOrientation: () => void;
}

export const Triki3DViewer: React.FC<Triki3DViewerProps> = ({
  latestSample,
  theme,
  onResetOrientation,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sampleRef = useRef<CalibratedSample | null>(latestSample);
  sampleRef.current = latestSample;

  const [showAxes, setShowAxes] = useState(true);
  const [explodedView, setExplodedView] = useState(0);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [activeLedColor, setActiveLedColor] = useState('#00e5ff');

  // Internal references to update in render loop without React re-renders
  const sceneElementsRef = useRef<{
    puckGroup: THREE.Group;
    buttonMesh: THREE.Mesh;
    ledRingMesh: THREE.Mesh;
    axesHelper: THREE.AxesHelper;
    buttonTopY: number;
    parts: {
      hull: THREE.Mesh;
      grip: THREE.Mesh;
      button: THREE.Mesh;
      ledRing: THREE.Mesh;
      bottomBase: THREE.Mesh;
    };
  } | null>(null);

  // Keep theme in ref for lighting/material updates
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software GL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const isEink = themeRef.current === 'eink';
    scene.background = new THREE.Color(isEink ? 0xf5f5f0 : 0xf8fafc);
    scene.fog = new THREE.Fog(isEink ? 0xf5f5f0 : 0xf8fafc, 6, 18);

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 3.2, 5.0);
    camera.lookAt(0, 0, 0);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 3. Environment Map (PMREMGenerator RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Lighting Rig
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.9);
    scene.add(ambientLight);

    const dirKeyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirKeyLight.position.set(4, 8, 4);
    dirKeyLight.castShadow = !isSoftwareGl;
    if (dirKeyLight.shadow) {
      dirKeyLight.shadow.mapSize.width = 1024;
      dirKeyLight.shadow.mapSize.height = 1024;
      dirKeyLight.shadow.camera.near = 0.5;
      dirKeyLight.shadow.camera.far = 20;
      dirKeyLight.shadow.camera.left = -3;
      dirKeyLight.shadow.camera.right = 3;
      dirKeyLight.shadow.camera.top = 3;
      dirKeyLight.shadow.camera.bottom = -3;
      dirKeyLight.shadow.bias = -0.0005;
      dirKeyLight.shadow.normalBias = 0.02;
    }
    scene.add(dirKeyLight);

    const rimLight = new THREE.DirectionalLight(0x0284c7, 0.6);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    // 5. Studio Shadow Grounding Floor
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Circular contact shadow decal
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -1.19;
    scene.add(contactShadow);

    // 6. Triki Puck Procedural Model (THREE.Group with 5 distinct parts)
    const puckGroup = new THREE.Group();
    scene.add(puckGroup);

    // Material definitions based on theme
    const hullMat = new THREE.MeshStandardMaterial({
      color: isEink ? 0x222222 : 0x1e293b,
      metalness: 0.2,
      roughness: 0.35,
    });

    const gripMat = new THREE.MeshStandardMaterial({
      color: isEink ? 0x111111 : 0x0f172a,
      metalness: 0.05,
      roughness: 0.85,
    });

    const buttonMat = new THREE.MeshStandardMaterial({
      color: isEink ? 0x444444 : 0x334155,
      metalness: 0.4,
      roughness: 0.25,
    });

    const ledMat = new THREE.MeshStandardMaterial({
      color: isEink ? 0x000000 : 0x00e5ff,
      emissive: isEink ? 0x222222 : 0x00e5ff,
      emissiveIntensity: isEink ? 0.3 : 1.4,
      roughness: 0.1,
      metalness: 0.1,
    });

    const baseMat = new THREE.MeshStandardMaterial({
      color: isEink ? 0x1a1a1a : 0x0f172a,
      roughness: 0.7,
      metalness: 0.1,
    });

    // Part 1: Main Puck Body (cylinder with bevel feel)
    const hullGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.45, 64);
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    puckGroup.add(hullMesh);

    // Part 2: Textured Grip Ring (perimetric rubber band)
    const gripGeo = new THREE.CylinderGeometry(1.28, 1.28, 0.26, 64);
    const gripMesh = new THREE.Mesh(gripGeo, gripMat);
    gripMesh.castShadow = true;
    gripMesh.position.y = 0.02;
    puckGroup.add(gripMesh);

    // Part 3: Anti-slip Bottom Base
    const baseGeo = new THREE.CylinderGeometry(1.18, 1.2, 0.08, 64);
    const bottomBase = new THREE.Mesh(baseGeo, baseMat);
    bottomBase.position.y = -0.24;
    puckGroup.add(bottomBase);

    // Part 4: RGB LED Halo Ring (around the center button)
    const ledGeo = new THREE.TorusGeometry(0.82, 0.045, 16, 64);
    const ledRingMesh = new THREE.Mesh(ledGeo, ledMat);
    ledRingMesh.rotation.x = Math.PI / 2;
    ledRingMesh.position.y = 0.23;
    puckGroup.add(ledRingMesh);

    // Part 5: Concave Center Tactile Button
    const buttonGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 48);
    const buttonMesh = new THREE.Mesh(buttonGeo, buttonMat);
    buttonMesh.position.y = 0.22;
    buttonMesh.castShadow = true;
    puckGroup.add(buttonMesh);

    // Coordinate Axes Helper
    const axesHelper = new THREE.AxesHelper(1.8);
    axesHelper.position.y = 0.05;
    puckGroup.add(axesHelper);

    // Store references
    sceneElementsRef.current = {
      puckGroup,
      buttonMesh,
      ledRingMesh,
      axesHelper,
      buttonTopY: 0.22,
      parts: {
        hull: hullMesh,
        grip: gripMesh,
        button: buttonMesh,
        ledRing: ledRingMesh,
        bottomBase,
      },
    };

    // 7. Interactive Orbit (Pointer drag without external controls dependency)
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let manualRotY = 0;
    let manualRotX = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      manualRotY += deltaX * 0.01;
      manualRotX = Math.max(-1.2, Math.min(1.2, manualRotX + deltaY * 0.01));

      camera.position.x = 5.2 * Math.sin(manualRotY) * Math.cos(manualRotX);
      camera.position.z = 5.2 * Math.cos(manualRotY) * Math.cos(manualRotX);
      camera.position.y = Math.max(0.5, 3.2 + 5.2 * Math.sin(manualRotX));
      camera.lookAt(0, 0, 0);
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Handle Resize with ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // 8. Animation & Telemetry Render Loop (Zero memory allocations)
    const _targetQuat = new THREE.Quaternion();
    let animFrameId = 0;

    const tick = () => {
      const sample = sampleRef.current;
      const elements = sceneElementsRef.current;

      if (elements) {
        if (sample && sample.quaternion) {
          // Map Madgwick quaternion to Three.js orientation
          // Note coordinate conversion: IMU frame to Three.js world frame
          _targetQuat.set(
            sample.quaternion.x,
            sample.quaternion.z,
            -sample.quaternion.y,
            sample.quaternion.w
          );
          elements.puckGroup.quaternion.slerp(_targetQuat, 0.25);
        }

        // Tactile button depression animation when clicked on hardware
        const targetBtnY = sample && sample.button ? 0.17 : elements.buttonTopY;
        elements.buttonMesh.position.y += (targetBtnY - elements.buttonMesh.position.y) * 0.35;
      }

      renderer.render(scene, camera);
      animFrameId = requestAnimationFrame(tick);
    };

    tick();

    // Cleanup
    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      renderer.dispose();
      hullGeo.dispose();
      gripGeo.dispose();
      baseGeo.dispose();
      ledGeo.dispose();
      buttonGeo.dispose();
      floorGeo.dispose();
      shadowTexture.dispose();
      if (container.contains(domElement)) {
        container.removeChild(domElement);
      }
    };
  }, []);

  // Sync theme changes to materials & background
  useEffect(() => {
    const isEink = theme === 'eink';
    const elements = sceneElementsRef.current;
    if (elements) {
      const { hull, grip, button, ledRing, bottomBase } = elements.parts;
      if (isEink) {
        (hull.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
        (grip.material as THREE.MeshStandardMaterial).color.setHex(0x111111);
        (button.material as THREE.MeshStandardMaterial).color.setHex(0x444444);
        (bottomBase.material as THREE.MeshStandardMaterial).color.setHex(0x1a1a1a);
        (ledRing.material as THREE.MeshStandardMaterial).color.setHex(0x000000);
        (ledRing.material as THREE.MeshStandardMaterial).emissive.setHex(0x333333);
        (ledRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
      } else {
        (hull.material as THREE.MeshStandardMaterial).color.setHex(0x1e293b);
        (grip.material as THREE.MeshStandardMaterial).color.setHex(0x0f172a);
        (button.material as THREE.MeshStandardMaterial).color.setHex(0x334155);
        (bottomBase.material as THREE.MeshStandardMaterial).color.setHex(0x0f172a);
        (ledRing.material as THREE.MeshStandardMaterial).color.setStyle(activeLedColor);
        (ledRing.material as THREE.MeshStandardMaterial).emissive.setStyle(activeLedColor);
        (ledRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
      }
    }
  }, [theme, activeLedColor]);

  // Sync axes visibility
  useEffect(() => {
    if (sceneElementsRef.current) {
      sceneElementsRef.current.axesHelper.visible = showAxes;
    }
  }, [showAxes]);

  // Sync exploded view slider
  useEffect(() => {
    if (sceneElementsRef.current) {
      const parts = sceneElementsRef.current.parts;
      const offset = explodedView * 0.8;
      parts.button.position.y = 0.22 + offset * 1.2;
      parts.ledRing.position.y = 0.23 + offset * 0.9;
      parts.grip.position.y = 0.02 + offset * 0.4;
      parts.bottomBase.position.y = -0.24 - offset * 0.8;
    }
  }, [explodedView]);

  // Handle LED color change & send BLE command
  const handleColorSelect = (colorHex: string, r: number, g: number, b: number) => {
    setActiveLedColor(colorHex);
    const cmd: LedCommand = { r, g, b, brightness: 255 };
    trikiBle.sendLedCommand(cmd);
  };

  const isEink = theme === 'eink';

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden select-none">
      {/* Three.js canvas mount container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Spec Badge / Orientation HUD */}
      <div
        className={`absolute top-4 left-4 text-xs font-mono px-3 py-2 rounded-lg pointer-events-none transition-colors ${
          isEink
            ? 'bg-black text-white border border-black shadow-none'
            : 'bg-white/90 text-slate-800 border border-slate-200 shadow-sm backdrop-blur-sm'
        }`}
      >
        <div className="font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
          Żabka Triki (CAP001)
        </div>
        <div className="flex gap-3 tabular-nums">
          <span>R: {latestSample ? latestSample.euler.roll.toFixed(1) : '0.0'}°</span>
          <span>P: {latestSample ? latestSample.euler.pitch.toFixed(1) : '0.0'}°</span>
          <span>Y: {latestSample ? latestSample.euler.yaw.toFixed(1) : '0.0'}°</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] opacity-80">
          <span>Przycisk: {latestSample?.button ? 'WCIŚNIĘTY' : 'Puszczony'}</span>
          <span>·</span>
          <span>Gest: {latestSample?.gesture || 'idle'}</span>
        </div>
      </div>

      {/* Ergonomic Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-[560px] z-10 transition-all">
        {/* Collapse toggle tab */}
        <div className="flex justify-center mb-1">
          <button
            onClick={() => setDockExpanded(!dockExpanded)}
            className={`text-[11px] font-mono px-3 py-1 rounded-t-md border-t border-x transition-colors ${
              isEink
                ? 'bg-white text-black border-black font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:text-slate-900 shadow-xs'
            }`}
          >
            {dockExpanded ? '▾ Zwiń kontrolki 3D' : '▴ Narzędzia 3D & LED'}
          </button>
        </div>

        {dockExpanded && (
          <div
            className={`p-3 rounded-xl border flex flex-col gap-3 transition-colors ${
              isEink
                ? 'bg-white border-2 border-black text-black shadow-none'
                : 'bg-white text-slate-800 border-slate-200 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              {/* Reset Orientation */}
              <button
                onClick={onResetOrientation}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isEink
                    ? 'border border-black hover:bg-black hover:text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
                title="Zeruj pozycję bazową sensora"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Zeruj bazę</span>
              </button>

              {/* Toggle Axes */}
              <button
                onClick={() => setShowAxes(!showAxes)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  showAxes
                    ? isEink
                      ? 'bg-black text-white'
                      : 'bg-sky-600 text-white'
                    : isEink
                    ? 'border border-black'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Osie XYZ</span>
              </button>

              {/* Exploded View Slider */}
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 opacity-70" />
                <span className="text-[11px] font-mono">Rozstrzelenie:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={explodedView}
                  onChange={(e) => setExplodedView(parseFloat(e.target.value))}
                  className="w-20 accent-sky-600 cursor-pointer"
                />
              </div>
            </div>

            {/* LED Color selector */}
            {!isEink && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                  Kolor LED Triki (BLE NUS):
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { hex: '#00e5ff', r: 0, g: 229, b: 255, name: 'Cyan' },
                    { hex: '#10b981', r: 16, g: 185, b: 129, name: 'Green' },
                    { hex: '#ef4444', r: 239, g: 68, b: 68, name: 'Red' },
                    { hex: '#f59e0b', r: 245, g: 158, b: 11, name: 'Amber' },
                    { hex: '#a855f7', r: 168, g: 85, b: 247, name: 'Purple' },
                    { hex: '#ffffff', r: 255, g: 255, b: 255, name: 'White' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => handleColorSelect(c.hex, c.r, c.g, c.b)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        activeLedColor === c.hex ? 'scale-125 ring-2 ring-slate-400 ring-offset-1' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={`Ustaw LED: ${c.name}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
