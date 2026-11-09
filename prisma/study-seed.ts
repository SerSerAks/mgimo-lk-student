/**
 * Тестовые данные для «Учёбы»: история оценок по прошлым семестрам (для зачётки и прогноза красного диплома)
 * и социальный рейтинг. Всё вымышленное. Идемпотентно: добавляет только то, чего ещё нет.
 */
import type { ControlType, PrismaClient } from "@prisma/client";
import { toMark } from "../src/config/grading";

type Row = [discipline: string, control: ControlType, score: number];

// истории семестров: student3 — почти отличник (выходит на красный диплом), student2 — хорошист с долгом, master1/postgrad1 — короткие
const HISTORY: Record<string, { level: "BACHELOR" | "MASTER" | "POSTGRAD"; semesters: Record<number, Row[]> }> = {
  student2: { level: "BACHELOR", semesters: {
    1: [["Теория государства и права", "EXAM", 92], ["История отечественного государства и права", "EXAM", 88], ["Логика", "GRADED_CREDIT", 95], ["французский первый", "GRADED_CREDIT", 90], ["Физическая культура и спорт", "CREDIT", 80]],
    2: [["Конституционное право России", "EXAM", 91], ["Римское право", "EXAM", 79], ["Административное право", "EXAM", 93], ["французский первый", "GRADED_CREDIT", 86]],
    3: [["Гражданское право", "EXAM", 84], ["Международное публичное право", "EXAM", 94], ["Трудовое право", "GRADED_CREDIT", 90], ["Физическая культура и спорт", "CREDIT", 75]],
    4: [["Уголовное право", "EXAM", 90], ["Гражданский процесс", "EXAM", 76], ["Экологическое право", "GRADED_CREDIT", 92], ["французский первый", "GRADED_CREDIT", 93]],
    5: [["Арбитражный процесс", "EXAM", 81], ["Право ЕС", "EXAM", 95], ["Криминалистика", "GRADED_CREDIT", 88]],
  } },
  student3: { level: "BACHELOR", semesters: {
    1: [["Введение в политическую науку", "EXAM", 96], ["История политических учений", "EXAM", 93], ["Экономическая теория", "EXAM", 91], ["английский первый", "GRADED_CREDIT", 94], ["Физическая культура и спорт", "CREDIT", 85]],
    2: [["Сравнительная политология", "EXAM", 95], ["Государственное управление", "EXAM", 92], ["Социология", "GRADED_CREDIT", 97], ["английский первый", "GRADED_CREDIT", 90]],
    3: [["Теория управления", "EXAM", 94], ["Политическая география", "EXAM", 90], ["Статистика", "GRADED_CREDIT", 93], ["Физическая культура и спорт", "CREDIT", 82]],
  } },
  master1: { level: "MASTER", semesters: {
    1: [["Теория и механизмы современного государственного управления", "EXAM", 90], ["Методология научного исследования", "EXAM", 86], ["английский первый", "GRADED_CREDIT", 91]],
  } },
  postgrad1: { level: "POSTGRAD", semesters: {
    1: [["История и философия науки", "EXAM", 92], ["Иностранный язык", "EXAM", 95]],
    2: [["Методология научного исследования", "GRADED_CREDIT", 94], ["Педагогика высшей школы", "CREDIT", 88]],
    3: [["Научно-исследовательский семинар", "GRADED_CREDIT", 96]],
  } },
};

// социальный рейтинг — ДОПУЩЕНИЕ: категории и баллы условные, «оценка преподавателя» входит в рейтинг (со слов команды)
type Sp = [semester: number, category: string, title: string, points: number, awardedBy: string, date: string];
const SOCIAL: Record<string, Sp[]> = {
  student1: [
    [1, "Мероприятия и конференции", "Участие в Дне первокурсника — команда факультета", 4, "Студсовет МО", "2026-09-05"],
    [1, "Волонтёрство", "Волонтёр Дня открытых дверей", 6, "Волонтёрский центр", "2026-10-18"],
    [1, "Оценка преподавателя", "Активность на семинарах по всеобщей истории", 5, "Преподаватель курса", "2026-10-30"],
  ],
  student2: [
    [5, "Студенческие организации", "Член правления Клуба международного права", 12, "Студсовет МП", "2025-11-10"],
    [6, "Мероприятия и конференции", "Доклад на студенческой конференции «Право и глобальные вызовы»", 10, "Кафедра международного права", "2026-04-15"],
    [6, "Волонтёрство", "Юридическая клиника: 20 часов консультаций", 14, "Юридическая клиника", "2026-05-20"],
    [7, "Оценка преподавателя", "Подготовка модельного суда", 8, "Преподаватель курса", "2026-10-12"],
    [7, "Спорт", "Сборная университета по шахматам", 6, "Спортклуб", "2026-10-25"],
  ],
  student3: [
    [3, "Студенческие организации", "Редактор студенческого журнала факультета", 10, "Студсовет ФУП", "2025-10-01"],
    [4, "Мероприятия и конференции", "Организатор форума «Молодёжь и госуправление»", 15, "Студсовет ФУП", "2026-03-22"],
    [4, "Волонтёрство", "Волонтёр Международного молодёжного форума", 12, "Волонтёрский центр", "2026-05-14"],
    [5, "Оценка преподавателя", "Лучшая курсовая работа потока (предварительно)", 10, "Кафедра государственного управления", "2026-10-28"],
    [5, "Спорт", "Чемпионат МГИМО по волейболу — 2 место", 8, "Спортклуб", "2026-10-30"],
  ],
  master1: [
    [2, "Мероприятия и конференции", "Публикация в сборнике магистрантов", 12, "Кафедра государственного управления", "2026-05-30"],
    [3, "Оценка преподавателя", "Модератор кейс-сессии", 7, "Преподаватель курса", "2026-10-21"],
  ],
  postgrad1: [
    [3, "Мероприятия и конференции", "Доклад на международной конференции", 15, "Кафедра", "2026-10-09"],
    [3, "Оценка преподавателя", "Ассистирование на семинарах бакалавриата", 10, "Научный руководитель", "2026-10-30"],
  ],
};

export async function seedStudy(db: PrismaClient) {
  let grades = 0, points = 0;
  for (const [login, h] of Object.entries(HISTORY)) {
    const e = await db.enrollment.findFirst({ where: { person: { login }, level: h.level }, orderBy: { startDate: "desc" } });
    if (!e) continue;
    for (const [sem, rows] of Object.entries(h.semesters)) {
      if (await db.grade.count({ where: { enrollmentId: e.id, semester: Number(sem) } })) continue;
      for (const [discipline, controlType, score] of rows) {
        const m = toMark(score);
        await db.grade.create({ data: {
          enrollmentId: e.id, semester: Number(sem), discipline, controlType, score,
          mark: controlType === "CREDIT" ? (score >= 60 ? "зачтено" : "не зачтено") : m.mark, ects: controlType === "CREDIT" ? null : m.ects,
          isDebt: score < 60,
          components: [{ name: "Работа на семинарах", max: 30, score: Math.round(score * 0.3) }, { name: "Контрольные", max: 30, score: Math.round(score * 0.3) }, { name: "Экзамен", max: 40, score: score - 2 * Math.round(score * 0.3) }],
        } });
        grades++;
      }
    }
  }
  for (const [login, list] of Object.entries(SOCIAL)) {
    const e = await db.enrollment.findFirst({ where: { person: { login }, status: "ACTIVE" } });
    if (!e || (await db.socialPoint.count({ where: { enrollmentId: e.id } }))) continue;
    await db.socialPoint.createMany({ data: list.map(([semester, category, title, pts, awardedBy, date]) => ({ enrollmentId: e.id, semester, category, title, points: pts, awardedBy, date: new Date(date + "T00:00:00Z") })) });
    points += list.length;
  }
  return { grades, points };
}
