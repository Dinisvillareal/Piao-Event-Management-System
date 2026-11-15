import api from "./api";

/**
 * Adviser recommendation: "Piao has slow/limited connectivity — include
 * offline functionality too." QR check-in (ScanView) is the one action that
 * absolutely cannot wait for connectivity to come back during a live event,
 * so time-in/time-out attempts made while offline (or that fail on a flaky
 * connection) are queued here and replayed automatically once the browser
 * reports it's back online.
 */

export type QueuedAttendance = {
  localId: string;
  endpoint: "/attendance/time-in" | "/attendance/time-out";
  method: "POST" | "PUT";
  payload: { event_id: string | number; user_id: string | number };
  residentName: string;
  queuedAt: string;
};

const STORAGE_KEY = "piao_offline_attendance_queue";
const REJECTED_KEY = "piao_offline_attendance_rejected";

/** A queued scan the server refused for good, kept until someone has read it (so it never vanishes silently). */
export type RejectedScan = {
  localId: string;
  residentName: string;
  endpoint: QueuedAttendance["endpoint"];
  queuedAt: string;
  reason: string;
};

export type FailureKind = "retry" | "already-recorded" | "rejected";

/**
 * What a failed replay means.
 *  - no response at all (network), 401/419 (session expired), 408/425/429 and any 5xx are temporary:
 *    the scan is kept and tried again later -- the server never judged it.
 *  - the server's own "already signed in/out" (code already_recorded) means an earlier attempt landed:
 *    the attendance IS recorded, so it is done, not lost.
 *  - any other answer (not eligible, window was closed at scan time, bad time) is final.
 */
export function classifyFailure(status: number | undefined, code?: string): FailureKind {
  if (status === undefined) return "retry";
  if (code === "already_recorded") return "already-recorded";
  if (status === 401 || status === 408 || status === 419 || status === 425 || status === 429 || status >= 500) return "retry";
  return "rejected";
}

function readQueue(): QueuedAttendance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAttendance[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable (private mode, quota) — silently no-op, the scan
    // itself already happened locally, we just lose the retry-on-reconnect.
  }
}

function readRejected(): RejectedScan[] {
  try {
    const raw = localStorage.getItem(REJECTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getRejected(): RejectedScan[] {
  return readRejected();
}

export function clearRejected() {
  try {
    localStorage.removeItem(REJECTED_KEY);
  } catch {
    // storage unavailable -- nothing to clear
  }
}

function addRejected(items: RejectedScan[]) {
  if (items.length === 0) return;
  try {
    localStorage.setItem(REJECTED_KEY, JSON.stringify([...readRejected(), ...items].slice(-50)));
  } catch {
    // storage unavailable -- the banner's one-off count still tells staff
  }
}

export function getQueue(): QueuedAttendance[] {
  return readQueue();
}

export function queueAttendance(item: Omit<QueuedAttendance, "localId" | "queuedAt"> & { scannedAt?: Date }): QueuedAttendance {
  const { scannedAt, ...rest } = item;
  const entry: QueuedAttendance = {
    ...rest,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    // The moment the QR was scanned (not the moment the failed request gave up), so a slow timeout
    // cannot push a scan made just inside the window to just outside it.
    queuedAt: (scannedAt ?? new Date()).toISOString(),
  };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function queueLength(): number {
  return readQueue().length;
}

/**
 * Replays every queued scan against the server, sending the time each one was TAKEN (scanned_at) so the
 * server checks the sign-in/out window against that moment and records it -- not the moment the phone got
 * signal back. Returns how many were recorded (including ones an earlier attempt had already landed), how
 * many are still waiting for a better connection, and how many the server refused for good. Refused scans
 * are kept in a separate list (getRejected) until someone reads and dismisses them.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number; rejected: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, rejected: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAttendance[] = [];
  const rejectedNow: RejectedScan[] = [];

  for (const item of queue) {
    try {
      await api.request({ url: item.endpoint, method: item.method, data: { ...item.payload, scanned_at: item.queuedAt } });
      synced++;
    } catch (error: any) {
      const kind = classifyFailure(error?.response?.status, error?.response?.data?.code);
      if (kind === "already-recorded") {
        synced++;
      } else if (kind === "retry") {
        failed++;
        remaining.push(item); // keep it queued, try again on the next reconnect
      } else {
        rejectedNow.push({
          localId: item.localId,
          residentName: item.residentName,
          endpoint: item.endpoint,
          queuedAt: item.queuedAt,
          reason: String(error?.response?.data?.message || ""),
        });
      }
    }
  }

  writeQueue(remaining);
  addRejected(rejectedNow);
  return { synced, failed, rejected: rejectedNow.length };
}
