/**
 * A background thread for the Strategy showdown. It receives a batch of scheduled matches, plays
 * them with the exact same code the Match viewer uses, and sends the scores back.
 */
import { playScheduledMatch, type ScheduledMatch, type ShowdownSetup } from "./tournament";

const worker = self as unknown as {
  onmessage: (e: MessageEvent<{ setup: ShowdownSetup; matches: ScheduledMatch[] }>) => void;
  postMessage: (message: unknown) => void;
};

worker.onmessage = (e) => {
  const { setup, matches } = e.data;
  worker.postMessage(matches.map((m) => playScheduledMatch(setup, m)));
};
