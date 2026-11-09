import Link from "next/link";
import { Award, GraduationCap, HeartHandshake, TriangleAlert } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeScope } from "@/lib/access";
import { averageMark, honorsForecast, HONORS_SHARE } from "@/lib/study";
import { Process } from "./process";

const CT = { EXAM: "Экзамен", CREDIT: "Зачёт", GRADED_CREDIT: "Зачёт с оценкой" } as const;
const TABS = [["semester", "Семестр"], ["record", "Зачётка"], ["social", "Соцрейтинг"], ["process", "Сессия и практика"]] as const;
type Tab = (typeof TABS)[number][0];
type Comp = { name: string; max: number; score: number | null };
type GradeRow = { id: number; semester: number; discipline: string; controlType: keyof typeof CT; score: number | null; mark: string | null; isDebt: boolean; components: unknown };

const fmtD = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
const fmtAvg = (n: number) => n.toFixed(2).replace(".", ",");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/**
 * Учёба: «Семестр» — средний балл, соцрейтинг и экзамены/зачёты текущего семестра;
 * «Зачётка» — все прошлые оценки и прогноз красного диплома; «Соцрейтинг» — из чего сложились баллы;
 * «Сессия и практика» — даты, практика, расписание сессии. На каждой вкладке — только своё.
 */
export default async function StudyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStudent();
  const e = user.enrollment;
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find(([k]) => k === requested)?.[0] ?? "semester";
  const [grades, social] = await Promise.all([
    db.grade.findMany({ where: { ...gradeScope(user), enrollmentId: e.id }, orderBy: [{ semester: "desc" }, { discipline: "asc" }] }),
    db.socialPoint.findMany({ where: { enrollmentId: e.id, enrollment: { personId: user.id } }, orderBy: { date: "desc" } }),
  ]);
  const closed = grades.filter((g) => g.mark != null);
  const curSem = grades[0]?.semester ?? null;
  const current = grades.filter((g) => g.semester === curSem);
  const debts = closed.filter((g) => g.isDebt);
  const avg = averageMark(closed);
  const socialTotal = social.reduce((a, s) => a + s.points, 0);
  const socialThisSem = curSem ? social.filter((s) => s.semester === curSem).reduce((a, s) => a + s.points, 0) : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-navy">Учёба</h1>

      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm" aria-label="Разделы учёбы">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/study?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`shrink-0 rounded-sm px-3 py-2.5 ${tab === k ? "bg-navy font-semibold text-white" : "bg-muted text-foreground"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "semester" && (
        <>
          <section className="grid grid-cols-2 gap-3" aria-label="Сводка">
            <Link href="/study?tab=record" className="rounded-lg border p-4 hover:bg-muted/50">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><GraduationCap className="size-4" aria-hidden />Средний балл</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-navy">{avg != null ? fmtAvg(avg) : "—"}</p>
              <p className="text-xs text-muted-foreground">{avg != null ? (() => { const n = closed.filter((g) => /^[2-5]$/.test(g.mark ?? "")).length; return `из 5 · ${n} ${plural(n, "оценка", "оценки", "оценок")}`; })() : "после первой сессии"}</p>
            </Link>
            <Link href="/study?tab=social" className="rounded-lg border p-4 hover:bg-muted/50">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><HeartHandshake className="size-4" aria-hidden />Соцрейтинг</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-navy">{socialTotal}</p>
              <p className="text-xs text-muted-foreground">{plural(socialTotal, "балл", "балла", "баллов")}{socialThisSem ? ` · +${socialThisSem} в этом семестре` : ""}</p>
            </Link>
          </section>

          {debts.length > 0 && (
            <p className="flex gap-2 rounded-lg border border-brand-red/40 bg-brand-red/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand-red" aria-hidden />
              <span>{debts.length === 1 ? "Долг" : "Долги"}: <b>{debts.map((d) => d.discipline).join(", ")}</b>. <Link href="/requests/new/retake" className="font-semibold text-brand-blue">Записаться на пересдачу →</Link></span>
            </p>
          )}

          <section aria-labelledby="sem-title" className="space-y-2">
            <h2 id="sem-title" className="font-semibold text-navy">Экзамены и зачёты{curSem ? ` · ${curSem}-й семестр` : ""}</h2>
            {current.length === 0 ? <Empty text="В этом семестре дисциплин с контролем пока нет." /> : <SemesterTable list={current} />}
            <p className="text-xs text-muted-foreground">Баллы — из 100 по рейтинговой системе; итоговая оценка появится после сессии. Ниже 60% от возможного на сегодня — красным.</p>
          </section>
        </>
      )}

      {tab === "record" && <Record closed={closed} level={e.level} />}
      {tab === "social" && <Social items={social} total={socialTotal} />}
      {tab === "process" && <Process e={e} grades={current} />}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-lg border p-4 text-sm text-muted-foreground">{text}</p>;

function markText(g: { mark: string | null }) {
  return g.mark === "5" ? "отлично" : g.mark === "4" ? "хорошо" : g.mark === "3" ? "удовл." : g.mark === "2" ? "неуд." : g.mark ?? "";
}
function MarkBadge({ g }: { g: { mark: string | null; isDebt: boolean } }) {
  if (!g.mark) return <span className="text-xs text-muted-foreground">сессия впереди</span>;
  const tone = g.isDebt ? "bg-brand-red/10 text-brand-red" : g.mark === "5" || g.mark === "зачтено" ? "bg-status-ok/10 text-status-ok" : g.mark === "4" ? "bg-secondary text-navy" : "bg-status-warn/10 text-status-warn";
  return <span className={`inline-block shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${tone}`}>{/^[2-5]$/.test(g.mark) ? `${g.mark} · ${markText(g)}` : g.mark}</span>;
}

/** Текущий семестр: предмет, форма контроля, набранные баллы, итог. На телефоне — карточки. */
function SemesterTable({ list }: { list: GradeRow[] }) {
  const progress = (g: GradeRow) => {
    const comps = (g.components as Comp[]) ?? [];
    const max = g.mark ? 100 : comps.filter((c) => c.score != null).reduce((a, c) => a + c.max, 0);
    const score = g.score ?? 0;
    return { score, max, risk: !g.mark && max > 0 && score < 0.6 * max };
  };
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-lg border text-sm md:table">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="p-3">Предмет</th><th className="p-3">Форма</th><th className="p-3 text-right">Баллы</th><th className="p-3 text-right">Итог</th></tr>
        </thead>
        <tbody className="divide-y">
          {list.map((g) => {
            const p = progress(g);
            return (
              <tr key={g.id}>
                <td className="p-3 font-medium text-navy">{g.discipline}</td>
                <td className="p-3 text-muted-foreground">{CT[g.controlType]}</td>
                <td className={`p-3 text-right tabular-nums ${p.risk ? "font-semibold text-brand-red" : ""}`}>{p.score}{!g.mark && p.max ? <span className="text-muted-foreground"> из {p.max}</span> : ""}</td>
                <td className="p-3 text-right"><MarkBadge g={g} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="divide-y rounded-lg border md:hidden">
        {list.map((g) => {
          const p = progress(g);
          return (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium text-navy">{g.discipline}</p>
                <p className="text-xs text-muted-foreground">{CT[g.controlType]} · <span className={`tabular-nums ${p.risk ? "font-semibold text-brand-red" : ""}`}>{p.score}{!g.mark && p.max ? ` из ${p.max}` : ` ${plural(p.score, "балл", "балла", "баллов")}`}</span></p>
              </div>
              <MarkBadge g={g} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Зачётка: прогноз диплома с отличием и все закрытые семестры. */
function Record({ closed, level }: { closed: GradeRow[]; level: "BACHELOR" | "MASTER" | "POSTGRAD" }) {
  const f = honorsForecast(closed);
  const sems = [...new Set(closed.map((g) => g.semester))].sort((a, b) => b - a);
  const pct = Math.round(f.share * 100);
  const title = level === "POSTGRAD" ? "Отличная аттестация" : "Красный диплом";
  const blockers = [f.threes ? `${f.threes} ${plural(f.threes, "тройка", "тройки", "троек")}` : "", f.debts ? `${f.debts} ${plural(f.debts, "долг", "долга", "долгов")}` : ""].filter(Boolean).join(" и ");
  const verdict = {
    none: { text: "Прогноз появится после первой сессии.", tone: "border-input" },
    on_track: { text: "Вы выходите на красный диплом. Держите темп и защитите ВКР на «отлично».", tone: "border-status-ok/50 bg-status-ok/5" },
    close: { text: `Почти: нужно ещё ${f.needFives} «отлично» подряд без четвёрок.`, tone: "border-status-warn/50 bg-status-warn/5" },
    off: { text: blockers ? `Мешает: ${blockers}. Для красного диплома нужны только «хорошо» и «отлично» — узнайте в деканате про пересдачу на повышение.` : `Пока не хватает «отлично»: нужно ещё ${f.needFives} подряд.`, tone: "border-brand-red/40 bg-brand-red/5" },
  }[f.status];
  return (
    <div className="space-y-5">
      <section className={`rounded-lg border p-4 ${verdict.tone}`} aria-labelledby="honors">
        <h2 id="honors" className="flex items-center gap-2 font-semibold text-navy"><Award className="size-5" aria-hidden />{title}</h2>
        {f.total > 0 && (
          <>
            <div className="mt-3 flex items-end justify-between gap-2 text-sm"><span>«Отлично» — <b className="tabular-nums">{pct}%</b> оценок</span><span className="text-right text-muted-foreground">нужно от {HONORS_SHARE * 100}%</span></div>
            <div className="relative mt-1 h-2.5 rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Доля оценок «отлично»">
              <div className={`h-2.5 rounded-full ${f.status === "on_track" ? "bg-status-ok" : f.status === "close" ? "bg-status-warn" : "bg-brand-red"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              <span aria-hidden className="absolute -top-1 h-4.5 w-0.5 bg-navy" style={{ left: `${HONORS_SHARE * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Отлично: {f.fives} · хорошо: {f.fours} · удовл.: {f.threes} · долги: {f.debts}</p>
          </>
        )}
        <p className="mt-2 text-sm">{verdict.text}</p>
        <p className="mt-1 text-xs text-muted-foreground">Правило: не меньше 75% «отлично», остальные не ниже «хорошо», ВКР и госэкзамены — «отлично». Прогноз ориентировочный.</p>
      </section>

      {sems.length === 0 ? <Empty text="Закрытых сессий пока нет — первая впереди." /> : sems.map((s) => (
        <section key={s} aria-labelledby={`sem-${s}`}>
          <h2 id={`sem-${s}`} className="mb-2 font-semibold text-navy">{s}-й семестр</h2>
          <ul className="divide-y rounded-lg border">
            {closed.filter((g) => g.semester === s).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{g.discipline}</p>
                  <p className="text-xs text-muted-foreground">{CT[g.controlType]}{g.score != null ? ` · ${g.score} ${plural(g.score, "балл", "балла", "баллов")}` : ""}</p>
                </div>
                <MarkBadge g={g} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Социальный рейтинг: итог, баллы по категориям и история начислений. ДОПУЩЕНИЕ: структура условная. */
function Social({ items, total }: { items: { id: number; semester: number; category: string; title: string; points: number; awardedBy: string | null; date: Date }[]; total: number }) {
  const byCat = new Map<string, number>();
  for (const s of items) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.points);
  return (
    <div className="space-y-5">
      <section className="rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Социальный рейтинг</p>
        <p className="text-3xl font-bold tabular-nums text-navy">{total} <span className="text-base font-medium text-muted-foreground">{plural(total, "балл", "балла", "баллов")}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">За внеучебную активность: волонтёрство, студенческие организации, спорт, мероприятия. Отдельно от учебных оценок; в него входит и оценка преподавателя.</p>
        {byCat.size > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, p]) => (
              <li key={c} className="flex items-center justify-between rounded-sm bg-muted px-3 py-2 text-sm"><span>{c}</span><b className="tabular-nums text-navy">+{p}</b></li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="social-list">
        <h2 id="social-list" className="mb-2 font-semibold text-navy">Начисления</h2>
        {items.length === 0 ? <Empty text="Баллов пока нет — участвуйте в жизни факультета, и они появятся здесь." /> : (
          <ul className="divide-y rounded-lg border">
            {items.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.category}{s.awardedBy ? ` · ${s.awardedBy}` : ""} · {fmtD(s.date)}</p>
                </div>
                <b className="shrink-0 tabular-nums text-status-ok">+{s.points}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
