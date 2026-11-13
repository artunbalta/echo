"use client";

/**
 * Every act's own motion, laid out to be looked at (DECISIONS C98).
 *
 * `/dev/gestures?g=take` draws the rig doing one gesture at six moments of it, side by side, with the
 * thing where a body that had stepped up to it would find it and whatever is in the hand in the hand.
 * It exists because a motion cannot be reviewed by reading it: the owner's complaint was that every
 * job looked the same, and the answer has to be seen to be believed, one gesture at a time
 * (`?g=`, `&hold=` seconds, `&up=` and `&ahead=` metres for where the thing is, `&item=`).
 *
 * Dev only: not linked from anywhere, no styling.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { GESTURES, type Gesture } from "@echo/planet";

import { buildCharacter, poseCharacter } from "@/game/three/character";
import { gestureCharacter, handAim, handPoint } from "@/game/three/gestures";
import { handThings, type HandItem } from "@/game/world/handThings";

const TILE = 1.6;

export default function GesturesPage() {
  const host = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState("");

  useEffect(() => {
    if (!host.current) return;
    const q = new URLSearchParams(window.location.search);
    const g = (q.get("g") ?? "take") as Gesture;
    if (!GESTURES.includes(g)) {
      setSaid(`"${g}" is not a gesture`);
      return;
    }
    const hold = Number(q.get("hold") ?? 2);
    const up = Number(q.get("up") ?? 0);
    const ahead = Number(q.get("ahead") ?? 0.55);
    const item = (q.get("item") ?? "") as HandItem | "";
    const variant = q.get("v") ?? undefined;
    const seated = q.get("seat") === "1";
    const moments = hold > 0 ? [0.08, 0.28, 0.46, 0.62, 0.8, 0.97].map((k) => k * hold) : [0.2, 0.7, 1.2, 1.9, 2.6, 3.3];

    const w = host.current.clientWidth;
    const h = host.current.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setClearColor(0x2a2233);
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.3);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshLambertMaterial({ color: 0x4a4057 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const span = 2.3;
    const camera = new THREE.OrthographicCamera((-moments.length * span) / 2, (moments.length * span) / 2, 1.5, -1.35, 0.1, 50);
    // Level with the chest and a little above; the bodies are turned three-quarters to it, so a hand
    // going out to a thing is seen going out, and so is one that goes out to the side.
    camera.position.set(0, 2.2, 12);
    camera.lookAt(0, 0.95, 0);
    const YAW = Math.PI / 2 - 0.5;
    const things = handThings(1);
    scene.add(things.group);
    const hand = new THREE.Vector3();
    const flags: string[] = [];
    moments.forEach((t, i) => {
      const p = buildCharacter(`dev${i}`, true);
      p.root.scale.setScalar(TILE);
      p.root.position.set((i - (moments.length - 1) / 2) * span, 0, 0);
      poseCharacter(p, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
      p.root.rotation.y = YAW;
      scene.add(p.root);
      const s = gestureCharacter(p, g, { t, holdS: hold, ahead: ahead / TILE, side: 0, up: up / TILE, variant, seated });
      flags.push(`${s.grip ? "grip" : "-"}/${s.released}/${s.progress.toFixed(2)}`);
      // The thing: a post as tall as the hand meets it, where the body would have stepped up to.
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, Math.max(0.06, up), 0.5), new THREE.MeshLambertMaterial({ color: 0x8a6a3e }));
      post.position.set(p.root.position.x + Math.sin(YAW) * ahead, Math.max(0.03, up / 2), Math.cos(YAW) * ahead);
      post.rotation.y = YAW - Math.PI / 2;
      scene.add(post);
      if (s.grip && item) {
        const o = handThings(1);
        scene.add(o.group);
        o.hold(item, handPoint(p, s.twoHanded, hand), YAW, handAim(p, new THREE.Vector3()));
      }
    });
    renderer.render(scene, camera);
    setSaid(`${g} · hold ${hold}s · thing ${ahead} m ahead, ${up} m up · grip/released/progress: ${flags.join("  ")}`);
    document.body.dataset.gesturesReady = g;
    return () => {
      renderer.dispose();
      renderer.domElement.remove();
      things.dispose();
    };
  }, []);

  return (
    <main style={{ position: "fixed", inset: 0, background: "#2a2233", color: "#f4e9d0", font: "13px ui-monospace, monospace" }}>
      <p style={{ position: "absolute", left: 10, top: 6, margin: 0, zIndex: 1 }} data-gesture-said>
        {said}
      </p>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
    </main>
  );
}
