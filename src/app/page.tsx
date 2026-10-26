import type { Metadata } from "next";
import { Simulator } from "@/components/sim/simulator";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("showdown");

export default function Home() {
  return <Simulator />;
}
