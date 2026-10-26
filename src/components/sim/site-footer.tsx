import { DISCUSSIONS, REPO_URL, TEAM } from "@/lib/seo";

const linkClass = "underline-offset-4 hover:text-foreground hover:underline";

/** Who made this and where people talk about it. Also gives search engines plain links to follow. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t pt-4 text-xs text-muted-foreground">
      <p>
        BIOBUZZ Strategy Lab is a free FTC BIOBUZZ strategy simulator built by {TEAM}. Not an official{" "}
        <i>FIRST</i> tool.
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <a className={linkClass} href={REPO_URL} target="_blank" rel="noopener">
          Source on GitHub
        </a>
        {DISCUSSIONS.map((d) => (
          <a key={d.url} className={linkClass} href={d.url} target="_blank" rel="noopener">
            Discuss on {d.name}
          </a>
        ))}
      </p>
    </footer>
  );
}
