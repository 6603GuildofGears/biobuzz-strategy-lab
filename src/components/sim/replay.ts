/** A request to watch exact matches from the Strategy showdown in the Match viewer. */
export interface ReplayMatch {
  redId: string;
  blueId: string;
  seed: number;
  /** The score the showdown recorded, so the viewer can confirm the replay is the same match. */
  redTotal: number;
  blueTotal: number;
}

export interface Replay {
  title: string;
  matches: ReplayMatch[];
  /** The slider settings version the showdown ran with. Replays only match if the sliders haven't changed since. */
  configVersion: number;
}
