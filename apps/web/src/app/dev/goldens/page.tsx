"use client";

/**
 * The shipped planet, computed in THIS browser (plan I-4, the cross-engine half of I4).
 *
 * The goldens fixture was written by node (V8). This page evaluates the same terrain functions in
 * whatever engine is viewing it and prints the result as JSON, so the e2e test can compare
 * Chromium, WebKit and Firefox against the fixture. A one-ulp difference in Math.pow or the sine
 * table would show up here as a height that disagrees at the ninth decimal, which is exactly the
 * disagreement the walkable-terrain promise cannot survive on a shoreline tile.
 *
 * Dev only: not linked from anywhere, no styling, no index.
 */
import { useEffect, useState } from "react";

export default function GoldensPage() {
  const [json, setJson] = useState<string>("");
  useEffect(() => {
    let live = true;
    void import("@echo/planet").then((planet) => {
      if (!live) return;
      const seed = "echo-capacity-1";
      const field = planet.createTerrain(seed);
      const calibration = planet.calibratePlanet(field, planet.PLANET_PARAMS.landFractionTarget);
      const sphere = planet.fibonacciSphere(64).map((d) => ({
        direction: d,
        elevation: field.elevation(d),
        moisture: field.moisture(d),
        temperature: field.temperature(d),
        height: planet.normalisedHeight(field.elevation(d), calibration),
      }));
      const patch = planet.createTangentPatch(planet.DEMO_CELL, planet.PLANET_PARAMS.radiusKm);
      const local: Array<{ x: number; y: number; height: number }> = [];
      for (let i = 0; i < 32; i++) {
        const r = (i / 31) * patch.extentM * 2.5;
        const a = i * 2.399963;
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        local.push({ x, y, height: planet.sceneHeightAt(patch, field, calibration, x, y) });
      }
      const demoSpawn = planet.spawnPointFor(planet.DEMO_CELL, field, calibration, planet.PLANET_PARAMS.radiusKm);
      setJson(JSON.stringify({ seed, engine: navigator.userAgent, calibration, demoCell: planet.DEMO_CELL, demoSpawn, sphere, local }));
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main style={{ padding: 16, fontFamily: "monospace", fontSize: 12 }}>
      <p>goldens for the shipped planet, computed in this browser</p>
      <pre id="goldens" data-ready={json ? "1" : "0"} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {json || "computing…"}
      </pre>
    </main>
  );
}
