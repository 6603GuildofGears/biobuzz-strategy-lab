import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { VIEW_TITLE } from "@/components/sim/view-titles";

export const metadata: Metadata = { title: VIEW_TITLE.guide };

export default function GuidePage() {
  return <Simulator initialView="guide" />;
}
