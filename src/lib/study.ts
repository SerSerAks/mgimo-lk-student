// Расчёты «Учёбы»: средний балл и прогноз красного диплома. Чистые функции — проверяются автотестами.

type G = { mark: string | null; isDebt: boolean; controlType: "EXAM" | "CREDIT" | "GRADED_CREDIT" };

/** Средний балл по пятибалльной шкале: все выставленные числовые оценки (экзамены и зачёты с оценкой). */
export function averageMark(grades: G[]) {
  const nums = grades.filter((g) => /^[2-5]$/.test(g.mark ?? "")).map((g) => Number(g.mark));
  return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
}

/**
 * Прогноз диплома с отличием.
 * ДОПУЩЕНИЕ: общее правило вузов РФ — не меньше 75% оценок «отлично», остальные не ниже «хорошо»,
 * без «удовлетворительно» и долгов; ВКР и госэкзамены — на «отлично». Положение МГИМО в открытых источниках
 * не проверено; повторные оценки по одной дисциплине считаются отдельно (упрощение).
 */
export const HONORS_SHARE = 0.75;
export function honorsForecast(grades: G[]) {
  const marks = grades.filter((g) => /^[2-5]$/.test(g.mark ?? "")).map((g) => Number(g.mark));
  const total = marks.length;
  const fives = marks.filter((m) => m === 5).length;
  const fours = marks.filter((m) => m === 4).length;
  const threes = marks.filter((m) => m === 3).length;
  const debts = grades.filter((g) => g.isDebt).length;
  const share = total ? fives / total : 0;
  // сколько ещё пятёрок подряд нужно, чтобы дойти до 75%: (fives + k) / (total + k) ≥ 0.75
  const needFives = share >= HONORS_SHARE ? 0 : Math.ceil((HONORS_SHARE * total - fives) / (1 - HONORS_SHARE));
  const status: "none" | "on_track" | "close" | "off" =
    total === 0 ? "none" : threes > 0 || debts > 0 ? "off" : share >= HONORS_SHARE ? "on_track" : needFives <= 3 ? "close" : "off";
  return { total, fives, fours, threes, debts, share, needFives, status };
}
