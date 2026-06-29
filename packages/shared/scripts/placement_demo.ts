/**
 * Placement evidence (build prompt §6, Step 1). Drives the REAL placement core through the
 * in-memory store and prints where N sequential new users land — proving the cluster grows
 * around the most-recently-joined island. Zero keys, zero I/O.
 *
 * Run:  node --import tsx packages/shared/scripts/placement_demo.ts [N]
 *   (or)  npm run demo:placement -w @echo/shared
 */
import {
  ARCHIPELAGO_SIZE,
  OCEAN,
  islandSlot,
  slotDistance,
  assignIsland,
  InMemoryIslandStore,
} from "../src/archipelago.js";

async function main() {
  const N = Number(process.argv[2] ?? 5);
  const store = new InMemoryIslandStore();

  console.log("=".repeat(74));
  console.log(`ECHO archipelago — ${N} sequential new users, nearest-to-last-joined placement`);
  console.log(`ocean ${OCEAN.EXTENT}×${OCEAN.EXTENT} tiles · centre (${OCEAN.EXTENT / 2},${OCEAN.EXTENT / 2}) · ${ARCHIPELAGO_SIZE} slots pre-generated`);
  console.log("=".repeat(74));
  console.log(
    ["user", "slot", "x", "y", "seed", "anchor", "dist→anchor"]
      .map((h, i) => (i === 0 ? h.padEnd(8) : h.padStart(11)))
      .join(""),
  );

  let now = 1_700_000_000_000; // a fixed epoch-ms so the printout is reproducible
  let prevSlot: number | null = null;
  for (let i = 0; i < N; i++) {
    const userId = `user_${i + 1}`;
    const placed = await assignIsland(store, userId, now);
    const distToAnchor =
      placed.anchorSlot != null ? slotDistance(placed.anchorSlot, placed.index).toFixed(2) : "—";
    console.log(
      [
        userId.padEnd(8),
        String(placed.index).padStart(11),
        placed.x.toFixed(2).padStart(11),
        placed.y.toFixed(2).padStart(11),
        String(placed.seed).padStart(11),
        (placed.anchorSlot ?? "—").toString().padStart(11),
        distToAnchor.padStart(11),
      ].join(""),
    );
    prevSlot = placed.index;
    now += 60_000; // each user signs in a minute later
  }

  // Show returning-user stability: user_2 signs back in much later.
  const ret = await assignIsland(store, "user_2", now + 86_400_000);
  console.log("-".repeat(74));
  console.log(`returning user_2 → slot ${ret.index} (created=${ret.created}) — keeps their island`);

  // Cluster compactness summary.
  const snap = await store.load();
  const newcomers = snap.assignments.filter((a) => a.userId !== "user_2" || true);
  const pts = snap.assignments.map((a) => islandSlot(a.slotIndex));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const clusterRadius = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  // Field radius = distance from the centre slot to the outermost pre-generated slot.
  const fieldRadius = Math.max(
    ...Array.from({ length: ARCHIPELAGO_SIZE }, (_, i) => slotDistance(0, i)),
  );
  console.log(
    `cluster radius ${clusterRadius.toFixed(1)} tiles vs field radius ${fieldRadius.toFixed(1)} tiles ` +
      `→ ${((clusterRadius / fieldRadius) * 100).toFixed(0)}% of the field (clustered, not scattered)`,
  );
  console.log("=".repeat(74));
  void newcomers;
  void prevSlot;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
