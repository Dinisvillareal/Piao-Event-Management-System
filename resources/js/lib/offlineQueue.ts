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

export function getQueue(): QueuedAttendance[] {
  return readQueue();
}

export function queueAttendance(item: Omit<QueuedAttendance, "localId" | "queuedAt">): QueuedAttendance {
  const entry: QueuedAttendance = {
    ...item,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
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
 * Replays every queued scan against the server. Returns how many succeeded
 * vs. failed so the caller (ScanView) can show a sync summary toast.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAttendance[] = [];

  for (const item of queue) {
    try {
      await api.request({ url: item.endpoint, method: item.method, data: item.payload });
      synced++;
    } catch {
      failed++;
      remaining.push(item); // keep it queued, try again on the next reconnect
    }
  }

  writeQueue(remaining);
  return { synced, failed };
}
