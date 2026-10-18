/**
 * The planet package. One module for geometry, one for terrain, one for the registry.
 *
 * The globe renderer, the in world scene builder and the server all import from here, and there is
 * deliberately no second copy of any of it anywhere in the repository. Section 1's promise, that
 * the terrain previewed on the globe is the terrain the player walks on, is kept by that fact.
 */
export * from "./geo.js";
export * from "./manifest.js";
export * from "./terrain.js";
export * from "./land.js";
export * from "./commons.js";
export * from "./referral.js";
export * from "./globe.js";
export * from "./scene.js";
export * from "./rounds.js";
export * from "./tiling.js";
export * from "./registry.js";
export * from "./registry-store.js";
// The landing-world contracts (plan §4). Pre-seeded here so no later agent edits the barrel.
export * from "./biome-mask.js";
export * from "./walkable.js";
export * from "./assets.js";
export * from "./parcel.js";
export * from "./demo-cell.js";
// The world clock and the society substrate (SOCIETY-PLAN SOC-0.A(a), SOC-6.A).
export * from "./worldclock.js";
export * from "./society.js";
export * from "./geography.js";
// Life events and temperament, read off the society substrate (C40).
export * from "./life.js";
// The village on the ground: plots, dock, fields, graves (C41).
export * from "./village.js";
export * from "./villageAt.js";
// Everyone's day, as a closed form of the hour (C41).
export * from "./schedule.js";
// What conversations change about a life, and what a villager wants (C44).
export * from "./changes.js";
export * from "./goals.js";
// Everything a person can do to anything, the village's things, and who knows what you did (C45).
export * from "./affordances.js";
export * from "./things.js";
export * from "./deeds.js";
// What a stranger carries and makes (C47), and how villagers walk round things (C46).
export * from "./items.js";
export * from "./nav.js";
// The weather and the year (C48).
export * from "./weather.js";
// Who is close to whom, and what they say (C49).
export * from "./social.js";
// What a villager would ask a stranger for (C50).
export * from "./needs.js";
// A village's burials, weddings and new children, on the day (C52).
export * from "./events.js";
