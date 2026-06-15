/**
 * Engine selection (§2). Returns the live engine when ANTHROPIC_API_KEY is present,
 * otherwise the scripted mock. Server-only.
 */
import "server-only";
import { hasLLM } from "../capabilities";
import type { DialogueEngine } from "./engine";
import { MockEngine } from "./mock-engine";
import { LiveLLMEngine } from "./live-engine";

export function getDialogueEngine(): DialogueEngine {
  return hasLLM ? new LiveLLMEngine() : new MockEngine();
}
