import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';

/**
 * Avatar équipé en 3D (exporté de Blender en glTF : public/models/<id>.glb, debout et centré),
 * à faire tourner à la souris ou au doigt. three.js n'est téléchargé qu'à l'ouverture du profil.
 * L'avatar est lu au premier rendu : le parent recrée le composant quand il change.
 */
@Component({
  selector: 'app-avatar-viewer',
  template: `
    <canvas #canvas [attr.aria-label]="name() + ' en 3D : faites-le tourner en le faisant glisser'" role="img"></canvas>
    @if (state() !== 'ready') {
      <p class="status">{{ state() === 'error' ? 'Impossible d’afficher l’avatar en 3D.' : 'Chargement de l’avatar…' }}</p>
    }
  `,
  styles: `
    :host { position: relative; display: block; aspect-ratio: 3 / 4; max-height: 70vh; }
    canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: pan-y; }
    canvas:active { cursor: grabbing; }
    .status { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); }
  `,
})
export class AvatarViewerComponent {
  /** Identifiant de l'avatar (nom du fichier .glb) et nom lisible. */
  readonly avatarId = input.required<string>();
  readonly name = input('Avatar');
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

        const gltf = await new GLTFLoader().loadAsync(`models/${this.avatarId()}.glb`);
        if (disposed) return renderer.dispose();
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        model.position.sub(box.getCenter(new THREE.Vector3()));
        scene.add(model);

        // Recul calé sur la hauteur et sur la largeur (le cadre est en 3:4, et l'objet tourne sur lui-même) :
        // une guitare haute comme un synthé large tiennent dans le cadre.
        const size = box.getSize(new THREE.Vector3());
        const height = Math.max(size.y, Math.hypot(size.x, size.z));
        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
        camera.position.set(0, height * 0.35, height * 2.5);

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
