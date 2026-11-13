"use client";

/**
 * The village's work, laid out to be looked at (DECISIONS C98).
 *
 * `/dev/work?t=1.2` draws one body at each trade's task, `t` seconds into it, with what it works at and
 * with (`workThings.ts`): the potter's wheel under the palms, the saw in the log. As `/dev/gestures`
 * is for the stranger's own acts, this is for the villagers': whether a hand meets its thing cannot be
 * told by reading the numbers. `&only=turn,saw` picks tasks; `&yaw=` turns the bodies.
 *
 * Dev only: not linked from anywhere, no styling.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { Crowd, lookFor, type Task } from "@/game/world/crowd";
import { workThings } from "@/game/world/workThings";

const TASKS: Task[] = ["turn", "weave", "hammer", "saw", "pick", "mend", "haul", "sweep", "grind", "serve", "weed"];
const TRADE: Record<string, string> = { turn: "potter", weave: "weaver", hammer: "smith", saw: "carpenter", pick: "miner", mend: "fisher", haul: "labourer", sweep: "herder", grind: "healer", serve: "trader", weed: "farmer" };

export default function WorkPage() {
  const host = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState("");

  useEffect(() => {
    if (!host.current) return;
    const q = new URLSearchParams(window.location.search);
    const t = Number(q.get("t") ?? 0.6);
    const yaw = Number(q.get("yaw") ?? Math.PI / 2 - 0.55);
    const only = q.get("only")?.split(",") as Task[] | undefined;
    const tasks = only?.length ? TASKS.filter((x) => only.includes(x)) : TASKS;

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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 16), new THREE.MeshLambertMaterial({ color: 0x4a4057 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const span = 3.1;
    const half = (tasks.length * span) / 2;
    const camera = new THREE.OrthographicCamera(-half, half, (half * h) / w + 0.9, -(half * h) / w + 0.9, 0.1, 60);
    camera.position.set(0, 2.6, 14);
    camera.lookAt(0, 0.9, 0);

    const crowd = new Crowd(tasks.length, 1.6);
    scene.add(crowd.group);
    const work = workThings(scene);
    const grip = new THREE.Matrix4();
    const right = new THREE.Vector3();
    const left = new THREE.Vector3();
    crowd.begin();
    work.begin();
    tasks.forEach((task, i) => {
      const x = (i - (tasks.length - 1) / 2) * span - 0.5;
      const look = { ...lookFor(`dev-${task}`, TRADE[task]!, 34, i % 2 ? "f" : "m"), scale: 1 };
      crowd.pose({ x, y: 0, z: 0, yaw, activity: task === "weed" ? "stoop" : "work", speed: 0, time: t, phase0: 0, task }, look);
      crowd.hands(grip, right, left);
      work.put(task, { x, y: 0, z: 0 }, yaw, 1, t, grip, right, left);
    });
    crowd.end();
    work.end();
    renderer.render(scene, camera);
    setSaid(`${tasks.join(" · ")}   t=${t}s`);
    document.body.dataset.workReady = String(t);
    return () => {
      renderer.dispose();
      renderer.domElement.remove();
      crowd.dispose();
      work.dispose();
    };
  }, []);

  return (
    <main style={{ position: "fixed", inset: 0, background: "#2a2233", color: "#f4e9d0", font: "13px ui-monospace, monospace" }}>
      <p style={{ position: "absolute", left: 10, top: 6, margin: 0, zIndex: 1 }} data-work-said>
        {said}
      </p>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
    </main>
  );
}
