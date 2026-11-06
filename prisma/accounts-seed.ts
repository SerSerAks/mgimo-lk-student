/**
 * Справочные данные о сотрудниках для кабинета студента: структура деканата («Мой деканат»), кафедра аспиранта.
 * Сотрудники — только данные: войти в кабинет может лишь студент. Идемпотентно.
 */
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/password";

export async function seedAccounts(db: PrismaClient): Promise<[string, string, string][]> {
  const creds: [string, string, string][] = [];
  // структура деканатов (SPEC §15): деканы — dean_mo / dean_mp, у них подчинённые; телефоны и ФИО вымышленные
  type Staff = { login: string; fio: [string, string, string]; position: string; duties: string; room: string; hours: string; phone: string; manager: string };
  const TREE: Record<string, { head: Omit<Staff, "login" | "fio" | "manager" | "position">; staff: Staff[] }> = {
    dean_mo: {
      head: { duties: "Общее руководство факультетом, приём по личным вопросам", room: "каб. 210", hours: "вт 15:00–17:00, по записи", phone: "+7 (000) 000-01-00" },
      staff: [
        { login: "mo_zam_study", fio: ["Лебедева", "Анна", "Сергеевна"], position: "Заместитель декана по учебной работе", duties: "Учебный процесс, сессия, пересдачи, индивидуальные графики", room: "каб. 212", hours: "пн–чт 11:00–16:00", phone: "+7 (000) 000-01-10", manager: "dean_mo" },
        { login: "mo_spec_12", fio: ["Тихонова", "Дарья", "Игоревна"], position: "Начальник 1–2 курсов", duties: "1–2 курс: справки, расписание, зачётные книжки", room: "каб. 214", hours: "пн–пт 10:00–17:00", phone: "+7 (000) 000-01-14", manager: "mo_zam_study" },
        { login: "mo_spec_34", fio: ["Ершов", "Максим", "Павлович"], position: "Начальник 3–4 курсов", duties: "3–4 курс: справки, практика, ВКР", room: "каб. 214", hours: "пн–пт 10:00–17:00", phone: "+7 (000) 000-01-15", manager: "mo_zam_study" },
        { login: "mo_mag", fio: ["Белова", "Ольга", "Викторовна"], position: "Руководитель магистерских программ", duties: "Магистратура: учебные планы, выбор руководителей, ВКР магистрантов", room: "каб. 218", hours: "пн, ср 16:00–19:00", phone: "+7 (000) 000-01-30", manager: "mo_zam_study" },
        { login: "mo_zam_students", fio: ["Миронов", "Илья", "Андреевич"], position: "Заместитель декана по работе со студентами", duties: "Стипендии, материальная помощь, общежитие, студенческие объединения", room: "каб. 216", hours: "ср, пт 12:00–16:00", phone: "+7 (000) 000-01-20", manager: "dean_mo" },
      ],
    },
    dean_mp: {
      head: { duties: "Общее руководство факультетом", room: "каб. 305", hours: "чт 14:00–16:00", phone: "+7 (000) 000-02-00" },
      staff: [
        { login: "mp_zam_study", fio: ["Соколова", "Вероника", "Олеговна"], position: "Заместитель декана по учебной работе", duties: "Учебный процесс, пересдачи, практика", room: "каб. 307", hours: "пн–чт 10:00–15:00", phone: "+7 (000) 000-02-10", manager: "dean_mp" },
        { login: "mp_spec", fio: ["Громов", "Егор", "Сергеевич"], position: "Специалист по учебной работе", duties: "Справки и выписки из приказов, все курсы", room: "каб. 309", hours: "пн–пт 10:00–17:00", phone: "+7 (000) 000-02-14", manager: "mp_zam_study" },
      ],
    },
  };
  for (const [headLogin, t] of Object.entries(TREE)) {
    const head = await db.person.findUnique({ where: { login: headLogin } });
    if (!head) continue;
    if (!head.isHead) await db.person.update({ where: { id: head.id }, data: { isHead: true, position: "Декан факультета", staffDuties: t.head.duties, staffRoom: t.head.room, staffHours: t.head.hours, workPhone: t.head.phone } });
    const ids: Record<string, string> = { [headLogin]: head.id };
    for (const st of t.staff) {
      let p = await db.person.findUnique({ where: { login: st.login } });
      // демо-структура: должности сидовых сотрудников приводятся к актуальным (повторный запуск безопасен)
      if (p && p.position !== st.position) p = await db.person.update({ where: { id: p.id }, data: { position: st.position, staffDuties: st.duties } });
      if (!p) p = await db.person.create({ data: {
        login: st.login, role: "DEAN_OFFICE", passwordHash: await hashPassword(randomBytes(12).toString("base64url")),
        lastName: st.fio[0], firstName: st.fio[1], middleName: st.fio[2], staffFacultyId: head.staffFacultyId, position: st.position,
        staffDuties: st.duties, staffRoom: st.room, staffHours: st.hours, workPhone: st.phone, managerId: ids[st.manager], createdById: ids[st.manager],
      } });
      ids[st.login] = p.id;
    }
  }

  // аспирант postgrad1 — на кафедре государственного управления (кафедра его руководителя)
  const gov = await db.department.findFirst({ where: { name: "Кафедра государственного управления" } });
  if (gov) await db.enrollment.updateMany({ where: { level: "POSTGRAD", departmentId: null, person: { login: "postgrad1" } }, data: { departmentId: gov.id } });
  return creds;
}
