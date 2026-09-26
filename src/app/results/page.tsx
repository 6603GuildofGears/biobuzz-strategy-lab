import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { VIEW_TITLE } from "@/components/sim/view-titles";

export const metadata: Metadata = { title: VIEW_TITLE.showdown };

export default function ResultsPage() {
  return <Simulator initialView="showdown" />;
}
