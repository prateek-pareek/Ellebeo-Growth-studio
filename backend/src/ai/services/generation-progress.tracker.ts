// ============================================================================
// generation-progress.tracker.ts — In-process live progress store
// The persisted JobState (Prisma enum) only has coarse checkpoints, and the
// orchestrator spends most of its wall-clock time (image/carousel/story/reel
// generation) inside the single 'generating_text' -> 'completed' transition
// with no state change in between.
//
// Rather than stamping a fixed percent/eta at each checkpoint (which stays
// frozen for however long that step actually takes — the previous design,
// and the reason the countdown used to visibly oscillate/stall), this tracker
// stores only a job's start time + total duration estimate + the highest
// structural checkpoint reached so far. Percent and ETA are then *computed
// fresh on every read* from real elapsed wall-clock time, so both values
// change every second on their own and are guaranteed monotonic for the
// lifetime of a single job: elapsed time only grows, the total estimate is
// fixed at job start, and the checkpoint floor only ever increases.
// ============================================================================

export interface GenerationProgressMeta {
  jobStart: number;
  totalEstimatedSeconds: number;
  step: string;
  checkpointFloorPercent: number;
  updatedAt: number;
}

export interface GenerationProgressSnapshot {
  percent: number;
  step: string;
  estimatedSecondsRemaining: number;
}

const STALE_ENTRY_MS = 30 * 60 * 1000; // 30 minutes

const store = new Map<string, GenerationProgressMeta>();

function sweep() {
  const cutoff = Date.now() - STALE_ENTRY_MS;
  for (const [jobId, meta] of store) {
    if (meta.updatedAt < cutoff) store.delete(jobId);
  }
}

export const GenerationProgressTracker = {
  // Called once, right when a job starts processing.
  init(jobId: string, totalEstimatedSeconds: number, initialStep: string): void {
    const now = Date.now();
    store.set(jobId, {
      jobStart: now,
      totalEstimatedSeconds: Math.max(1, totalEstimatedSeconds),
      step: initialStep,
      checkpointFloorPercent: 0,
      updatedAt: now,
    });
    if (store.size % 50 === 0) sweep();
  },

  // Called at each real structural checkpoint. Updates the human-readable
  // step text and raises the structural floor (never lowers it — a step
  // reported out of order, or a stray earlier call, can't walk the floor
  // backwards).
  setStep(jobId: string, step: string, checkpointFloorPercent: number): void {
    const meta = store.get(jobId);
    if (!meta) return; // init() was never called for this job (e.g. tweak jobs) — nothing to track
    meta.step = step;
    meta.checkpointFloorPercent = Math.max(meta.checkpointFloorPercent, checkpointFloorPercent);
    meta.updatedAt = Date.now();
  },

  // Computes the current percent/step/eta from real elapsed time. Safe to
  // call as often as needed (every REST poll, every socket emit) — it's a
  // pure read, not a state mutation, so concurrent readers always agree.
  getLive(jobId: string): GenerationProgressSnapshot | undefined {
    const meta = store.get(jobId);
    if (!meta) return undefined;

    const elapsedSeconds = (Date.now() - meta.jobStart) / 1000;
    const timeBasedPercent = Math.min(97, Math.max(0, Math.round((elapsedSeconds / meta.totalEstimatedSeconds) * 100)));
    const percent = Math.max(meta.checkpointFloorPercent, timeBasedPercent);
    const estimatedSecondsRemaining = percent >= 100
      ? 0
      : Math.max(2, Math.round(meta.totalEstimatedSeconds - elapsedSeconds));

    return { percent, step: meta.step, estimatedSecondsRemaining };
  },

  clear(jobId: string): void {
    store.delete(jobId);
  },
};
