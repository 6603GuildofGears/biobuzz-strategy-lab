import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { FAQ_JSON_LD } from "@/components/sim/faq";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("guide");

export default function GuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <Simulator initialView="guide" />
    </>
  );
}
