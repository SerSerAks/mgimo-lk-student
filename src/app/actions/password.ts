"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { homeFor, requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

// ---------- смена своего пароля ----------

export type PwState = { error?: string } | undefined;

export async function changeOwnPassword(_: PwState, form: FormData): Promise<PwState> {
  const user = await requireUser(undefined, { allowPasswordChange: true });
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? ""), repeat = String(form.get("repeat") ?? "");
  const me = await db.person.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(me.passwordHash, current))) return { error: "Текущий пароль неверный" };
  if (next.length < 10) return { error: "Новый пароль — не короче 10 символов" };
  if (next !== repeat) return { error: "Пароли не совпадают" };
  if (next === current) return { error: "Новый пароль должен отличаться от выданного" };
  if (next.toLowerCase().includes(me.login.toLowerCase())) return { error: "Пароль не должен содержать логин" };
  await db.person.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  redirect(homeFor(user.role));
}
