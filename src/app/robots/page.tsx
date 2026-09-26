import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { VIEW_TITLE } from "@/components/sim/view-titles";

export const metadata: Metadata = { title: VIEW_TITLE.robots };

export default function RobotsPage() {
  return <Simulator initialView="robots" />;
}
