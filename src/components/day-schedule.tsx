"use client";

import { useEffect, useState } from "react";
import { BookCheck, NotebookPen } from "lucide-react";
import { fmtShort } from "@/lib/time";
import { noteText } from "@/lib/lesson-note";
import { nowMinMsk, pickHighlight, shortName, toMin } from "@/lib/schedule-utils";
import type { DayItem, NextLesson } from "@/lib/schedule";
import { LessonDialog } from "./lesson-dialog";

/**
 * Расписание дня одним списком. Изменения показаны прямо в строке пары:
 * отмена — зачёркнута, перенос — старое время зачёркнуто и новое рядом, смена аудитории — старая зачёркнута.
 * live — сегодняшний день: подсвечивается идущая пара, а в перерыве и до начала дня — ближайшая следующая
 * (в 9:00 — первая, в 10:22 — вторая). Время обновляется раз в 30 секунд без перезагрузки страницы.
 * Нажатие на пару открывает окно: преподаватель, аудитория на карте МГИМО, домашнее задание.
 */
export function DaySchedule({ items, live = false, next = {} }: { items: DayItem[]; live?: boolean; next?: Record<number, NextLesson> }) {
  const [nowMin, setNowMin] = useState<number | null>(null);
  // храним ключ, а не саму пару: после сохранения ДЗ страница получает свежие данные — окно показывает их
  const [openKey, setOpenKey] = useState<string | null>(null);
  const keyOf = (i: DayItem) => `${i.lesson.id}-${i.movedAway}`;
  const open = items.find((i) => keyOf(i) === openKey) ?? null;
  useEffect(() => {
    if (!live) return;
    const tick = () => setNowMin(nowMinMsk());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [live]);

  const marked = items.map((i) => ({ ...i, off: i.movedAway || i.lesson.change === "CANCELLED" }));
  const hl = nowMin != null ? pickHighlight(marked, nowMin) : { current: undefined, upcoming: undefined };
  const current = hl.current && items[marked.indexOf(hl.current)];
  const upcoming = hl.upcoming && items[marked.indexOf(hl.upcoming)];

  if (items.length === 0) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Пар нет</p>;

  return (
    <>
      <ol className="divide-y rounded-lg border">
        {items.map((it) => {
          const l = it.lesson;
          const off = it.movedAway || l.change === "CANCELLED";
          const past = nowMin != null && toMin(it.end) <= nowMin;
          const isCur = it === current;
          const isNext = it === upcoming;
          const mins = isNext && nowMin != null ? toMin(it.time) - nowMin : 0;
          const hw = l.homework[0];
          return (
            <li key={keyOf(it)} className={`relative ${isCur || isNext ? "bg-secondary" : ""} ${past && !isCur ? "opacity-55" : ""}`} aria-current={isCur ? "time" : undefined}>
              {(isCur || isNext) && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-navy" />}
              <button type="button" onClick={() => setOpenKey(keyOf(it))} className="grid w-full grid-cols-[64px_1fr] gap-3 p-3 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-navy sm:p-4"
                aria-label={`${l.discipline}, ${it.time}. Открыть: преподаватель, аудитория, домашнее задание`}>
                <div className="text-sm leading-tight">
                  <div className={`font-bold ${off ? "text-muted-foreground line-through" : "text-brand-blue"}`}>{it.time}</div>
                  <div className={`text-muted-foreground ${off ? "line-through" : ""}`}>{it.end}</div>
                  {l.change === "MOVED" && !it.movedAway && l.prevStart && <div className="mt-1 text-xs text-muted-foreground line-through">{l.prevStart}</div>}
                </div>
                <div className="min-w-0">
                  {isCur && <p className="text-xs font-bold uppercase tracking-wide text-navy">Идёт сейчас</p>}
                  {isNext && <p className="text-xs font-bold uppercase tracking-wide text-navy">Следующая · {mins < 60 ? `через ${mins} мин` : `в ${it.time}`}</p>}
                  <h3 className={`font-semibold ${off ? "text-muted-foreground line-through" : "text-navy"}`}>{l.discipline}</h3>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{l.kind} · </span>
                    {l.change === "ROOM" && l.prevAuditorium ? (
                      <>ауд. <s className="text-muted-foreground">{l.prevAuditorium}</s> <b className="text-brand-red">{l.auditorium}</b></>
                    ) : (
                      <span className={off ? "line-through" : ""}>ауд. <b>{l.auditorium}</b></span>
                    )}
                    <span className="text-muted-foreground"> · {l.building}</span>
                  </p>
                  {l.teacher && <p className="truncate text-sm text-muted-foreground">{shortName(l.teacher.name)}</p>}
                  {hw && (
                    <p className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-semibold ${hw.done ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>
                      {hw.done ? <BookCheck className="size-3.5 shrink-0" aria-hidden /> : <NotebookPen className="size-3.5 shrink-0" aria-hidden />}
                      <span className="truncate">{hw.done ? "ДЗ сделано" : `ДЗ: ${hw.text}`}</span>
                    </p>
                  )}
                  {l.change !== "NONE" && (
                    <p className="mt-1 text-sm font-medium text-brand-red">
                      {l.change === "CANCELLED" && "Отменена. "}
                      {it.movedAway && `Перенесена на ${fmtShort(l.date)}, ${l.start}. `}
                      {l.change === "MOVED" && !it.movedAway && l.prevDate && `Перенесена с ${fmtShort(l.prevDate)}. `}
                      {l.change === "ROOM" && "Смена аудитории. "}
                      <span className="font-normal">{noteText(l.changeNote)}</span>
                    </p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      {open && <LessonDialog item={open} next={next[open.lesson.id] ?? null} onClose={() => setOpenKey(null)} />}
    </>
  );
}
