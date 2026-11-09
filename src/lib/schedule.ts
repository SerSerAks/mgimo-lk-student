import "server-only";
import { db } from "./db";

type Enr = { groupId: number | null; languageSubgroup: string | null };
const subgroupFilter = (enr: Enr) => ({ OR: [{ subgroup: null }, ...(enr.languageSubgroup ? [{ subgroup: enr.languageSubgroup }] : [])] });

/**
 * Пары студента за период: общие для группы + только своя языковая подгруппа.
 * Включает пары, перенесённые С этих дат (по prevDate) — чтобы в исходный день показать «перенесена».
 */
export function lessonsFor(enr: Enr, from: Date, to: Date, personId = "__none__") {
  if (!enr.groupId) return Promise.resolve([]);
  return db.lesson.findMany({
    where: {
      groupId: enr.groupId,
      AND: [
        { OR: [{ date: { gte: from, lt: to } }, { prevDate: { gte: from, lt: to } }] },
        subgroupFilter(enr),
      ],
    },
    // домашнее задание — только своё (personId из сессии)
    include: { teacher: { select: { name: true, title: true } }, homework: { where: { personId }, select: { text: true, done: true } } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
  });
}

export type LessonRow = Awaited<ReturnType<typeof lessonsFor>>[number];

/** Строка расписания конкретного дня. movedAway — пара перенесена с этого дня на другой. */
export type DayItem = { lesson: LessonRow; time: string; end: string; movedAway: boolean };

export function dayItems(lessons: LessonRow[], day: Date): DayItem[] {
  const t = day.getTime();
  const items: DayItem[] = [];
  for (const l of lessons) {
    if (l.date.getTime() === t) items.push({ lesson: l, time: l.start, end: l.end, movedAway: false });
    else if (l.change === "MOVED" && l.prevDate?.getTime() === t) {
      const end = l.changeNote?.split("|")[1] ?? l.end;
      items.push({ lesson: l, time: l.prevStart ?? l.start, end, movedAway: true });
    }
  }
  return items.sort((a, b) => a.time.localeCompare(b.time));
}

export const hasChanges = (items: DayItem[]) => items.some((i) => i.lesson.change !== "NONE");

export { toMin, shortName, mapLink } from "./schedule-utils";


export type NextLesson = { id: number; date: Date; start: string; homework: string | null };

/**
 * Для каждой пары — ближайшая СЛЕДУЮЩАЯ пара того же предмета (та же группа и подгруппа, не отменённая),
 * в пределах 60 дней. К ней привязывается домашнее задание «к следующей паре».
 */
export async function nextLessons(enr: Enr, lessons: LessonRow[], personId: string): Promise<Map<number, NextLesson>> {
  const map = new Map<number, NextLesson>();
  if (!enr.groupId || lessons.length === 0) return map;
  const from = new Date(Math.min(...lessons.map((l) => l.date.getTime())));
  const until = new Date(Math.max(...lessons.map((l) => l.date.getTime())) + 60 * 86400000);
  const pool = await db.lesson.findMany({
    where: { groupId: enr.groupId, date: { gte: from, lte: until }, change: { not: "CANCELLED" }, discipline: { in: [...new Set(lessons.map((l) => l.discipline))] }, AND: [subgroupFilter(enr)] },
    select: { id: true, date: true, start: true, discipline: true, subgroup: true, homework: { where: { personId }, select: { text: true } } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
  });
  const key = (d: Date, t: string) => `${d.toISOString().slice(0, 10)} ${t}`;
  for (const l of lessons) {
    const after = key(l.date, l.start);
    const n = pool.find((p) => p.discipline === l.discipline && p.subgroup === l.subgroup && key(p.date, p.start) > after);
    if (n) map.set(l.id, { id: n.id, date: n.date, start: n.start, homework: n.homework[0]?.text ?? null });
  }
  return map;
}
