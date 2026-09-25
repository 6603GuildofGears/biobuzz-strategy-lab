import { runTournament, scheduleMatches, summarize, type PlayedMatch, type TournamentInput, type TournamentResult } from "./tournament";

/**
 * Runs the Strategy showdown on several threads at once (Web Workers), one per spare CPU core.
 * Every match has its own seed from the schedule, so the result is identical to running it on one thread.
 */

/** Matches handed to a thread at a time. Small batches keep every thread busy until the end. */
const BATCH_SIZE = 8;
const MAX_THREADS = 8;

/** Leave one core free so the page stays smooth. */
export const threadCount = () =>
  typeof navigator === "undefined" ? 1 : Math.max(1, Math.min(MAX_THREADS, (navigator.hardwareConcurrency || 2) - 1));

export function runTournamentParallel(
  input: TournamentInput,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<TournamentResult | null> {
  if (typeof Worker === "undefined") return runTournament(input, onProgress, shouldCancel);

  const schedule = scheduleMatches(input);
  const batches: (typeof schedule)[] = [];
  for (let i = 0; i < schedule.length; i += BATCH_SIZE) batches.push(schedule.slice(i, i + BATCH_SIZE));
  const setup = { strategies: input.strategies, profiles: input.profiles, settings: input.settings };

  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const played: PlayedMatch[] = [];
    let nextBatch = 0;
    let batchesDone = 0;
    let finished = false;
    const finish = (result: TournamentResult | null, error?: Error) => {
      if (finished) return;
      finished = true;
      for (const w of workers) w.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const giveWork = (w: Worker) => {
      if (shouldCancel?.()) return finish(null);
      if (nextBatch < batches.length) w.postMessage({ setup, matches: batches[nextBatch++] });
    };

    for (let t = 0; t < Math.min(threadCount(), batches.length); t++) {
      const w = new Worker(new URL("./showdown-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<PlayedMatch[]>) => {
        played.push(...e.data);
        batchesDone++;
        onProgress?.(played.length, schedule.length);
        if (batchesDone === batches.length) finish(summarize(input, played));
        else giveWork(w);
      };
      w.onerror = (e) => finish(null, new Error(e.message || "A simulation thread failed"));
      workers.push(w);
      giveWork(w);
    }
  });
}
