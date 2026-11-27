import React, { useEffect, useState } from "react";
import api from "../../../lib/api";
import { highlightMatches } from "../../../lib/highlight";
import { attendanceStatus } from "../../../lib/attendanceStatus";
import { useVisiblePoll } from "../../../hooks/useLiveFeeds";
import DashboardView from "../views/DashboardView";
import QRCodesView from "../views/QRCodesView";
import AttendanceView, { AttendanceRecord } from "../views/AttendanceView";
import EventsView, { AbsenceEntry } from "../views/EventsView";
import NotificationsView from "../views/NotificationsView";

export type MemberModuleTab = "dashboard" | "qr" | "attendance" | "events" | "notify";

interface MemberModulesProps {
  active: MemberModuleTab;
  onNavigate?: (tab: MemberModuleTab) => void;
  member: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    user_code: string;
  };
  allEvents: any[];
  allMemberships: any[];
  externalState?: {
    userMemberships: any[];
    attendanceRecords: AttendanceRecord[];
    attendanceLoading?: boolean;
    eventsLoading?: boolean;
    focusEventId?: number | null;
    onFocusHandled?: () => void;
  };
  embedded?: boolean;
}

const highlightText = (text: string, query: string) => highlightMatches(text, query);

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/60 p-6 text-white">
          <p className="font-bold text-red-300">Member Dashboard Error:</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-100">
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MemberModules({
  active,
  onNavigate,
  member,
  allEvents = [],
  allMemberships = [],
  externalState,
  embedded = false,
}: MemberModulesProps) {
  const [internalMemberships, setInternalMemberships] = useState<any[]>([]);
  const [internalAttendance, setInternalAttendance] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [myFeedback, setMyFeedback] = useState<any[]>([]);
  const [myAbsences, setMyAbsences] = useState<AbsenceEntry[]>([]);
  const [feedbackRules, setFeedbackRules] = useState({
    close_after_hours: 12,
    edit_window_minutes: 30,
  });

  useEffect(() => {
    if (active !== "dashboard") return;
    api
      .get("/notifications")
      .then((res) => {
        const list = res.data?.data || res.data || [];
        setNotifications(
          Array.isArray(list)
            ? list.map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.message || n.body,
                created_at: n.created_at,
                is_updated: Boolean(n.is_updated),
                read: Boolean(n.read),
              }))
            : []
        );
      })
      .catch(() => {});
  }, [active]);

  const userMemberships = externalState?.userMemberships ?? internalMemberships;
  const attendanceRecords = externalState?.attendanceRecords ?? internalAttendance;

  useEffect(() => {
    if (!member?.id || externalState) return;

    api
      .get(`/membership-residents/${member.id}`, { params: { per_page: 100 } })
      .then((res) =>
        setInternalMemberships(Array.isArray(res.data?.memberships) ? res.data.memberships : [])
      )
      .catch(() => {});

    const cacheKey = `attendance_cache_${member.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setInternalAttendance(JSON.parse(cached).records ?? []);
      } catch {}
    }

    api
      .get(`/attendance/${member.id}`)
      .then((res) => {
        if (!Array.isArray(res.data)) return;
        const records: AttendanceRecord[] = res.data.map((item: any) => ({
          id: item.id,
          eventId: item.eventId,
          eventTitle: item.eventTitle ?? "—",
          eventDate: item.eventDate ?? "",
          eventEnd: item.eventEnd ?? "",
          location: item.location ?? "—",
          timeIn: item.timeIn ?? "",
          timeOut: item.timeOut ?? "",
          status:
            !item.timeIn && !item.timeOut
              ? "missed"
              : item.status?.toLowerCase() ?? "incomplete",
        }));
        setInternalAttendance(records);
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            records,
            attended: records.filter((r) => r.status === "complete").length,
            missed: records.filter((r) => attendanceStatus(r) === "missed").length,
          })
        );
      })
      .catch(() => {});
  }, [member?.id, externalState]);

  const loadFeedbackData = React.useCallback(() => {
    if (!member?.id) return;
    api
      .get("/feedback/mine")
      .then((res) =>
        setMyFeedback(
          Array.isArray(res.data)
            ? res.data.map((f: any) => ({
                ...f,
                edit_until: Date.now() + (Number(f.edit_seconds_left) || 0) * 1000,
              }))
            : []
        )
      )
      .catch(() => {});

    api
      .get("/feedback/absence/mine")
      .then((res) =>
        setMyAbsences(
          Array.isArray(res.data)
            ? res.data.map((r: any) => ({
                ...r,
                edit_until: Date.now() + (Number(r.edit_seconds_left) || 0) * 1000,
              }))
            : []
        )
      )
      .catch(() => {});

    api
      .get("/settings/feedback-rules")
      .then((res) => {
        if (res.data?.close_after_hours) setFeedbackRules(res.data);
      })
      .catch(() => {});
  }, [member?.id]);

  useEffect(() => {
    loadFeedbackData();
  }, [loadFeedbackData, active]);

  useVisiblePoll(loadFeedbackData, 30000, active === "events" && !!member?.id);

  if (!member?.id) return null;

  const now = new Date();
  const safeEvents = Array.isArray(allEvents) ? allEvents : [];
  const safeMemberships = Array.isArray(userMemberships) ? userMemberships : [];
  const safeAttendance = Array.isArray(attendanceRecords) ? attendanceRecords : [];
  const safeNotifications = Array.isArray(notifications) ? notifications : [];

  const upcomingEvents = safeEvents.filter((e) => new Date(e.event_start ?? e.date) >= now);
  const pastEventsCount = safeEvents.filter((e) => new Date(e.event_start ?? e.date) < now).length;
  const attendedCount = safeAttendance.filter((r) => r.status === "complete").length;
  const missedCount = safeAttendance.filter((r) => attendanceStatus(r) === "missed").length;

  return (
    <div
      data-theme={embedded ? "dark" : undefined}
      className={
        embedded
          ? "embedded-member-area -m-3 sm:-m-6 min-h-[calc(100%+1.5rem)] sm:min-h-[calc(100%+3rem)] bg-[#0A0E1A] p-4 sm:p-6 text-white"
          : ""
      }
    >
      {embedded && (
        <style>{`
          .embedded-member-area .dash-canvas {
            background-color: #0A0E1A !important;
            height: auto !important;
            min-height: calc(100dvh - 73px);
            overflow-y: visible !important;
            padding: 0 !important;
          }
          .embedded-member-area .dash-card {
            background-color: #161F33 !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: none !important;
          }
          .embedded-member-area .dash-tile {
            background-color: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
          }
        `}</style>
      )}

      {active === "dashboard" && (
        <DashboardErrorBoundary>
          <DashboardView
            memberName={member.first_name || ""}
            fullName={member.name || ""}
            userId={member.id}
            userCode={member.user_code || ""}
            membershipsCount={safeMemberships.length}
            attendedCount={attendedCount}
            missedCount={missedCount}
            attendanceRecords={safeAttendance}
            setActive={(page) => {
              if (page === "settings") return;
              onNavigate?.(page as MemberModuleTab);
            }}
            notifications={safeNotifications}
            upcomingEvents={upcomingEvents}
            pastEventsCount={pastEventsCount}
            highlightText={highlightText}
          />
        </DashboardErrorBoundary>
      )}

      {active === "qr" && (
        <QRCodesView
          highlightText={highlightText}
          userId={String(member.id)}
          userCode={member.user_code}
          fullName={member.name}
        />
      )}

      {active === "attendance" && (
        <AttendanceView
          attendanceRecords={safeAttendance}
          memberId={String(member.id)}
          highlightText={highlightText}
          allEvents={safeEvents}
          userMemberships={safeMemberships}
          loading={externalState?.attendanceLoading}
        />
      )}

      {active === "events" && (
        <EventsView
          allEvents={safeEvents}
          highlightText={highlightText}
          allMemberships={allMemberships}
          userMemberships={safeMemberships}
          attendanceRecords={safeAttendance}
          myFeedback={myFeedback}
          myAbsences={myAbsences}
          member={member}
          feedbackRules={feedbackRules}
          loading={externalState?.eventsLoading}
          focusEventId={externalState?.focusEventId}
          onFocusHandled={externalState?.onFocusHandled}
          onAbsenceSubmitted={(entry) =>
            setMyAbsences((prev) => [
              ...prev.filter((r) => r.event_id !== entry.event_id),
              entry,
            ])
          }
          onFeedbackSubmitted={(entry) => {
            setMyFeedback((prev) => {
              const rest = prev.filter((f) => f.event_id !== entry.event_id);
              return (entry as any).deleted_at ? rest : [...rest, entry];
            });
          }}
        />
      )}

      {active === "notify" && (
        <NotificationsView highlightText={highlightText} />
      )}
    </div>
  );
}

// Inside resources/js/pages/staff/MemberModules.tsx (or wherever MemberModules lives)
export function EmbeddedMemberOverview({
  user,
  onNavigate,
}: {
  user?: { name?: string; email?: string; resident_id?: number | null };
  onNavigate?: (view: string) => void;
}) {
  return (
    <div className="space-y-6 p-4 text-white">
      <div className="rounded-xl border border-white/10 bg-[#0F1629] p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
          Personal Member Portal
        </p>
        <h2 className="mt-1 text-2xl font-bold">
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Quick access to your personal barangay QR pass, event attendance, and upcoming community schedules.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onNavigate?.('member-qr')}
            className="rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
          >
            <div className="text-sm font-semibold text-white">My Digital QR ID</div>
            <div className="mt-1 text-xs text-slate-400">View &amp; present your check-in pass</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('member-attendance')}
            className="rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
          >
            <div className="text-sm font-semibold text-white">My Attendance</div>
            <div className="mt-1 text-xs text-slate-400">Check your verified event logs</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('member-events')}
            className="rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
          >
            <div className="text-sm font-semibold text-white">Community Events</div>
            <div className="mt-1 text-xs text-slate-400">Browse schedules &amp; submit feedback</div>
          </button>
        </div>
      </div>
    </div>
  );
}