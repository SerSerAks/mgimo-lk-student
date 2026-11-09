// Чистые функции расписания — работают и на сервере, и в браузере.

/** Минуты от начала суток для "HH:MM". */
export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Короткое ФИО для строки расписания: «Воронцова Елена Игоревна» → «Воронцова Е. И.» */
export const shortName = (full: string) => {
  const [last, ...rest] = full.split(" ");
  return [last, ...rest.map((x) => `${x[0]}.`)].join(" ");
};

/**
 * Ссылка на аудиторию на официальной карте МГИМО (mgimo.ru/territory). Это поиск самой карты:
 * он сам переводит на нужный этаж и подсвечивает аудиторию (507 → n507, «зал 2» → zal_gl_1_2).
 * Данные карты к себе не копируем — только ссылка. Для дистанта и «Б/а» карты нет.
 */
export function mapLink(auditorium: string, building: string) {
  const a = auditorium.trim();
  if (!a || /виртуал/i.test(building) || /^б\s*\/\s*а$/i.test(a)) return null;
  return `https://mgimo.ru/territory/?q=${encodeURIComponent(a)}`;
}

/** Текущее время в Москве в минутах от начала суток. */
export function nowMinMsk(now = new Date()) {
  const hhmm = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return toMin(hhmm);
}

/**
 * Какую пару подсветить сегодня: идущую сейчас, а если сейчас перерыв или день ещё не начался — ближайшую следующую.
 * Отменённые и перенесённые с этого дня пары не подсвечиваются. После последней пары — ничего.
 */
export function pickHighlight<T extends { time: string; end: string; off?: boolean }>(items: T[], nowMin: number) {
  const active = items.filter((i) => !i.off);
  const current = active.find((i) => toMin(i.time) <= nowMin && nowMin < toMin(i.end));
  const upcoming = current ? undefined : active.find((i) => toMin(i.time) > nowMin);
  return { current, upcoming };
}
