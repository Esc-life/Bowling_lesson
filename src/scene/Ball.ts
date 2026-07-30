/**
 * 볼링공 메시.
 */

import * as THREE from 'three';
import { BALL } from '../config';
import { ballTexture } from './Textures';

export class Ball {
  readonly mesh: THREE.Mesh;

  constructor() {
    const geo = new THREE.SphereGeometry(BALL.radius, 40, 28);
    const mat = new THREE.MeshStandardMaterial({
      map: ballTexture(),
      roughness: 0.12,
      metalness: 0.15,
      // 볼링공은 표면이 반질반질하다 — 하이라이트가 있어야 무거워 보인다
      envMapIntensity: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'ball';
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
