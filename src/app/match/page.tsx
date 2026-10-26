import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("match");

export default function MatchPage() {
  return <Simulator initialView="match" />;
}
