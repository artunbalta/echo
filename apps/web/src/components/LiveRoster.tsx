"use client";

/**
 * "Who's live now" — the real people sharing the world with you this moment (derived from
 * the authoritative room state, never invented). Walk over to anyone and press E to talk;
 * "locate" pans the camera to them and pulses their marker so you can find them among the
 * NPCs. Once your echo has earned autonomy, a conversation can even run echo-to-echo.
 */
export default function LiveRoster({
  users,
  onLocate,
  onClose,
}: {
  users: { id: string; name: string; refId: string }[];
  onLocate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="panel absolute right-3 top-24 z-30 w-[min(320px,92vw)] rounded-lg p-3 font-mono text-xs text-parchment">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-echo">
          <span className="echo-pulse mr-1" aria-hidden>●</span>
          live now ({users.length})
        </span>
        <button onClick={onClose} className="text-parchment/50 hover:text-parchment">×</button>
      </div>

      {users.length === 0 ? (
        <p className="text-parchment/50">
          No one else is on the map right now. When another real person comes online, they&apos;ll
          appear here — walk over and be seen.
        </p>
      ) : (
        <>
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded border border-echo/20 px-2 py-1.5">
                <span className="truncate text-parchment">
                  <span className="echo-pulse mr-1.5 text-echo" aria-hidden>●</span>
                  {u.name}
                </span>
                <button
                  onClick={() => onLocate(u.id)}
                  className="shrink-0 rounded border border-echo/40 px-2 py-0.5 text-[10px] text-echo hover:bg-echo/10"
                >
                  go to →
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] italic text-parchment/45">
            &ldquo;Go to&rdquo; walks you to them; then press <span className="text-echo">E</span> to talk. They&apos;re real
            people, here now.
          </p>
        </>
      )}
    </div>
  );
}
