"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { requestScope } from "@/lib/access";
import { stepRequest } from "@/lib/demo-flow";
import { REQUEST_TYPES, addWorkdays, requestTypeLabel } from "@/lib/requests";

export type CreateState = { errors?: Record<string, string>; message?: string } | undefined;

export async function createRequest(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await requireStudent();
  const type = String(form.get("type") ?? "");
  const def = REQUEST_TYPES[type];
  if (!def) return { message: "Неизвестный тип заявки" };

  // Схема собирается из описания типа: длины, обязательность, допустимые варианты — всё проверяется на сервере.
  const debts = def.fields.some((f) => f.optionsFrom === "debts")
    ? (await db.grade.findMany({ where: { enrollmentId: user.enrollment.id, isDebt: true }, select: { discipline: true } })).map((g) => g.discipline)
    : [];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    let s: z.ZodTypeAny;
    if (f.kind === "number") s = z.coerce.number().int().min(f.min ?? 0).max(f.max ?? 99);
    else if (f.kind === "select") s = z.enum((f.optionsFrom === "debts" ? debts : f.options ?? []) as [string, ...string[]]);
    else s = z.string().trim().max(f.max ?? 200);
    if (f.required && f.kind !== "number" && f.kind !== "select") s = (s as z.ZodString).min(1, "Заполните поле");
    shape[f.name] = f.required ? s : s.optional().or(z.literal(""));
  }
  if (def.delivery) shape.delivery = z.enum(["в деканате", "электронно"]);

  const raw = Object.fromEntries(Object.keys(shape).map((k) => [k, form.get(k) ?? ""]));
  const parsed = z.object(shape).safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] = i.message.startsWith("Заполните") ? i.message : "Проверьте значение";
    return { errors };
  }
  const { delivery, ...payload } = parsed.data as Record<string, unknown>;
  const dueDate = addWorkdays(new Date(), def.days);

  const req = await db.$transaction(async (tx) => {
    const r = await tx.request.create({ data: { enrollmentId: user.enrollment.id, type, payload: payload as object, delivery: (delivery as string) ?? "в деканате", dueDate, autoFlow: true } });
    await tx.requestEvent.create({ data: { requestId: r.id, status: "NEW" } });
    await tx.notification.create({ data: { personId: user.id, type: "request", title: `Заявка №${r.number} принята`, body: `${requestTypeLabel(type)}: обычно готовим за ${def.days} раб. дн.`, link: `/requests/${r.id}` } });
    return r;
  });
  revalidatePath("/requests");
  redirect(`/requests/${req.id}?created=1`);
}

export async function cancelRequest(form: FormData) {
  const user = await requireStudent();
  const id = String(form.get("id") ?? "");
  // отменить можно только свою заявку и только пока она «Новая»
  const r = await db.request.findFirst({ where: { id, enrollment: { personId: user.id }, status: "NEW" } });
  if (!r) redirect(`/requests`);
  await db.$transaction([
    db.request.update({ where: { id }, data: { status: "CANCELLED" } }),
    db.requestEvent.create({ data: { requestId: id, status: "CANCELLED", comment: "Отменена студентом" } }),
  ]);
  revalidatePath(`/requests/${id}`);
  redirect(`/requests/${id}`);
}

export type StatusState = { error?: string } | undefined;

// ---------- студент: ответ на «Нужны уточнения» ----------
export async function answerRequest(_: StatusState, form: FormData): Promise<StatusState> {
  const user = await requireStudent();
  const id = String(form.get("id") ?? "");
  const answer = z.string().trim().min(2, "Напишите ответ").max(500).safeParse(String(form.get("answer") ?? ""));
  if (!answer.success) return { error: "Напишите ответ (до 500 символов)" };
  const r = await db.request.findFirst({ where: { id, enrollment: { personId: user.id }, status: "NEEDS_INFO" } });
  if (!r) return { error: "Заявка уже не ждёт ответа" };
  await db.$transaction([
    db.request.update({ where: { id }, data: { status: "IN_PROGRESS" } }),
    db.requestEvent.create({ data: { requestId: id, status: "IN_PROGRESS", comment: `Ответ студента: ${answer.data}`, authorId: user.id } }),
  ]);
  revalidatePath(`/requests/${id}`);
  return undefined;
}

// ---------- демо: «Ускорить» — следующий статус сразу, без ожидания ----------
export async function speedUpRequest(form: FormData) {
  const user = await requireStudent();
  const id = String(form.get("id") ?? "");
  // только своя заявка, поданная в кабинете, и только пока она движется
  const r = await db.request.findFirst({ where: { id, ...requestScope(user), autoFlow: true, status: { in: ["NEW", "IN_PROGRESS"] } } });
  if (r) await stepRequest(db, { ...r, personId: user.id });
  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
}
