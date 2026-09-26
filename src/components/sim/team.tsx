import Image from "next/image";
import { cn } from "@/lib/utils";

/** The team that built the simulator. The logo is the team's GitHub avatar, saved in public/. */
export const TEAM = {
  name: "6603 Guild of Gears",
  url: "https://github.com/6603GuildofGears",
  logo: `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")}/guild-of-gears.png`,
};

export function TeamLogo({ className }: { className?: string }) {
  return <Image src={TEAM.logo} alt="" width={80} height={80} className={cn("shrink-0 object-contain", className)} />;
}

/** "by 6603 Guild of Gears" with the team logo, linking to the team's GitHub. */
export function TeamByline({ className }: { className?: string }) {
  return (
    <a
      href={TEAM.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`By ${TEAM.name} (GitHub)`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2.5 pl-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <TeamLogo className="size-5" />
      by <span className="font-medium text-foreground">{TEAM.name}</span>
    </a>
  );
}
