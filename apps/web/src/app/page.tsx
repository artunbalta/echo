"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import AuthModal from "@/components/AuthModal";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function Landing() {
  const lenisRef = useRef<Lenis | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<Mode>("signup");
  const [email, setEmail] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // This route scrolls; the global stylesheet locks body overflow for the
  // full-screen world/venue routes, so opt back in here and restore on leave.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { h: html.style.overflow, b: document.body.style.overflow };
    html.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      html.style.overflow = prev.h;
      document.body.style.overflow = prev.b;
    };
  }, []);

  // Spring/inertia scrolling — adds weight & friction as you scroll (desktop + touch).
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.085, // lower = more friction / longer spring settle
      smoothWheel: true,
      syncTouch: true, // carry the spring feel onto mobile touch too
      syncTouchLerp: 0.08,
      wheelMultiplier: 1,
      anchors: true, // smooth-scroll the in-page nav links (#features, …)
    });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Freeze the spring while the auth modal is open.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (authOpen) lenis.stop();
    else lenis.start();
  }, [authOpen]);

  // Nav background appears once scrolled off the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reflect existing Supabase session (persisted) in the nav.
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) return;
    supa.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = supa.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  function openAuth(mode: Mode) {
    setAuthMode(mode);
    setAuthOpen(true);
    setMenuOpen(false);
  }
  async function logout() {
    await getSupabase()?.auth.signOut();
    setEmail(null);
    ["echo.userId", "echo.email"].forEach((k) => localStorage.removeItem(k));
  }

  return (
    <div className="relative bg-[#f3ecd9] text-[#1f2740] [color-scheme:light]">
      {/* ───────────────────────── NAV ───────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled ? "border-b border-[#e0d4b8] bg-[#fbf7ec]/90 backdrop-blur" : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              draggable={false}
              className="h-9 w-9 select-none"
            />
            <span className="font-pixel text-2xl font-bold tracking-wide text-[#1f2740]">ECHO</span>
          </a>

          <div className="hidden items-center gap-7 md:flex">
            <a href="#features" className="nav-link">Product</a>
            <a href="#how" className="nav-link">How it works</a>
            <a href="#world" className="nav-link">World</a>
            {email ? (
              <>
                <span className="max-w-[12rem] truncate font-pixel text-xs text-[#444c66]">{email}</span>
                <Link href="/onboard" className="btn-pixel btn-pixel-sm">
                  Enter <span className="chev" aria-hidden>›</span>
                </Link>
                <button onClick={logout} className="nav-link">Log out</button>
              </>
            ) : (
              <>
                <button onClick={() => openAuth("signin")} className="nav-link font-bold">Log in</button>
                <button onClick={() => openAuth("signup")} className="btn-pixel btn-pixel-sm">
                  Get started <span className="chev" aria-hidden>›</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 md:hidden">
            {!email && (
              <button onClick={() => openAuth("signin")} className="nav-link font-bold">Log in</button>
            )}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#e0d4b8] bg-[#fbf7ec]/80 font-pixel text-lg text-[#1f2740]"
            >
              {menuOpen ? "✕" : "≡"}
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="border-t border-[#e0d4b8] bg-[#fbf7ec]/95 backdrop-blur md:hidden">
            <div className="flex flex-col gap-1 px-5 py-3">
              <a href="#features" onClick={() => setMenuOpen(false)} className="nav-link py-2">Product</a>
              <a href="#how" onClick={() => setMenuOpen(false)} className="nav-link py-2">How it works</a>
              <a href="#world" onClick={() => setMenuOpen(false)} className="nav-link py-2">World</a>
              {email ? (
                <div className="mt-2 flex items-center justify-between">
                  <Link href="/onboard" className="btn-pixel btn-pixel-sm" onClick={() => setMenuOpen(false)}>
                    Enter <span className="chev" aria-hidden>›</span>
                  </Link>
                  <button onClick={logout} className="nav-link">Log out</button>
                </div>
              ) : (
                <button onClick={() => openAuth("signup")} className="btn-pixel btn-pixel-sm mt-2 w-max">
                  Get started <span className="chev" aria-hidden>›</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ───────────────────────── HERO ───────────────────────── */}
      <section id="top" className="relative h-[100svh] min-h-[560px] w-full overflow-hidden bg-ink">
        <img
          src="/landing-back.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="hero-scrim absolute inset-0" />
        <div className="world-vignette absolute inset-0" />

        <div className="echo-rise absolute inset-0 z-10 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
          <div className="max-w-xl">
            <img
              src="/title.png"
              alt="AI AGENTS THAT LEARN YOU."
              draggable={false}
              className="title-img w-[min(84vw,560px)] select-none"
            />
            <p className="mt-6 max-w-md font-pixel text-base leading-relaxed text-[#241d33] [text-shadow:0_1px_0_rgba(255,248,230,0.55)] sm:mt-7 sm:text-xl">
              You&apos;ve arrived in a country that does not exist. It is your first day. No one knows
              you here — not even you.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button onClick={() => openAuth("signup")} className="btn-pixel" aria-label="Get started">
                Get Started <span className="chev" aria-hidden>›</span>
              </button>
              {!email && (
                <button
                  onClick={() => openAuth("signin")}
                  className="font-pixel text-sm font-bold text-[#241d33] underline-offset-4 hover:underline"
                >
                  I already have an account
                </button>
              )}
            </div>
          </div>
        </div>

        <a
          href="#features"
          className="scroll-cue absolute bottom-5 left-1/2 z-10 -translate-x-1/2 font-pixel text-xs text-[#241d33]"
          aria-label="Scroll for more"
        >
          ▾ scroll
        </a>
      </section>

      {/* ─────────────────────── FEATURES ─────────────────────── */}
      <section id="features" className="bg-[#f3ecd9] px-6 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">What your echo does</p>
          <h2 className="section-title mt-2 max-w-2xl text-3xl sm:text-4xl">
            An agent that learns you, then moves things forward.
          </h2>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="pixel-card p-6">
                <span className="icon-chip">{f.icon}</span>
                <h3 className="section-title mt-4 text-lg uppercase tracking-wide">{f.title}</h3>
                <p className="mt-2 font-pixel text-base leading-relaxed text-[#444c66]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── HOW IT WORKS ─────────────────────── */}
      <section id="how" className="bg-[#fbf7ec] px-6 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title mt-2 max-w-2xl text-3xl sm:text-4xl">
            Your first day, and every day after.
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="flex items-center gap-3">
                  <span className="step-badge">{s.n}</span>
                  <h3 className="section-title text-lg uppercase tracking-wide">{s.title}</h3>
                </div>
                <p className="mt-3 font-pixel text-base leading-relaxed text-[#444c66]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── WORLD SHOWCASE ─────────────────────── */}
      <section id="world" className="bg-[#f3ecd9] px-6 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="eyebrow">A country that does not exist</p>
          <h2 className="section-title mx-auto mt-2 max-w-2xl text-3xl sm:text-4xl">
            A persistent world your echo lives in.
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-pixel text-base leading-relaxed text-[#444c66]">
            Step through, and your echo is there — learning from how you move, meeting others, and
            acting on your behalf while you rest.
          </p>

          {/* Windowed pixel-art screenshot of the world. */}
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl border-2 border-[#e0d4b8] bg-[#fbf7ec] shadow-[0_3px_0_#e0d4b8,0_20px_40px_rgba(40,30,10,0.12)]">
            <div className="flex items-center gap-1.5 border-b-2 border-[#e0d4b8] px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-[#d27556]" />
              <span className="h-3 w-3 rounded-full bg-[#e7c14d]" />
              <span className="h-3 w-3 rounded-full bg-grass" />
              <span className="ml-2 font-pixel text-xs text-[#444c66]">echo://world</span>
            </div>
            <img src="/demo.png" alt="A live look at the ECHO world" className="block w-full" />
          </div>

          <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-3 font-pixel text-sm text-[#1f2740]">
            {["Learns from you", "Connects for you", "Works while you rest"].map((c) => (
              <span key={c} className="rounded-full border-2 border-[#e0d4b8] bg-[#fbf7ec] px-4 py-1.5">{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── FINAL CTA ─────────────────────── */}
      <section className="bg-[#fbf7ec] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="section-title text-4xl sm:text-5xl">Today is your first day.</h2>
          <p className="mx-auto mt-4 max-w-md font-pixel text-base leading-relaxed text-[#444c66]">
            No one knows you here — not even you. Create your echo and step through.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {email ? (
              <Link href="/onboard" className="btn-pixel">
                Enter the world <span className="chev" aria-hidden>›</span>
              </Link>
            ) : (
              <>
                <button onClick={() => openAuth("signup")} className="btn-pixel">
                  Get Started <span className="chev" aria-hidden>›</span>
                </button>
                <button onClick={() => openAuth("signin")} className="nav-link font-bold">Log in</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────────────── FOOTER ─────────────────────── */}
      <footer className="border-t-2 border-[#e0d4b8] bg-[#f3ecd9] px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" width={40} height={40} draggable={false} className="h-10 w-10 select-none" />
            <div>
              <p className="font-pixel text-xl font-bold text-[#1f2740]">ECHO</p>
              <p className="mt-1 font-pixel text-sm text-[#444c66]">A country that does not exist.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2">
            <a href="#features" className="nav-link">Product</a>
            <a href="#how" className="nav-link">How it works</a>
            <a href="#world" className="nav-link">World</a>
            <Link href="/account" className="nav-link">Account</Link>
            <Link href="/venue" className="nav-link">✈ THY demo</Link>
          </div>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthed={(e) => {
          setEmail(e);
          setAuthOpen(false);
        }}
      />
    </div>
  );
}

/* ── Blocky pixel icons (navy/blue, crisp edges) ────────────────────────────── */
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" shapeRendering="crispEdges">
      <rect x="3" y="5" width="8" height="14" fill="#cfe0f2" stroke="#1f2740" strokeWidth="1.5" />
      <rect x="13" y="5" width="8" height="14" fill="#cfe0f2" stroke="#1f2740" strokeWidth="1.5" />
      <rect x="11" y="5" width="2" height="14" fill="#1f2740" />
      {[8, 11, 14].map((y) => (
        <g key={y}>
          <rect x="5" y={y} width="4" height="1.5" fill="#3f7cc0" />
          <rect x="15" y={y} width="4" height="1.5" fill="#3f7cc0" />
        </g>
      ))}
    </svg>
  );
}
function IconConnect() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" shapeRendering="crispEdges">
      <line x1="8" y1="12" x2="17" y2="6" stroke="#1f2740" strokeWidth="2" />
      <line x1="8" y1="12" x2="17" y2="18" stroke="#1f2740" strokeWidth="2" />
      <rect x="3" y="9" width="6" height="6" fill="#3f7cc0" stroke="#1f2740" strokeWidth="1.5" />
      <rect x="15" y="3" width="6" height="6" fill="#3f7cc0" stroke="#1f2740" strokeWidth="1.5" />
      <rect x="15" y="15" width="6" height="6" fill="#3f7cc0" stroke="#1f2740" strokeWidth="1.5" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" shapeRendering="crispEdges">
      <path d="M12 3 L20 6 V11 Q20 17 12 21 Q4 17 4 11 V6 Z" fill="#3f7cc0" stroke="#1f2740" strokeWidth="1.5" />
      <path d="M8 12 l3 3 l5 -6" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

const FEATURES = [
  { title: "Learns your way", icon: <IconBook />, body: "ECHO observes, adapts, and gets better over time." },
  { title: "Makes connections", icon: <IconConnect />, body: "ECHO reaches the right people, information, and tools for you." },
  { title: "You stay in control", icon: <IconShield />, body: "You guide ECHO. It acts with your goals in mind." },
];

const STEPS = [
  { n: "01", title: "Arrive", body: "Step into a country that does not exist. Create your character from a selfie or a curated set." },
  { n: "02", title: "It learns you", body: "From how you move, choose, and hesitate, your echo builds a quiet model of you." },
  { n: "03", title: "It acts for you", body: "Your echo reaches people, information, and tools — and works while you rest." },
];
