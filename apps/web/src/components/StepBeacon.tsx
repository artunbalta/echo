"use client";

/** Counts the page it is on as having reached a step (C92, `lib/steps.ts`). Draws nothing. */
import { useEffect } from "react";

import { step, type Step } from "@/lib/steps";

export default function StepBeacon({ name }: { name: Step }) {
  useEffect(() => step(name), [name]);
  return null;
}
