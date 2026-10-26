import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("robots");

export default function RobotsPage() {
  return <Simulator initialView="robots" />;
}
