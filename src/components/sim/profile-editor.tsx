"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { launchHeight, physicsReach } from "@/lib/sim/shooting";
import { PRESETS } from "@/lib/sim/strategies";
import type { Drivetrain, GameSettings, RobotProfile } from "@/lib/sim/types";
import { SliderRow, pct, secs } from "./slider-row";

export function ProfileEditor({
  profile,
  onChange,
}: {
  profile: RobotProfile;
  onChange: (p: RobotProfile) => void;
}) {
  const set = <K extends keyof RobotProfile>(k: K, v: RobotProfile[K]) => onChange({ ...profile, [k]: v });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(PRESETS).map(([name, p]) => (
          <Button key={name} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange({ ...p })}>
            {name}
          </Button>
        ))}
      </div>

      <Group title="Robot specs">
        <SliderRow
          label="Width"
          hint="Frame width, side to side. The starting size limit is 18 inches."
          value={profile.widthIn}
          min={10}
          max={18}
          step={0.5}
          format={(v) => `${v.toFixed(1)} in`}
          onChange={(v) => set("widthIn", v)}
        />
        <SliderRow
          label="Length"
          hint="Frame length, front to back. Bigger robots take more room in the LOADING ZONE and have to swing wider around the HIVE."
          value={profile.lengthIn}
          min={10}
          max={18}
          step={0.5}
          format={(v) => `${v.toFixed(1)} in`}
          onChange={(v) => set("lengthIn", v)}
        />
        <SliderRow
          label="Height when extended"
          hint="Tallest the robot gets with lifts and arms up. Robots start inside an 18 inch cube and can extend to 29 inches after the match starts (R105). Shots leave the launcher and climb steeply, so only a robot taller than the ball's path, pressed right against the front of a shooter, can block its shots. Matters most for defenders."
          value={profile.heightIn}
          min={12}
          max={29}
          step={1}
          format={(v) => `${v.toFixed(0)} in`}
          onChange={(v) => set("heightIn", v)}
        />
        <SliderRow
          label="Weight"
          hint="Heavier robots push lighter ones aside in a collision. A tank drive pushes harder than mecanum at the same weight."
          value={profile.weightLb}
          min={8}
          max={42}
          step={1}
          format={(v) => `${v.toFixed(0)} lb`}
          onChange={(v) => set("weightLb", v)}
        />
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Drivetrain</Label>
          <div className="flex gap-1.5">
            {(["mecanum", "tank", "swerve"] as Drivetrain[]).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={profile.drivetrain === d ? "default" : "outline"}
                className="h-7 flex-1 text-xs capitalize"
                onClick={() => set("drivetrain", d)}
              >
                {d}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tank pushes hardest, but it can only drive the way it points, so it turns before it moves. Mecanum and swerve can drive sideways and turn while
            they drive (mecanum is a bit slower sideways).
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-medium text-muted-foreground">Shooter on the back</Label>
          <Switch checked={profile.shooterOnBack} onCheckedChange={(v) => set("shooterOnBack", v)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          The nose mark is the front. Off (usual): the robot picks up and shoots from the front. On: the shooter faces backward, so the robot turns its back
          to the HIVE to shoot. Mecanum and swerve turn on the way there. A tank drive has to stop and turn.
        </p>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-medium text-muted-foreground">Shoot while driving</Label>
          <Switch
            checked={profile.shootOnTheMove}
            disabled={profile.drivetrain === "tank"}
            onCheckedChange={(v) => set("shootOnTheMove", v)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Advanced: the robot lines up and starts firing as soon as it&apos;s in range and pointed at the CELL, without stopping. Shots on the move are a little
          less accurate. Needs mecanum or swerve (it has to strafe while facing the HIVE).
        </p>
        <SliderRow
          label="Acceleration"
          hint="How quickly the robot gets up to speed. Slowing down and turning take longer than speeding up, because of the robot's momentum."
          value={profile.acceleration}
          min={2}
          max={20}
          step={0.5}
          format={(v) => `${v.toFixed(1)} ft/s²`}
          onChange={(v) => set("acceleration", v)}
        />
        <SliderRow
          label="Intake width"
          hint="How much of the front the intake covers. Robots drive over balls to pick them up, and any ball that goes into the intake comes in, so a full-width intake needs less lining up and scoops up neighbors too."
          value={profile.intakeWidth}
          min={0.25}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}% of front (${(v * profile.widthIn).toFixed(1)} in)`}
          onChange={(v) => set("intakeWidth", v)}
        />
        <SliderRow
          label="Carry capacity"
          hint="Elements the robot can hold at once. The rules cap this at 4 (G407). A smaller intake starts with the rest of its preload on the floor."
          value={profile.capacity}
          min={1}
          max={4}
          step={1}
          format={(v) => `${v.toFixed(0)} elements`}
          onChange={(v) => set("capacity", v)}
        />
        <SliderRow
          label="Shot speed"
          hint="How fast a launched element leaves the robot. The upward CELL opening is about 5 ft off the floor, so a ball needs about 15.5 ft/s just to get up there. Faster shots can score from farther away."
          value={profile.shotSpeed}
          min={14}
          max={40}
          step={1}
          format={(v) => {
            const reach = physicsReach(v, launchHeight(profile));
            return reach > 0 ? `${v.toFixed(0)} ft/s (reaches ${reach.toFixed(1)} ft)` : `${v.toFixed(0)} ft/s (can't reach)`;
          }}
          onChange={(v) => set("shotSpeed", v)}
        />
        <SliderRow
          label="Launcher height"
          hint="How high the ball leaves the launcher. A defender standing in front of you can knock down shots that are still low, so a higher launcher clears it sooner. It also means less climb to the CELL, so the same shot speed reaches a little farther."
          value={profile.launchHeightIn}
          min={8}
          max={28}
          step={0.5}
          format={(v) => `${v.toFixed(1)} in`}
          onChange={(v) => set("launchHeightIn", v)}
        />
      </Group>

      <Group title="Speed">
        <SliderRow
          label="Drive speed"
          hint="Top straight-line speed. Acceleration is set separately under Robot specs."
          value={profile.driveSpeed}
          min={1.5}
          max={10}
          step={0.25}
          format={(v) => `${v.toFixed(2)} ft/s`}
          onChange={(v) => set("driveSpeed", v)}
        />
        <SliderRow
          label="Intake time / element"
          hint="How long the rollers take to pull a ball in. Robots pick balls up on the run, but they can only drive over a ball as fast as the intake can swallow it (about 1 ft per intake time), so a quicker intake means less slowing down."
          value={profile.intakeTime}
          min={0.05}
          max={0.4}
          step={0.01}
          format={secs}
          onChange={(v) => set("intakeTime", v)}
        />
        <SliderRow
          label="Launch time / element"
          hint="Time between consecutive launches."
          value={profile.launchTime}
          min={0.05}
          max={2}
          step={0.05}
          format={secs}
          onChange={(v) => set("launchTime", v)}
        />
        <SliderRow
          label="Align / aim per trip"
          hint="Time lost each time the robot lines up to launch or to use a FLOWER. After that it fires its whole load at the launch-time pace. A bump while shooting costs a quick correction (a quarter of this) and makes the next shot a little less accurate."
          value={profile.alignTime}
          min={0}
          max={3}
          step={0.05}
          format={secs}
          onChange={(v) => set("alignTime", v)}
        />
        <SliderRow
          label="FLOWER place time / element"
          value={profile.flowerTime}
          min={0.3}
          max={5}
          step={0.1}
          format={secs}
          onChange={(v) => set("flowerTime", v)}
        />
        <SliderRow
          label="Launch range"
          hint="How far this launcher is built to shoot. Shot speed can cut that shorter. Shots only go in from in front of your upward CELL. Accuracy drops the farther away you shoot."
          value={profile.launchRange}
          min={2.5}
          max={10}
          step={0.25}
          format={(v) => `${v.toFixed(2)} ft`}
          onChange={(v) => set("launchRange", v)}
        />
      </Group>

      <Group title="Accuracy">
        <SliderRow
          label="POLLEN launch accuracy"
          hint="Chance a shot goes in from close range. At the robot's longest range it drops to half of this."
          value={profile.pollenAccuracy}
          min={0.2}
          max={1}
          step={0.01}
          format={pct}
          onChange={(v) => set("pollenAccuracy", v)}
        />
        <SliderRow
          label="NECTAR launch accuracy"
          value={profile.nectarAccuracy}
          min={0.2}
          max={1}
          step={0.01}
          format={pct}
          onChange={(v) => set("nectarAccuracy", v)}
        />
        <SliderRow
          label="FLOWER placement accuracy"
          value={profile.flowerAccuracy}
          min={0.2}
          max={1}
          step={0.01}
          format={pct}
          onChange={(v) => set("flowerAccuracy", v)}
        />
      </Group>

      <Group title="Autonomous">
        <SliderRow
          label="AUTO reliability"
          hint="Chance the AUTO routine runs. Otherwise the robot sits still (no LEAVE points)."
          value={profile.autoReliability}
          min={0}
          max={1}
          step={0.01}
          format={pct}
          onChange={(v) => set("autoReliability", v)}
        />
        <SliderRow
          label="AUTO speed vs TELEOP"
          value={profile.autoSpeed}
          min={0.2}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => set("autoSpeed", v)}
        />
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Park in LOADING ZONE at end of AUTO</Label>
          <Switch checked={profile.autoPark} onCheckedChange={(v) => set("autoPark", v)} />
        </div>
      </Group>
    </div>
  );
}

export function SettingsEditor({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
}) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="space-y-4">
      <Group title="HIVE">
        <SliderRow
          label="Tip threshold (POLLEN units)"
          hint="Field calibration: 7 POLLEN must not tip, 8 must. Default 7.5."
          value={settings.tipThreshold}
          min={4}
          max={12}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => set("tipThreshold", v)}
        />
        <SliderRow
          label="Tip threshold variance"
          hint="Random +/- on the threshold each tip, for field-to-field calibration differences."
          value={settings.tipVariance}
          min={0}
          max={1.5}
          step={0.05}
          format={(v) => `±${v.toFixed(2)}`}
          onChange={(v) => set("tipVariance", v)}
        />
        <SliderRow
          label="NECTAR weight (POLLEN units)"
          hint="Calibration: 3 NECTAR + 2 POLLEN must not tip, 3 NECTAR + 3 POLLEN must, which puts one NECTAR at 1.5 to 1.83 POLLEN."
          value={settings.nectarWeight}
          min={1}
          max={3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => set("nectarWeight", v)}
        />
      </Group>
      <Group title="FLOWER">
        <SliderRow
          label="Scoring volume capacity"
          hint="How many elements fit between the middle and top rings. Figure 10-5 in the manual shows about 7."
          value={settings.flowerCapacity}
          min={2}
          max={10}
          step={1}
          format={(v) => `${v} elements`}
          onChange={(v) => set("flowerCapacity", v)}
        />
      </Group>
      <Group title="Defense">
        <SliderRow
          label="Defense push effect"
          hint="While a defender is pressed against a robot, that robot drives and works this much slower, and its shots are this much less accurate. Heavier defenders push harder. Pins over 3 s are 20-point MAJOR FOULS (G421), so defenders back off in time."
          value={settings.defenseEffect}
          min={0}
          max={0.9}
          step={0.05}
          format={pct}
          onChange={(v) => set("defenseEffect", v)}
        />
        <SliderRow
          label="Blocked shot knocked down"
          hint="When a robot stands in a shot's path (tall enough and right in front of the launcher), the chance that shot gets knocked down. Shooters keep shooting through a defender, so this is how much a good blocker cuts their make rate."
          value={settings.blockChance}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => set("blockChance", v)}
        />
      </Group>
      <Group title="Ball physics">
        <SliderRow
          label="HIVE spin before it dumps"
          hint="How long the HIVE rotates before the elements fall out of a tipped CELL."
          value={settings.tipSpinTime}
          min={0.2}
          max={2.5}
          step={0.1}
          format={secs}
          onChange={(v) => set("tipSpinTime", v)}
        />
        <SliderRow
          label="CELL drop height"
          hint="Height elements fall from when a tipped CELL empties (the lowered CELL hangs about 2.5 to 4 ft up). Higher drops bounce and roll farther."
          value={settings.cellHeight}
          min={1}
          max={6}
          step={0.1}
          format={(v) => `${v.toFixed(1)} ft`}
          onChange={(v) => set("cellHeight", v)}
        />
        <SliderRow
          label="Tile friction"
          hint="How fast a rolling element slows down. Lower friction means longer chases."
          value={settings.ballFriction}
          min={0.5}
          max={8}
          step={0.1}
          format={(v) => `${v.toFixed(1)} ft/s²`}
          onChange={(v) => set("ballFriction", v)}
        />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h4>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
