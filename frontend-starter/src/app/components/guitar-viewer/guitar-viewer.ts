import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';

/**
 * Strat en 3D (exportée de Blender en glTF), à faire tourner à la souris ou au doigt.
 * three.js est importé dynamiquement : il n'est téléchargé qu'à l'ouverture du profil.
 */
@Component({
  selector: 'app-guitar-viewer',
  template: `
    <canvas #canvas aria-label="Guitare en 3D : faites-la tourner en la faisant glisser" role="img"></canvas>
    @if (state() !== 'ready') {
      <p class="status">{{ state() === 'error' ? 'Impossible d’afficher la guitare 3D.' : 'Chargement de la guitare…' }}</p>
    }
  `,
  styles: `
    :host { position: relative; display: block; aspect-ratio: 3 / 4; max-height: 70vh; }
    canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: pan-y; }
    canvas:active { cursor: grabbing; }
    .status { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); }
  `,
})
export class GuitarViewerComponent {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  constructor() {
    const destroyRef = inject(DestroyRef);
    let disposed = false;
    let cleanup = () => {};
    destroyRef.onDestroy(() => {
      disposed = true;
      cleanup();
    });

    afterNextRender(async () => {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        if (disposed) return;
        const canvas = this.canvas().nativeElement;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;

        const scene = new THREE.Scene();
        // Reflets de studio sur le vernis et le métal, sans fichier HDRI à télécharger.
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        const gltf = await new GLTFLoader().loadAsync('models/strat.glb');
        if (disposed) return renderer.dispose();
        const guitar = gltf.scene;
        // Couchée à plat dans Blender : on la redresse, manche vers le haut, face à la caméra.
        guitar.rotation.x = Math.PI / 2;
        const box = new THREE.Box3().setFromObject(guitar);
        guitar.position.sub(box.getCenter(new THREE.Vector3()));
        scene.add(guitar);

        const height = box.getSize(new THREE.Vector3()).y;
        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
        camera.position.set(0, 0, height * 2);

        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = height * 0.8;
        controls.maxDistance = height * 3;
        // Rotation automatique lente, sauf si l'utilisateur a demandé moins d'animations.
        controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        controls.autoRotateSpeed = 1.5;

        const resize = () => {
          const { clientWidth: w, clientHeight: h } = canvas;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });
        this.state.set('ready');

        cleanup = () => {
          renderer.setAnimationLoop(null);
          observer.disconnect();
          controls.dispose();
          pmrem.dispose();
          renderer.dispose();
        };
      } catch {
        this.state.set('error');
      }
    });
  }
}
