/**
 * `/audit` (DECISIONS C90): the twin audit as a tool anyone can use on their own panel, today.
 *
 * The page is a frame and a title; the tool is `components/bench/AuditTool.tsx`, which reads the
 * visitor's CSVs and audits them in their browser. Nothing they bring is sent anywhere, so there is
 * no account, no upload and no server work behind this route.
 */
import type { Metadata } from "next";

import AuditTool from "@/components/bench/AuditTool";
import { BenchShell } from "@/components/bench/BenchShell";
import StepBeacon from "@/components/StepBeacon";

const description =
  "Bring a panel that answered the same items twice and your twins' predictions. Get each twin's accuracy against the crowd and its share of what is knowable about a person. It runs in your browser: nothing is uploaded.";

export const metadata: Metadata = {
  title: "Audit your twins · echo",
  description,
  alternates: { canonical: "/audit" },
  openGraph: { title: "The twin audit: what do your twins know about a person?", description, type: "website", url: "/audit" },
  twitter: { card: "summary_large_image", title: "The twin audit", description },
};

export default function Audit() {
  return (
    <BenchShell>
      {/* Counted as the page opens, before any panel is in it; nothing is sent after that (C92). */}
      <StepBeacon name="audit" />
      <AuditTool />
    </BenchShell>
  );
}
