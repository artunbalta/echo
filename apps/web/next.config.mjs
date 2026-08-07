/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@echo/shared"],
  eslint: { ignoreDuringBuilds: true },

  /**
   * Anything served out of public/ gets Next's default `cache-control: public, max-age=0,
   * must-revalidate`, which makes every visitor revalidate every asset on every visit. For the
   * landing's heavy media that is a wasted round trip before a byte of the file can be reused —
   * and on the trailer it is a round trip in front of a video the person has just pressed play on.
   *
   * These files are content-addressed by hand instead of by hash: the trailer, its poster and the
   * hero art only ever change by being re-cut, and a re-cut ships under a new build anyway. So they
   * are safe to pin as immutable for a year. If one is ever replaced in place, rename it (or add a
   * ?v= suffix at the call site) rather than relaxing this header.
   */
  async headers() {
    return [
      {
        source:
          "/:path(echo-trailer\\.av1\\.mp4|echo-trailer\\.mp4|echo-trailer-poster\\.jpg|landing-back\\.png|title\\.png|logo\\.png|echo-logo\\.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
