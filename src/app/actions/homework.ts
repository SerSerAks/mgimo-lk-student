"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { lessonsFor, nextLessons } from "@/lib/schedule";

export type HwState = { error?: string; ok?: string } | undefined;

/** Пара доступна студенту, только если она его группы и его подгруппы (тот же фильтр, что у расписания). */
async function ownLesson(user: Awaited<ReturnType<typeof requireStudent>>, lessonId: number) {
  const l = await db.lesson.findUnique({ where: { id: lessonId }, select: { date: true } });
  if (!l) return null;
  const list = await lessonsFor(user.enrollment, l.date, new Date(l.date.getTime() + 86400000), user.id);
  return list.find((x) => x.id === lessonId) ?? null;
}

/**
 * Записать ДЗ «к следующей паре»: задание сохраняется на ближайшую следующую пару того же предмета.
 * Пустой текст — удалить. Хранится в учётке студента (видно с любого устройства).
 */
export async function saveHomework(_: HwState, form: FormData): Promise<HwState> {
  const user = await requireStudent();
  const p = z.object({ fromLessonId: z.coerce.number().int(), text: z.string().trim().max(1000, "Не больше 1000 символов") }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const from = await ownLesson(user, p.data.fromLessonId);
  if (!from) return { error: "Пара не найдена" };
  const next = (await nextLessons(user.enrollment, [from], user.id)).get(from.id);
  if (!next) return { error: "Следующей пары по этому предмету в ближайшие два месяца нет" };
  const where = { personId_lessonId: { personId: user.id, lessonId: next.id } };
  if (!p.data.text) {
    await db.homework.deleteMany({ where: { personId: user.id, lessonId: next.id } });
  } else {
    await db.homework.upsert({ where, create: { personId: user.id, lessonId: next.id, fromLessonId: from.id, text: p.data.text }, update: { text: p.data.text, fromLessonId: from.id, done: false } });
  }
  revalidatePath("/schedule"); revalidatePath("/today");
  return { ok: p.data.text ? "Сохранено — задание появится на следующей паре" : "Задание удалено" };
}

/** Отметить ДЗ на эту пару выполненным / снять отметку. Только своё. */
export async function toggleHomeworkDone(form: FormData) {
  const user = await requireStudent();
  const lessonId = Number(form.get("lessonId"));
  const hw = await db.homework.findUnique({ where: { personId_lessonId: { personId: user.id, lessonId } } });
  if (hw) await db.homework.update({ where: { id: hw.id }, data: { done: !hw.done } });
  revalidatePath("/schedule"); revalidatePath("/today");
}
