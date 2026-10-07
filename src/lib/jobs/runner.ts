/**
 * Job runner: records every run in `job_runs`, isolates per-item failures,
 * and buffers provider request logs into `provider_requests`.
 * A failure in one symbol/provider never aborts the rest of the job.
 */
import { errorClassOf, isProviderError } from "@/lib/providers/errors";
import type { ProviderRequestLog, ProviderRequestLogger } from "@/lib/providers/interfaces";

export type JobTrigger = "cron" | "manual" | "chained";
export type JobStatus = "success" | "partial" | "failed" | "skipped";

export interface JobFailure {
  item: string;
  provider: string | null;
  errorClass: string;
  message: string;
}

export interface JobSummary {
  runId: string;
  jobName: string;
  status: JobStatus;
  recordsUpdated: number;
  itemsTotal: number | null;
  itemsFailed: number;
  failures: JobFailure[];
  providerStats: Record<string, { calls: number; failures: number; byError: Record<string, number> }>;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface JobStore {
  createRun(jobName: string, trigger: JobTrigger, triggeredBy: string | null): Promise<string>;
  finishRun(summary: JobSummary): Promise<void>;
  insertProviderRequests(runId: string, logs: ProviderRequestLog[]): Promise<void>;
}

export interface JobContext {
  runId: string;
  logger: ProviderRequestLogger;
  recordFailure(item: string, err: unknown): void;
  addRecords(n: number): void;
  setItemsTotal(n: number): void;
  /** Run fn over items with bounded concurrency; failures are recorded, never thrown. */
  forEachIsolated<T>(items: T[], concurrency: number, label: (t: T) => string, fn: (t: T) => Promise<void>): Promise<void>;
}

const MAX_FAILURES_STORED = 200;
const LOG_FLUSH_SIZE = 200;

export async function runJob(
  jobName: string,
  fn: (ctx: JobContext) => Promise<void>,
  opts: { store: JobStore; trigger?: JobTrigger; triggeredBy?: string | null; now?: () => Date },
): Promise<JobSummary> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = await opts.store.createRun(jobName, opts.trigger ?? "cron", opts.triggeredBy ?? null);

  let records = 0;
  let itemsTotal: number | null = null;
  const failures: JobFailure[] = [];
  let failedCount = 0;
  const stats: JobSummary["providerStats"] = {};
  let buffer: ProviderRequestLog[] = [];
  let flushing: Promise<void> = Promise.resolve();

  const flush = () => {
    if (!buffer.length) return flushing;
    const batch = buffer;
    buffer = [];
    flushing = flushing.then(() => opts.store.insertProviderRequests(runId, batch).catch((e) => console.error("[jobs] provider log flush failed", e)));
    return flushing;
  };

  const logger: ProviderRequestLogger = (entry) => {
    const s = (stats[entry.provider] ??= { calls: 0, failures: 0, byError: {} });
    s.calls++;
    if (!entry.ok) {
      s.failures++;
      const k = entry.errorClass ?? "unknown";
      s.byError[k] = (s.byError[k] ?? 0) + 1;
    }
    buffer.push(entry);
    if (buffer.length >= LOG_FLUSH_SIZE) void flush();
  };

  const ctx: JobContext = {
    runId,
    logger,
    recordFailure(item, err) {
      failedCount++;
      if (failures.length < MAX_FAILURES_STORED) {
        failures.push({
          item,
          provider: isProviderError(err) ? err.provider : null,
          errorClass: errorClassOf(err),
          message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        });
      }
    },
    addRecords(n) {
      records += n;
    },
    setItemsTotal(n) {
      itemsTotal = n;
    },
    async forEachIsolated(items, concurrency, label, work) {
      let idx = 0;
      const worker = async () => {
        while (idx < items.length) {
          const item = items[idx++];
          try {
            await work(item);
          } catch (e) {
            ctx.recordFailure(label(item), e);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
    },
  };

  let fatal: string | null = null;
  try {
    await fn(ctx);
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
    console.error(`[jobs] ${jobName} failed`, e);
  }
  await flush();

  let status: JobStatus;
  if (fatal) status = "failed";
  else if (failedCount === 0) status = "success";
  else if (itemsTotal !== null && failedCount >= itemsTotal) status = "failed";
  else status = "partial";

  const summary: JobSummary = {
    runId,
    jobName,
    status,
    recordsUpdated: records,
    itemsTotal,
    itemsFailed: failedCount,
    failures,
    providerStats: stats,
    error: fatal,
    startedAt,
    finishedAt: now().toISOString(),
  };
  await opts.store.finishRun(summary);
  return summary;
}
