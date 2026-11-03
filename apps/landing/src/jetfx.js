/* Jetpack effects: a pool of soft sprites that become fire (white-blue at the nozzle, orange, then dark red), smoke
   that grows and drifts, and dust that blows out of the floor when it lifts off close to the ground. They live in the
   world, not on the agent, so the trail stays behind when it flies. A warm light under it lights up the floor. */
import * as THREE from "three";
import { canvasTex } from "./agent.js";

const rand = (a, b) => a + Math.random() * (b - a);

export function createJetFx(scene) {
  const tex = canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const KINDS = {
    fire: { n: 110, blending: THREE.AdditiveBlending, color: 0xffffff },
    smoke: { n: 70, blending: THREE.NormalBlending, color: 0x9aa4ad },
    dust: { n: 60, blending: THREE.NormalBlending, color: 0xd9cdb8 },
  };
  const pool = [];
  const free = { fire: [], smoke: [], dust: [] };
  for (const [kind, k] of Object.entries(KINDS)) {
    for (let i = 0; i < k.n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: k.color, transparent: true, opacity: 0, depthWrite: false, blending: k.blending, toneMapped: false }));
      sp.visible = false; sp.renderOrder = 8; sp.userData = { kind, life: 0, max: 1, vel: new THREE.Vector3(), size: 1 };
      scene.add(sp); pool.push(sp); free[kind].push(sp);
    }
  }
  const light = new THREE.PointLight(0xff9a3d, 0, 7, 1.6);
  scene.add(light);
  const accum = { fire: 0, smoke: 0, dust: 0 };
  const c1 = new THREE.Color(), blue = new THREE.Color(0xcfeaff), orange = new THREE.Color(0xff9a2e), red = new THREE.Color(0x6a1608);

  function spawn(kind, pos, vel, size, life) {
    const sp = free[kind].pop(); if (!sp) return;
    const u = sp.userData; u.life = u.max = life; u.size = size; u.vel.copy(vel);
    sp.position.copy(pos); sp.visible = true; sp.scale.setScalar(size);
  }
  const p = new THREE.Vector3(), v = new THREE.Vector3();

  return {
    light,
    /** nozzles: world positions; thrust 0..1; velocity: the agent's own motion; height: above the floor. */
    emit(dt, nozzles, thrust, velocity, height, floorXZ) {
      if (thrust > 0.08) {
        accum.fire += dt * 95 * thrust; accum.smoke += dt * 34 * thrust;
        while (accum.fire >= 1) { accum.fire--; const n = nozzles[Math.random() < 0.5 ? 0 : 1]; p.copy(n).add(v.set(rand(-0.05, 0.05), 0, rand(-0.05, 0.05))); spawn("fire", p, v.set(rand(-0.5, 0.5) + velocity.x * 0.3, -rand(3, 5.5) * (0.6 + thrust * 0.6), rand(-0.5, 0.5) + velocity.z * 0.3), rand(0.28, 0.5), rand(0.22, 0.4)); }
        while (accum.smoke >= 1) { accum.smoke--; const n = nozzles[Math.random() < 0.5 ? 0 : 1]; p.copy(n).add(v.set(0, -0.7, 0)); spawn("smoke", p, v.set(rand(-0.6, 0.6), -rand(0.6, 1.6), rand(-0.6, 0.6)), rand(0.2, 0.35), rand(0.9, 1.7)); }
        // close to the floor the blast kicks dust outward in a ring
        if (height < 1.8) {
          accum.dust += dt * 70 * thrust * (1 - height / 1.8);
          while (accum.dust >= 1) { accum.dust--; const a = rand(0, 6.283); p.set(floorXZ.x + Math.cos(a) * 0.3, 0.08, floorXZ.z + Math.sin(a) * 0.3); spawn("dust", p, v.set(Math.cos(a) * rand(1.2, 3.2), rand(0.1, 0.6), Math.sin(a) * rand(1.2, 3.2)), rand(0.35, 0.6), rand(0.7, 1.3)); }
        }
      }
      light.position.set(floorXZ.x, Math.max(0.5, height * 0.5 + 0.35), floorXZ.z);
      light.intensity = thrust > 0.05 ? (4 + Math.sin(performance.now() * 0.05) * 1.2) * thrust : 0;
    },
    update(dt) {
      for (const sp of pool) {
        const u = sp.userData;
        if (!sp.visible) continue;
        u.life -= dt;
        if (u.life <= 0) { sp.visible = false; sp.material.opacity = 0; free[u.kind].push(sp); continue; }
        const k = 1 - u.life / u.max;
        sp.position.addScaledVector(u.vel, dt);
        if (u.kind === "fire") {
          u.vel.multiplyScalar(1 - dt * 2.2);
          c1.copy(blue).lerp(orange, Math.min(1, k * 3)).lerp(red, Math.max(0, (k - 0.35) * 1.5));
          sp.material.color.copy(c1); sp.material.opacity = (1 - k) * 0.9; sp.scale.setScalar(u.size * (1 - k * 0.55));
        } else if (u.kind === "smoke") {
          u.vel.multiplyScalar(1 - dt * 1.4); u.vel.y += dt * 0.5;
          sp.material.opacity = 0.32 * (1 - k) * Math.min(1, k * 8); sp.scale.setScalar(u.size * (1 + k * 3.2));
        } else {
          u.vel.multiplyScalar(1 - dt * 2.4); u.vel.y += dt * 0.25;
          sp.material.opacity = 0.42 * (1 - k); sp.scale.setScalar(u.size * (1 + k * 2.4));
        }
      }
    },
  };
}
