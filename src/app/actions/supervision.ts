"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { replySupervisorRequest } from "@/lib/demo-flow";
import { campaignsFor } from "@/lib/campaigns";

export type SupState = { error?: string; ok?: boolean; info?: string } | undefined;

const acceptedIn = (supervisorId: string, campaignId: number) =>
  db.supervisorRequest.count({ where: { supervisorId, campaignId, status: "ACCEPTED", enrollment: { status: "ACTIVE" } } });

// ---------- студент ----------

export async function sendSupervisorRequest(_: SupState, form: FormData): Promise<SupState> {
  const user = await requireStudent();
  const e = await db.enrollment.findFirstOrThrow({ where: { id: user.enrollment.id, personId: user.id } });
  const p = z.object({
    campaignId: z.coerce.number().int(),
    supervisorId: z.string().min(1),
    topic: z.string().trim().min(3, "Тема — от 3 символов").max(200),
    message: z.string().trim().min(10, "Сообщение — от 10 символов").max(1000),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };

  // кампания должна быть кампанией этого студента, срок — не прошёл
  const camp = (await campaignsFor(db, e)).find((c) => c.id === p.data.campaignId);
  if (!camp) return { error: "Эта кампания вас не касается" };
  if (camp.workType === "THESIS" && e.supervisorId) return { error: "Руководитель выпускной работы уже закреплён" };
  if (await db.supervisorRequest.findFirst({ where: { enrollmentId: e.id, campaignId: camp.id, status: { in: ["PENDING", "ACCEPTED"] } } }))
    return { error: "По этой работе у вас уже есть заявка. Отзовите её, чтобы написать другому руководителю." };
  // руководитель открыл приём в этой кампании, места остались
  const intake = await db.supervisorIntake.findUnique({ where: { supervisorId_campaignId: { supervisorId: p.data.supervisorId, campaignId: camp.id } } });
  if (!intake) return { error: "Руководитель ещё не открыл приём" };
  if ((await acceptedIn(intake.supervisorId, camp.id)) >= intake.slots) return { error: "У руководителя не осталось мест" };

  await db.$transaction([
    db.supervisorRequest.create({ data: { enrollmentId: e.id, supervisorId: intake.supervisorId, campaignId: camp.id, topic: p.data.topic, message: p.data.message } }),
  ]);
  revalidatePath("/supervisor");
  return { ok: true };
}

export async function withdrawSupervisorRequest(form: FormData) {
  const user = await requireStudent();
  const id = String(form.get("id") ?? "");
  await db.supervisorRequest.updateMany({ where: { id, status: "PENDING", enrollment: { personId: user.id } }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
  revalidatePath("/supervisor");
}

// ---------- демо: ответ руководителя сразу ----------

/** Руководителей в прототипе нет — ответ имитируется (src/lib/demo-flow.ts). Кнопка делает это без ожидания. */
export async function speedUpSupervisorReply(form: FormData) {
  const user = await requireStudent();
  const id = String(form.get("id") ?? "");
  // только своя заявка и только ожидающая ответа
  const r = await db.supervisorRequest.findFirst({ where: { id, status: "PENDING", enrollment: { personId: user.id } } });
  if (r) await replySupervisorRequest(db, r.id);
  revalidatePath("/supervisor");
}
