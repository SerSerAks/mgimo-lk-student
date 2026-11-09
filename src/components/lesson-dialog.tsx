"use client";

import { useActionState, useEffect, useRef } from "react";
import { BookCheck, ExternalLink, MapPin, UserRound, X } from "lucide-react";
import { saveHomework, toggleHomeworkDone, type HwState } from "@/app/actions/homework";
import { fmtShort } from "@/lib/time";
import { mapLink } from "@/lib/schedule-utils";
import type { DayItem, NextLesson } from "@/lib/schedule";
import { Button } from "@/components/ui/button";

/**
 * Окно пары: предмет, полное ФИО преподавателя, аудитория со ссылкой на официальную карту МГИМО,
 * домашнее задание НА эту пару и поле «задать к следующей паре». ДЗ хранится в учётке — видно на любом устройстве.
 * Нативный <dialog>: фокус внутри окна, Esc закрывает, фон затемнён.
 */
export function LessonDialog({ item, next, onClose }: { item: DayItem; next: NextLesson | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<HwState, FormData>(saveHomework, undefined);
  const l = item.lesson;
  const hw = l.homework[0];
  const map = mapLink(l.auditorium, l.building);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg p-0 text-foreground shadow-xl backdrop:bg-navy/40" aria-labelledby="lesson-title">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{l.kind} · {fmtShort(item.movedAway ? (l.prevDate ?? l.date) : l.date)}, {item.time}–{item.end}</p>
            <h2 id="lesson-title" className="text-lg font-bold text-navy">{l.discipline}</h2>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-sm hover:bg-muted" aria-label="Закрыть"><X className="size-5" aria-hidden /></button>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <UserRound className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
            <div><dt className="sr-only">Преподаватель</dt><dd><b className="text-navy">{l.teacher?.name ?? "Преподаватель не указан"}</b>{l.teacher?.title && <span className="block text-muted-foreground">{l.teacher.title}</span>}</dd></div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
            <div className="min-w-0">
              <dt className="sr-only">Аудитория</dt>
              <dd>ауд. <b>{l.auditorium}</b> · {l.building}{l.change === "ROOM" && l.prevAuditorium && <span className="text-brand-red"> (была {l.prevAuditorium})</span>}</dd>
              {map
                ? <a href={map} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-blue underline-offset-2 hover:underline">Найти на карте МГИМО <ExternalLink className="size-3.5" aria-hidden /></a>
                : /виртуал/i.test(l.building) && <p className="text-muted-foreground">Занятие дистанционно — ссылку даст преподаватель.</p>}
            </div>
          </div>
        </dl>

        {hw && (
          <section className={`rounded-lg border p-3 ${hw.done ? "border-status-ok/40 bg-status-ok/5" : "border-status-warn/40 bg-status-warn/5"}`} aria-labelledby="hw-now">
            <h3 id="hw-now" className="text-xs font-semibold uppercase tracking-wide text-navy">Задано на эту пару</h3>
            <p className={`mt-1 whitespace-pre-line text-sm ${hw.done ? "text-muted-foreground line-through" : ""}`}>{hw.text}</p>
            <form action={toggleHomeworkDone} className="mt-2">
              <input type="hidden" name="lessonId" value={l.id} />
              <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-sm border bg-background px-3 text-sm font-semibold">
                <BookCheck className="size-4" aria-hidden />{hw.done ? "Вернуть в невыполненные" : "Отметить сделанным"}
              </button>
            </form>
          </section>
        )}

        <section aria-labelledby="hw-next" className="space-y-2">
          <h3 id="hw-next" className="text-xs font-semibold uppercase tracking-wide text-navy">Домашнее задание к следующей паре</h3>
          {next ? (
            <form action={action} className="space-y-2" key={next.homework ?? "empty"}>
              <input type="hidden" name="fromLessonId" value={l.id} />
              <p className="text-sm text-muted-foreground">Появится на паре <b className="text-foreground">{fmtShort(next.date)}, {next.start}</b>.</p>
              <label htmlFor="hw-text" className="sr-only">Текст задания</label>
              <textarea id="hw-text" name="text" defaultValue={next.homework ?? ""} maxLength={1000} rows={3} placeholder="Например: прочитать главу 3, решить задачи 1–5"
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm" />
              {state?.error && <p role="alert" className="text-sm text-brand-red">{state.error}</p>}
              {state?.ok && <p role="status" className="text-sm font-semibold text-status-ok">{state.ok}</p>}
              <Button type="submit" className="h-11 w-full" disabled={pending}>{pending ? "Сохраняем…" : next.homework ? "Сохранить изменения" : "Сохранить задание"}</Button>
              <p className="text-xs text-muted-foreground">Сохраняется в вашем аккаунте: видно и с компьютера, и с телефона. Чтобы удалить — очистите поле и сохраните.</p>
            </form>
          ) : <p className="text-sm text-muted-foreground">Следующей пары по этому предмету в ближайшие два месяца нет.</p>}
        </section>
      </div>
    </dialog>
  );
}
