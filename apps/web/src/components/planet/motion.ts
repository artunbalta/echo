"use client";

/**
 * prefers-reduced-motion, in its own module.
 *
 * It lives apart from Globe.tsx on purpose. Globe.tsx imports @react-three/fiber, which touches
 * React internals that do not exist during a server render, so it may only ever be reached through
 * a dynamic import with ssr disabled. A single static import of anything else in that file drags
 * the whole of three.js into the server bundle and the page fails before it renders.
 */
import { useEffect, useState } from "react";

export type GlobePhase = "idle" | "flying" | "arrived";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}
