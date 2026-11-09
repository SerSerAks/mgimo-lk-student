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

  // --- домашнее задание: ложится на следующую пару того же предмета, видно только своему студенту ---
  const { lessonsFor, nextLessons } = await import("../src/lib/schedule");
  const enr1 = await db.enrollment.findFirstOrThrow({ where: { person: { login: "student1" }, status: "ACTIVE" } });
  const wk = await lessonsFor(enr1, new Date("2026-11-09T00:00:00Z"), new Date("2026-11-16T00:00:00Z"), s1id);
  const src = wk.find((l) => l.change !== "CANCELLED");
  if (src) {
    const nx = (await nextLessons(enr1, [src], s1id)).get(src.id);
    check("у пары есть следующая пара того же предмета, позже по времени", !!nx && `${nx.date.toISOString()} ${nx.start}` > `${src.date.toISOString()} ${src.start}`);
    if (nx) {
      const tgt = await db.lesson.findUniqueOrThrow({ where: { id: nx.id } });
      check("следующая пара — тот же предмет и подгруппа", tgt.discipline === src.discipline && tgt.subgroup === src.subgroup);
      const hw = await db.homework.create({ data: { personId: s1id, lessonId: nx.id, fromLessonId: src.id, text: "тест: глава 3" } });
      const seen = (await lessonsFor(enr1, tgt.date, new Date(tgt.date.getTime() + 86400000), s1id)).find((l) => l.id === nx.id);
      check("ДЗ видно на следующей паре у автора", seen?.homework[0]?.text === "тест: глава 3");
      const other = (await lessonsFor(enr1, tgt.date, new Date(tgt.date.getTime() + 86400000), "чужой-студент")).find((l) => l.id === nx.id);
      check("чужое ДЗ не видно другому студенту той же группы", other?.homework.length === 0);
      await db.homework.delete({ where: { id: hw.id } });
    }
  }

  // --- учёба: средний балл и прогноз красного диплома ---
  const { averageMark, honorsForecast } = await import("../src/lib/study");
  const g = (mark: string, isDebt = false) => ({ mark, isDebt, controlType: "EXAM" as const });
  check("средний балл: 5, 4, 5 → 4,67; зачёты не считаются", averageMark([g("5"), g("4"), g("5"), { mark: "зачтено", isDebt: false, controlType: "CREDIT" }]) === 4.67);
  check("средний балл без оценок — нет", averageMark([]) === null);
  check("красный диплом: 6 из 8 пятёрок (75%) — выходит", honorsForecast([..."55555544"].map((m) => g(m))).status === "on_track");
  check("красный диплом: тройка мешает даже при 80% пятёрок", honorsForecast([..."55553"].map((m) => g(m))).status === "off");
  check("красный диплом: долг мешает", honorsForecast([g("5"), g("5"), g("5"), g("2", true)]).status === "off");
  const near = honorsForecast([..."5544"].map((m) => g(m)));
  check("красный диплом: 50% — нужно ещё 4 пятёрки подряд", near.needFives === 4 && near.status === "off");
  check("красный диплом: 2 из 3 — «почти», нужна 1 пятёрка", honorsForecast([..."554"].map((m) => g(m))).needFives === 1 && honorsForecast([..."554"].map((m) => g(m))).status === "close");

  // --- подсветка пары: 9:00 — первая, 10:22 (перерыв) — вторая, после последней — ничего ---
  const { pickHighlight, mapLink } = await import("../src/lib/schedule-utils");
  const day = [{ time: "09:00", end: "10:20" }, { time: "10:35", end: "11:55" }, { time: "12:10", end: "13:30", off: true }, { time: "14:30", end: "15:50" }];
  const hl = (hhmm: string) => { const h = pickHighlight(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))); return h.current ? `идёт ${h.current.time}` : h.upcoming ? `следующая ${h.upcoming.time}` : "нет"; };
  check("в 9:00 подсвечена первая пара", hl("09:00") === "идёт 09:00");
  check("в 10:22 (перерыв) подсвечена вторая пара", hl("10:22") === "следующая 10:35");
  check("в 8:10 подсвечена первая как следующая", hl("08:10") === "следующая 09:00");
  check("отменённая пара не подсвечивается — в 12:20 следующая 14:30", hl("12:20") === "следующая 14:30");
  check("после последней пары подсветки нет", hl("18:38") === "нет");
  // --- ссылка на карту МГИМО ---
  check("ссылка на карту: номер аудитории и зал", mapLink("507", "Новый корпус") === "https://mgimo.ru/territory/?q=507" && mapLink("зал 2", "Корпус МО")!.endsWith("q=%D0%B7%D0%B0%D0%BB%202"));
  check("для дистанта и «Б/а» ссылки нет", mapLink("Б/а", "Виртуальное") === null && mapLink("3153", "Виртуальное") === null);

  console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки доступа пройдены");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
})();
