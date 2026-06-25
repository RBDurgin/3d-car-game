// ---------------------------------------------------------------- cars
// Procedural car builder, factored out of game.js so it can also be rendered in
// isolation by the dev preview harness (tools/preview.html). buildCar() returns
// { group, body, wheels, frontPivots, lightMat, tailMat }; the game animates body
// roll/pitch, wheel spin (tyre radius 0.42) and front-wheel steering against that
// contract, and boosts lightMat/tailMat emissive for night headlights.
import * as THREE from 'three';

// A box whose top face is tapered inward (narrower/shorter) than its base, so the
// silhouette reads as a sloped sports-car form rather than a brick. tx/tz are the
// fraction of the top face's half-extents relative to the base (1 = no taper).
export function taperedBox(w, h, d, tx, tz, topShiftZ = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {            // top ring of verts
      p.setX(i, p.getX(i) * tx);
      p.setZ(i, p.getZ(i) * tz + topShiftZ);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function buildCar(bodyColor) {
  const group = new THREE.Group();
  const body = new THREE.Group();   // separate so it can roll in corners
  group.add(body);

  // Glossy clearcoat car paint + tinted glass; both reflect scene.environment.
  const paint = new THREE.MeshPhysicalMaterial({
    color: bodyColor, metalness: 0.6, roughness: 0.28,
    clearcoat: 1.0, clearcoatRoughness: 0.15, envMapIntensity: 1.0,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.3, roughness: 0.55 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x10141c, metalness: 0, roughness: 0.05,
    transparent: true, opacity: 0.55, envMapIntensity: 1.4,
  });

  // Lower body: a low full-length sill plus a tapered upper that pinches in toward
  // the top, giving rounded shoulders. Sloped hood at the front, kicked-up tail.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 4.3), paint);
  sill.position.y = 0.34;
  const upper = new THREE.Mesh(taperedBox(1.86, 0.42, 4.1, 0.82, 0.9), paint);
  upper.position.set(0, 0.68, -0.05);
  const hood = new THREE.Mesh(taperedBox(1.62, 0.3, 1.5, 0.7, 0.5, -0.25), paint);
  hood.position.set(0, 0.66, 1.65);
  hood.rotation.x = -0.13;          // slope down toward the nose
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.1, 0.5, 1, 1, 1), dark);
  splitter.position.set(0, 0.3, 2.45);
  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 2.6), dark);
  skirtL.position.set(-0.92, 0.28, 0);
  const skirtR = skirtL.clone(); skirtR.position.x = 0.92;
  body.add(sill, upper, hood, splitter, skirtL, skirtR);

  // Greenhouse: a low paint roof with a tinted glass canopy wrapping the cabin.
  const roof = new THREE.Mesh(taperedBox(1.1, 0.34, 1.45, 0.78, 0.78), paint);
  roof.position.set(0, 1.18, -0.35);
  const canopy = new THREE.Mesh(taperedBox(1.36, 0.46, 2.0, 0.74, 0.7, -0.1), glass);
  canopy.position.set(0, 1.0, 0.15);
  body.add(roof, canopy);

  // Rear wing: low, wide, thin, on two legs.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.46), paint);
  spoiler.position.set(0, 1.12, -2.05);
  const spoilerLegL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.12), dark);
  spoilerLegL.position.set(-0.72, 0.95, -2.05);
  const spoilerLegR = spoilerLegL.clone();
  spoilerLegR.position.x = 0.72;
  body.add(spoiler, spoilerLegL, spoilerLegR);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xfff0aa, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xcc1100, emissiveIntensity: 0.9 });
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), lightMat);
    head.position.set(sx, 0.52, 2.82);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), tailMat);
    tail.position.set(sx, 0.6, -2.2);
    body.add(head, tail);
  }

  // Wheels: rounder low-profile tire + brighter alloy rim with spokes.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.85 });
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 0.9, roughness: 0.25 });
  const spokeGeo = new THREE.BoxGeometry(0.37, 0.07, 0.07);
  const tireGeo = wheelGeo;

  const wheels = [], frontPivots = [];
  for (const [x, z, front] of [[-0.95, 1.45, 1], [0.95, 1.45, 1], [-0.95, -1.45, 0], [0.95, -1.45, 0]]) {
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(tireGeo, wheelMat), new THREE.Mesh(rimGeo, rimMat));
    for (let s = 0; s < 5; s++) {                 // alloy spokes
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (s / 5) * Math.PI;
      wheel.add(spoke);
    }
    wheels.push(wheel);
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      pivot.add(wheel);
      frontPivots.push(pivot);
      group.add(pivot);
    } else {
      wheel.position.set(x, 0.42, z);
      group.add(wheel);
    }
  }

  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, body, wheels, frontPivots, lightMat, tailMat };
}
