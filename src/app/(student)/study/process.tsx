import Link from "next/link";
import { db } from "@/lib/db";
import { practiceFor } from "@/lib/practice";

// Вкладка «Сессия и практика»: ключевые даты, практика, расписание сессии, дисциплины семестра.
const CT = { EXAM: "Экзамен", CREDIT: "Зачёт", GRADED_CREDIT: "Зачёт с оценкой" } as const;
const fmtD = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d);
const fmtDT = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export async function Process({ e, grades }: { e: { id: string; groupId: number | null; languageSubgroup: string | null; facultyId: number; level: "BACHELOR" | "MASTER" | "POSTGRAD"; course: number; programId: number | null }; grades: { discipline: string; controlType: keyof typeof CT }[] }) {
  const semStart = new Date("2026-09-01T00:00:00Z"), semEnd = new Date("2026-12-31T00:00:00Z");
  const [byDisc, exams, practice] = await Promise.all([
    e.groupId ? db.lesson.groupBy({
      by: ["discipline", "kind"], _count: true,
      where: { groupId: e.groupId, date: { gte: semStart, lte: semEnd }, OR: [{ subgroup: null }, ...(e.languageSubgroup ? [{ subgroup: e.languageSubgroup }] : [])] },
    }) : Promise.resolve([]),
    e.groupId ? db.exam.findMany({ where: { groupId: e.groupId }, orderBy: { at: "asc" } }) : Promise.resolve([]),
    practiceFor(e),
  ]);
  // учебный план семестра — из реального расписания: 1 пара = 2 академических часа
  const plan = new Map<string, { lec: number; sem: number }>();
  for (const r of byDisc) {
    const p = plan.get(r.discipline) ?? { lec: 0, sem: 0 };
    if (/лекц/i.test(r.kind)) p.lec += r._count * 2; else p.sem += r._count * 2;
    plan.set(r.discipline, p);
  }
  const control = new Map(grades.map((g) => [g.discipline, CT[g.controlType]]));
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold text-navy">Ключевые даты семестра</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Занятия</p><b>1 сен — 31 дек 2026</b></li>
          <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Сессия</p><b>{exams.length ? `${fmtD(exams[0].at)} — ${fmtD(exams[exams.length - 1].at)}` : "по графику факультета"}</b></li>
          <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Практика</p><b>{practice.length ? `${fmtD(practice[0].startDate)} — ${fmtD(practice[0].endDate)}` : "в этом году нет"}</b></li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-navy">Практика</h2>
        {practice.length === 0 ? <Empty text="На вашем курсе практики нет." /> : (
          <ul className="space-y-2">
            {practice.map((p) => (
              <li key={p.id} className="rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{p.kind}</p>
                <b className="text-navy">{p.title}</b>
                <p className="text-sm">{fmtD(p.startDate)} — {fmtD(p.endDate)}{p.docsDeadline && <> · место согласовать до <b>{fmtD(p.docsDeadline)}</b></>}</p>
                {p.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-brand-blue">
                  <Link href="/requests/new/practice_place">Согласовать место →</Link>
                  <Link href="/requests/new/practice_referral">Получить направление →</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-navy">Сессия</h2>
        {exams.length === 0 ? <Empty text="Расписание сессии ещё не опубликовано." /> : (
          <ul className="divide-y rounded-lg border text-sm">
            {exams.map((x) => (
              <li key={x.id} className={`grid grid-cols-[110px_1fr] gap-3 p-3 ${x.kind === "Консультация" ? "text-muted-foreground" : ""}`}>
                <span className="tabular-nums">{fmtDT(x.at)}</span>
                <span><b className={x.kind === "Консультация" ? "font-medium" : "text-navy"}>{x.kind}</b> · {x.discipline} · ауд. {x.auditorium}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-navy">Дисциплины семестра</h2>
        {plan.size === 0 ? <Empty text="Аудиторных занятий в этом семестре нет." /> : (
          <table className="w-full overflow-hidden rounded-lg border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Дисциплина</th><th className="p-3 text-right">Лекции</th><th className="p-3 text-right">Семинары</th><th className="hidden p-3 sm:table-cell">Контроль</th></tr>
            </thead>
            <tbody className="divide-y">
              {[...plan.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")).map(([d, h]) => (
                <tr key={d}><td className="p-3 font-medium text-navy">{d}</td><td className="p-3 text-right tabular-nums">{h.lec || "—"}</td><td className="p-3 text-right tabular-nums">{h.sem || "—"}</td><td className="hidden p-3 text-muted-foreground sm:table-cell">{control.get(d) ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Часы посчитаны по расписанию семестра (открытые данные РУЗ): 1 пара = 2 ак. часа.</p>
      </section>
    </div>
  );
}


const Empty = ({ text }: { text: string }) => <p className="rounded-lg border p-4 text-sm text-muted-foreground">{text}</p>;
