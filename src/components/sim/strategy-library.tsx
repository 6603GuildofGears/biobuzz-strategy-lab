"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoleConfig, Strategy } from "@/lib/sim/types";

const FLOWER_MODE_SUMMARY: Record<RoleConfig["flowerMode"], string> = {
  fill: "builds FLOWERS",
  cap: "caps FLOWERS with NECTAR",
  claim: "claims every FLOWER's bottom NECTAR",
};

const describeRole = (r: RoleConfig) => {
  if (r.defend) return "Defends in TELEOP";
  const ammo = r.ammo === "all" ? "POLLEN + NECTAR" : "POLLEN only";
  const flower =
    r.flowerStart === null
      ? "never goes to FLOWERS"
      : `${FLOWER_MODE_SUMMARY[r.flowerMode]} at ${r.flowerStart}s left`;
  return `HIVE with ${ammo}, ${flower}`;
};

export function StrategyLibrary({ strategies }: { strategies: Strategy[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {strategies.map((s) => (
          <Card key={s.id} size="sm">
            <CardHeader>
              <CardTitle className="text-base">{s.name}</CardTitle>
              <CardDescription>{s.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{s.description}</p>
              <div className="space-y-1.5">
                {s.roles.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant="secondary" className="shrink-0">
                      Robot {i + 1}
                    </Badge>
                    <span>
                      {describeRole(r)}
                      {r.park ? ", parks" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
