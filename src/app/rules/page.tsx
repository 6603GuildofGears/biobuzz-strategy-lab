import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("rules");

export default function RulesPage() {
  return <Simulator initialView="rules" />;
}
