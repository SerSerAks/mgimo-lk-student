/**
 * Проверка правил доступа на тестовых данных (npm run test:access).
 * Строит «текущего пользователя» так же, как приложение, и считает, что видит каждая роль.
 */
import { PrismaClient } from "@prisma/client";
// access.ts помечен server-only; для скрипта подменяем модуль
import Module from "node:module";
const origResolve = (Module as unknown as { _resolveFilename: (req: string, ...a: unknown[]) => unknown })._resolveFilename;
(Module as unknown as { _resolveFilename: (req: string, ...a: unknown[]) => unknown })._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? require.resolve("./noop.cjs") : origResolve.call(this, req, ...rest);
};

const db = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${name}${detail ? " — " + detail : ""}`); if (!ok) failed++; };

async function userOf(login: string) {
  const p = await db.person.findUniqueOrThrow({ where: { login }, include: { enrollments: { where: { status: "ACTIVE" }, take: 1 } } });
  const { enrollments, ...rest } = p;
  return { ...rest, enrollment: enrollments[0] ?? null } as never;
}

(async () => {
  const { enrollmentScope, requestScope, thesisScope, gradeScope, supervisorRequestScope, canChooseSupervisor } = await import("../src/lib/access");
  const { campaignsFor } = await import("../src/lib/campaigns");
  const { advanceDemo, DEMO_STEP_MS } = await import("../src/lib/demo-flow");

  // --- каждый студент видит только своё ---
  const s1 = await userOf("student1");
  const s1id = (s1 as { id: string }).id;
  const s1req = await db.request.findMany({ where: requestScope(s1), include: { enrollment: { include: { person: true } } } });
  check("student1 видит только свои заявки", s1req.length > 0 && s1req.every((r) => r.enrollment.person.login === "student1"), `${s1req.length} шт.`);
  const s2req = await db.request.findFirstOrThrow({ where: { enrollment: { person: { login: "student2" } } } });
  check("student1 не получает заявку student2 по id", !(await db.request.findFirst({ where: { id: s2req.id, ...requestScope(s1) } })));
  const s1grades = await db.grade.findMany({ where: gradeScope(s1), include: { enrollment: { include: { person: true } } } });
  check("student1 видит только свои оценки", s1grades.length > 0 && s1grades.every((g) => g.enrollment.person.login === "student1"));
  const s2 = await userOf("student2");
  const th = await db.thesis.findMany({ where: thesisScope(s2), include: { enrollment: { include: { person: true } } } });
  check("student2 видит только свою ВКР", th.every((t) => t.enrollment.person.login === "student2"));
  check("student1 не видит чужую ВКР", (await db.thesis.count({ where: { AND: [thesisScope(s1), { enrollment: { person: { login: "student2" } } }] } })) === 0);

  const m1 = await userOf("master1");
  const m1enr = await db.enrollment.findMany({ where: enrollmentScope(m1) });
  check("master1 видит обе свои ступени (архив + текущую)", m1enr.length === 2, `${m1enr.length}`);

  // --- сотрудники — только справочные данные: никакой области доступа ---
  const staff = await db.person.findFirst({ where: { role: { not: "STUDENT" } } });
  if (staff) {
    const u = { id: staff.id, role: staff.role } as never;
    check("у сотрудника нет доступа к данным студентов", (await db.request.count({ where: requestScope(u) })) === 0 && (await db.grade.count({ where: gradeScope(u) })) === 0 && (await db.enrollment.count({ where: enrollmentScope(u) })) === 0);
  }

  // --- научный руководитель ---
  const s3 = await userOf("student3");
  check("student3 не видит заявки других студентов", (await db.supervisorRequest.findMany({ where: supervisorRequestScope(s3), include: { enrollment: { include: { person: true } } } })).every((r) => r.enrollment.person.login === "student3"));
  const s3e = await db.enrollment.findFirstOrThrow({ where: { person: { login: "student3" }, status: "ACTIVE" } });
  const s1e = await db.enrollment.findFirstOrThrow({ where: { person: { login: "student1" }, status: "ACTIVE" } });
  check("выбирать руководителя может 3 курс без руководителя, но не 1 курс", canChooseSupervisor(s3e) === !s3e.supervisorId && !canChooseSupervisor(s1e));
  const s3camps = await campaignsFor(db, s3e);
  check("student3 (3 курс) попадает в кампанию курсовых 3 курса", s3camps.length > 0 && s3camps.every((c) => c.course === 3 && c.workType === "COURSEWORK"));
  check("student1 (1 курс) не попадает ни в одну кампанию", (await campaignsFor(db, s1e)).length === 0);

  // --- демо-движение заявок (деканата нет — статусы идут сами) ---
  const old = new Date(Date.now() - 10 * 60_000);
  const mine = await db.request.create({ data: { enrollmentId: s1e.id, type: "study_cert", payload: {}, autoFlow: true, events: { create: { status: "NEW" } } } });
  const foreign = await db.request.create({ data: { enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { person: { login: "student2" }, status: "ACTIVE" } })).id, type: "study_cert", payload: {}, autoFlow: true } });
  await db.$executeRaw`UPDATE "Request" SET "updatedAt" = ${old} WHERE id IN (${mine.id}, ${foreign.id})`;
  const seeded = await db.request.findFirst({ where: { autoFlow: false, status: { in: ["NEW", "IN_PROGRESS"] }, enrollment: { personId: s1id } } });
  await advanceDemo(db, s1id);
  check("своя заявка из кабинета сама переходит «Новая» → «В работе»", (await db.request.findUniqueOrThrow({ where: { id: mine.id } })).status === "IN_PROGRESS");
  check("при этом приходит уведомление", (await db.notification.count({ where: { personId: s1id, link: `/requests/${mine.id}` } })) === 1);
  check("чужая заявка при открытии кабинета student1 не двигается", (await db.request.findUniqueOrThrow({ where: { id: foreign.id } })).status === "NEW");
  check("тестовые заявки (без демо-движения) не двигаются", !seeded || (await db.request.findUniqueOrThrow({ where: { id: seeded.id } })).status === seeded.status);
  await db.$executeRaw`UPDATE "Request" SET "updatedAt" = ${old} WHERE id = ${mine.id}`;
  await advanceDemo(db, s1id);
  const ready = await db.request.findUniqueOrThrow({ where: { id: mine.id } });
  check("через 2 мин — «Готово» с местом выдачи", ready.status === "READY" && !!ready.pickupPlace);
  await db.notification.deleteMany({ where: { link: { in: [`/requests/${mine.id}`, `/requests/${foreign.id}`] } } });
  await db.request.deleteMany({ where: { id: { in: [mine.id, foreign.id] } } });
  check("шаги демо: 1 и 2 минуты", DEMO_STEP_MS.toWork === 60_000 && DEMO_STEP_MS.toReady === 120_000);

  console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки доступа пройдены");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
})();
