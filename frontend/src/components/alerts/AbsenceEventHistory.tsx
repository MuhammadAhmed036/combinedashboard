"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, UserRound } from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { useAbsenceEvents } from "@/lib/hooks/useAlertRules";
import { formatDateTime } from "@/lib/formatters";
import type { AlertRuleV2 } from "@/lib/types";

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function AbsenceEventHistory({ rule }: { rule: AlertRuleV2 }) {
  const { data } = useAbsenceEvents(rule.alertId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const absentToday = data?.summary.absentSeconds ?? 0;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const presentToday = Math.max(0, Math.round((now - dayStart.getTime()) / 1000) - absentToday);
  const open = data?.events.find((event) => !event.endedAt);

  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-muted-foreground">Present Today</div><div className="font-medium">{duration(presentToday)}</div></div>
        <div><div className="text-muted-foreground">Absent Today</div><div className="font-medium">{duration(absentToday)}</div></div>
        <div><div className="text-muted-foreground">Events Today</div><div className="font-medium">{data?.summary.absenceEvents ?? 0}</div></div>
      </div>

      {open && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
          <Clock className="size-4 text-destructive" />
          <div className="min-w-0">
            <div className="font-medium text-destructive">ABSENT · {duration((now - Date.parse(open.startedAt)) / 1000)}</div>
            <div className="text-xs text-muted-foreground">Absent Since {formatDateTime(open.startedAt)}</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="size-3.5" /> Absence History</div>
        {(data?.events ?? []).map((event) => {
          const seconds = event.durationSeconds ?? Math.max(0, (now - Date.parse(event.startedAt)) / 1000);
          return (
            <div key={event.id} className="flex items-center gap-2 rounded-md border border-surface-border p-2">
              <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-black">
                {event.snapshotEventId ? <DetectionFrameImage eventId={event.snapshotEventId} alt="Absence snapshot" className="h-full w-full object-cover" /> : <UserRound className="m-3 size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-medium">{formatDateTime(event.startedAt)}{event.endedAt ? ` – ${formatDateTime(event.endedAt)}` : " – active"}</div>
                <div className="text-muted-foreground">{event.endedAt ? duration(seconds) : `ABSENT · ${duration(seconds)}`}</div>
              </div>
            </div>
          );
        })}
        {data?.events.length === 0 && <p className="text-xs text-muted-foreground">No absence events recorded yet.</p>}
      </div>
    </div>
  );
}
