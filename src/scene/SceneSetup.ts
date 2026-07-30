/**
 * 렌더러, 씬, 조명, 리사이즈.
 *
 * 오브젝트가 12개뿐이라 성능은 여유롭다. 그래서 그림자와 톤매핑을 켠다.
 * 핀 그림자가 있어야 핀이 레인 위에 "서 있는" 것으로 보인다.
 */

import * as THREE from 'three';
import { LANE } from '../config';

export class SceneSetup {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly onResize: () => void;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e13);
    // 레인 끝이 살짝 어두워지면 18m가 멀게 느껴진다
    this.scene.fog = new THREE.Fog(0x0b0e13, 14, 34);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 80);
    this.camera.position.set(0, 1.6, -2.2);
    this.camera.lookAt(0, 0.3, LANE.headPinZ);

    this.addLights();

    this.onResize = () => this.resize(container);
    window.addEventListener('resize', this.onResize);
    this.resize(container);
  }

  private addLights(): void {
    // 전체 밝기 — 하늘/바닥 두 방향의 은은한 빛
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30251a, 0.55));

    // 핀덱 위 주 조명 (그림자를 만드는 광원)
    const key = new THREE.DirectionalLight(0xfff2d8, 2.0);
    key.position.set(1.6, 4.2, LANE.headPinZ - 2.2);
    key.target.position.set(0, 0, LANE.headPinZ + 0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    // 그림자 카메라를 핀덱 주변으로 좁혀 해상도를 아낀다
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -2.4;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    this.scene.add(key.target);

    // 투구 지점 쪽 보조광 — 공이 검게 보이지 않게
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.5);
    fill.position.set(-2, 3, -1.5);
    this.scene.add(fill);

    // 레인 중간을 살짝 밝혀 18m가 어둡게 죽지 않게
    const mid = new THREE.PointLight(0xffe7c0, 12, 12, 2);
    mid.position.set(0, 3.2, LANE.pitZ * 0.45);
    this.scene.add(mid);
  }

  private resize(container: HTMLElement): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    // updateStyle을 끄면 캔버스의 CSS 크기가 기기 픽셀 크기로 남아
    // devicePixelRatio 배만큼 커진다. 직접 CSS를 지정하지 않으므로 켜 둔다.
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
