import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { VIEW_TITLE } from "@/components/sim/view-titles";
import { pageMetadata } from "@/lib/seo";

// Same page as the home page, so search engines are pointed at `/` instead.
export const metadata: Metadata = { ...pageMetadata("showdown"), title: VIEW_TITLE.showdown };

export default function ResultsPage() {
  return <Simulator initialView="showdown" />;
}
