export * from "./world.js";
export * from "./archipelago.js";
export * from "./islandState.js";
export * from "./ocean.js";
export * from "./flow0.js";
export * from "./flow1.js";
export * from "./raft.js";
export * from "./flow2.js";
export * from "./flow4.js";
export * from "./flow5.js";
export * from "./social.js";
export * from "./sprite.js";
export * from "./persona.js";
export * from "./telemetry.js";
export * from "./protocol.js";
export * from "./npcgen.js";
// THE PREDICATE, NOT THE PARSE. `identityFormat.ts` is crypto-free and therefore safe in the barrel
// that client components pull in — but `parseIdentityToken` is documented as VERIFYING NOTHING, and
// publishing it to every browser bundle beside a verifier that does verify is an invitation to reach
// for the wrong one. The browser's only honest question is "do these two localStorage keys still
// describe one person", which is this. Signing and verifying stay behind `@echo/shared/identity`; if
// a client ever genuinely needs the parse, widening this line is the deliberate act that says so.
export { tokenMatchesSubject } from "./identityFormat.js";
export type { IdentityClaim } from "./identityFormat.js";
