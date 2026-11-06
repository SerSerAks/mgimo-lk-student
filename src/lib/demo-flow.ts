/**
 * Демо-движение (в прототипе нет деканата и руководителей — за них отвечает этот модуль).
 * Без "server-only": используется и страницами, и скриптами.
 *
 * Заявка, поданная в кабинете (autoFlow), сама проходит статусы:
 *   «Новая» → через 1 мин «В работе» → ещё через 2 мин «Готово, заберите в 214 каб.»
 * Заявка научному руководителю через 1 мин получает ответ: согласие, если есть места, иначе вежливый отказ.
 * Кнопка «Ускорить (демо)» делает следующий шаг сразу — чтобы жюри не ждало.
 * Всё срабатывает «лениво» — при открытии любой страницы кабинета; фоновых процессов нет.
 */
import type { PrismaClient, RequestStatus } from "@prisma/client";
import { notificationFor } from "./request-flow";
import { requestTypeLabel } from "./requests";
import { workLabel } from "./campaigns";

export const DEMO_STEP_MS = { toWork: 60_000, toReady: 120_000, supervisorReply: 60_000 } as const;
// ДОПУЩЕНИЕ: кабинет выдачи документов условный
export const PICKUP_ROOM = "деканат, каб. 214, пн–пт 10:00–17:00";

const NEXT: Partial<Record<RequestStatus, RequestStatus>> = { NEW: "IN_PROGRESS", IN_PROGRESS: "READY" };

/** Сдвинуть одну заявку на следующий статус (если есть куда). Возвращает новый статус или null. */
export async function stepRequest(db: PrismaClient, r: { id: string; number: number; type: string; status: RequestStatus; delivery: string; personId: string }) {
  const to = NEXT[r.status];
  if (!to) return null;
  const pickup = to === "READY" ? (r.delivery === "электронно" ? "электронная копия придёт на вашу почту (демо)" : PICKUP_ROOM) : null;
  const n = notificationFor(to, r.number, requestTypeLabel(r.type), pickup);
  await db.$transaction([
    db.request.update({ where: { id: r.id }, data: { status: to, ...(pickup ? { pickupPlace: pickup } : {}) } }),
    db.requestEvent.create({ data: { requestId: r.id, status: to } }),
    db.notification.create({ data: { personId: r.personId, type: "request", title: n.title, body: n.body, link: `/requests/${r.id}` } }),
  ]);
  return to;
}

/** Ответ «руководителя» на заявку студента: согласие, если есть места в кампании, иначе отказ. */
export async function replySupervisorRequest(db: PrismaClient, id: string) {
  const r = await db.supervisorRequest.findFirst({
    where: { id, status: "PENDING" },
    include: { campaign: true, supervisor: true, enrollment: { include: { thesis: true } } },
  });
  if (!r) return null;
  const what = r.campaign ? workLabel(r.campaign.workType, r.campaign.level).toLowerCase() : "работа";
  const thesis = !r.campaign || r.campaign.workType === "THESIS";
  const intake = r.campaignId ? await db.supervisorIntake.findUnique({ where: { supervisorId_campaignId: { supervisorId: r.supervisorId, campaignId: r.campaignId } } }) : null;
  const taken = r.campaignId ? await db.supervisorRequest.count({ where: { supervisorId: r.supervisorId, campaignId: r.campaignId, status: "ACCEPTED" } }) : 0;
  const full = intake ? taken >= intake.slots : false;
  const sup = `${r.supervisor.lastName} ${r.supervisor.firstName}`;

  if (full || (thesis && r.enrollment.supervisorId)) {
    const reply = "Спасибо за интерес к теме, но места в этом году уже заняты. Попробуйте написать коллегам с кафедры.";
    await db.$transaction([
      db.supervisorRequest.update({ where: { id }, data: { status: "DECLINED", reply, decidedAt: new Date() } }),
      db.notification.create({ data: { personId: r.enrollment.personId, type: "thesis", title: "Руководитель отклонил заявку", body: `${sup}, ${what}: ${reply}`, link: "/supervisor" } }),
    ]);
    return "DECLINED" as const;
  }
  const ops = [
    db.supervisorRequest.update({ where: { id }, data: { status: "ACCEPTED", reply: "Тема интересная, давайте работать. Жду вас на консультации.", decidedAt: new Date() } }),
    db.supervisorRequest.updateMany({ where: { enrollmentId: r.enrollmentId, campaignId: r.campaignId, status: "PENDING", id: { not: id } }, data: { status: "WITHDRAWN", decidedAt: new Date() } }),
    db.notification.create({ data: { personId: r.enrollment.personId, type: "thesis", title: "Руководитель согласился!", body: `${sup} — ваш руководитель (${what}).${thesis ? ` Тема «${r.topic}» ушла на утверждение кафедре.` : ""}`, link: "/supervisor" } }),
  ];
  if (thesis && r.supervisor.staffDepartmentId != null) {
    ops.push(db.enrollment.update({ where: { id: r.enrollmentId }, data: { supervisorId: r.supervisorId } }) as never);
    ops.push((r.enrollment.thesis
      ? db.thesis.update({ where: { id: r.enrollment.thesis.id }, data: { topic: r.topic, topicStatus: "PENDING", stage: 2 } })
      : db.thesis.create({ data: { enrollmentId: r.enrollmentId, departmentId: r.supervisor.staffDepartmentId, topic: r.topic, topicStatus: "PENDING", stage: 2 } })) as never);
  }
  await db.$transaction(ops);
  return "ACCEPTED" as const;
}

/** Всё, что «пора» сдвинуть у этого студента. Вызывается при открытии страниц кабинета. */
export async function advanceDemo(db: PrismaClient, personId: string, now = new Date()) {
  const reqs = await db.request.findMany({
    where: { autoFlow: true, status: { in: ["NEW", "IN_PROGRESS"] }, enrollment: { personId } },
    select: { id: true, number: true, type: true, status: true, delivery: true, updatedAt: true },
  });
  for (const r of reqs) {
    const wait = r.status === "NEW" ? DEMO_STEP_MS.toWork : DEMO_STEP_MS.toReady;
    if (now.getTime() - r.updatedAt.getTime() >= wait) await stepRequest(db, { ...r, personId });
  }
  const pending = await db.supervisorRequest.findMany({
    where: { status: "PENDING", enrollment: { personId }, createdAt: { lte: new Date(now.getTime() - DEMO_STEP_MS.supervisorReply) } },
    select: { id: true },
  });
  for (const p of pending) await replySupervisorRequest(db, p.id);
}
