"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { RoleConfig, Strategy } from "@/lib/sim/types";
import { SliderRow } from "./slider-row";

const describeRole = (r: RoleConfig) => {
  if (r.defend) return "Defends in TELEOP";
  const ammo = r.ammo === "all" ? "POLLEN + NECTAR" : "POLLEN only";
  const flower =
    r.flowerStart === null
      ? "never goes to FLOWERS"
      : `${r.flowerMode === "cap" ? "caps FLOWERS with NECTAR" : "builds FLOWERS"} at ${r.flowerStart}s left`;
  return `HIVE with ${ammo}, ${flower}`;
};

export function StrategyLibrary({
  strategies,
  custom,
  onCustomChange,
}: {
  strategies: Strategy[];
  custom: Strategy;
  onCustomChange: (s: Strategy) => void;
}) {
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

      <Card>
        <CardHeader>
          <CardTitle>Custom strategy</CardTitle>
          <CardDescription>
            Build your own role mix. It appears as &ldquo;Custom&rdquo; in the showdown and the match viewer.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {custom.roles.map((role, i) => (
            <RoleEditor
              key={i}
              title={`Robot ${i + 1}`}
              role={role}
              onChange={(r) => {
                const roles = [...custom.roles] as [RoleConfig, RoleConfig];
                roles[i] = r;
                onCustomChange({ ...custom, roles });
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RoleEditor({ title, role, onChange }: { title: string; role: RoleConfig; onChange: (r: RoleConfig) => void }) {
  const set = <K extends keyof RoleConfig>(k: K, v: RoleConfig[K]) => onChange({ ...role, [k]: v });
  const goesToFlowers = role.flowerStart !== null;
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">{title}</h4>
      <Toggle label="Play defense in TELEOP" checked={role.defend} onChange={(v) => set("defend", v)} />
      {!role.defend && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">HIVE ammo</Label>
            <Select value={role.ammo} onValueChange={(v) => v && set("ammo", v as RoleConfig["ammo"])}>
              <SelectTrigger className="w-44">
                <SelectValue>{(v: string) => (v === "all" ? "POLLEN + NECTAR" : "POLLEN only")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">POLLEN + NECTAR</SelectItem>
                <SelectItem value="pollen">POLLEN only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Toggle label="Go to FLOWERS in endgame" checked={goesToFlowers} onChange={(v) => set("flowerStart", v ? 60 : null)} />
          {goesToFlowers && (
            <>
              <SliderRow
                label="Switch to FLOWERS at"
                value={role.flowerStart ?? 60}
                min={5}
                max={60}
                step={1}
                format={(v) => `${v}s left`}
                onChange={(v) => set("flowerStart", v)}
              />
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">FLOWER plan</Label>
                <Select value={role.flowerMode} onValueChange={(v) => v && set("flowerMode", v as RoleConfig["flowerMode"])}>
                  <SelectTrigger className="w-44">
                    <SelectValue>{(v: string) => (v === "fill" ? "Build (NECTAR + POLLEN)" : "Cap (NECTAR only)")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fill">Build (NECTAR + POLLEN)</SelectItem>
                    <SelectItem value="cap">Cap (NECTAR only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </>
      )}
      <Toggle label="Park in LOADING ZONE at the end" checked={role.park} onChange={(v) => set("park", v)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
