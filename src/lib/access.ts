import "server-only";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "./auth";

/**
 * Единая точка правил доступа. Кабинет только студенческий: каждый видит только своё.
 * Каждая функция возвращает Prisma-условие «что этому студенту видно».
 * Любой запрос объекта по id обязан объединять id с этим условием:
 *   db.request.findFirst({ where: { id, ...requestScope(user) } })  → null → notFound()
 * Так чужой объект неотличим от несуществующего (404), даже если подставить id в адрес.
 */

type Who = Pick<CurrentUser, "id" | "role">;
const isStudent = (u: Who) => u.role === "STUDENT";

/** Ступени обучения студента: все свои (архив и текущая). */
export function enrollmentScope(user: Who): Prisma.EnrollmentWhereInput {
  return isStudent(user) ? { personId: user.id } : { id: "__none__" };
}

/** Заявки и справки — только свои. */
export function requestScope(user: Who): Prisma.RequestWhereInput {
  return isStudent(user) ? { enrollment: { personId: user.id } } : { id: "__none__" };
}

/** ВКР / диссертация — только своя. */
export function thesisScope(user: Who): Prisma.ThesisWhereInput {
  return isStudent(user) ? { enrollment: { personId: user.id } } : { id: "__none__" };
}

/** Оценки — только свои, по всем ступеням. */
export function gradeScope(user: Who): Prisma.GradeWhereInput {
  return isStudent(user) ? { enrollment: { personId: user.id } } : { id: -1 };
}

/** Заявки научному руководителю — только свои. */
export function supervisorRequestScope(user: Who): Prisma.SupervisorRequestWhereInput {
  return isStudent(user) ? { enrollment: { personId: user.id } } : { id: "__none__" };
}

/** Кто выбирает руководителя сам: бакалавр с 3 курса, магистрант, аспирант — без закреплённого руководителя. */
export function canChooseSupervisor(e: { level: "BACHELOR" | "MASTER" | "POSTGRAD"; course: number; supervisorId: string | null; status?: string }) {
  if (e.supervisorId) return false;
  if (e.status && e.status !== "ACTIVE") return false;
  return e.level !== "BACHELOR" || e.course >= 3;
}
