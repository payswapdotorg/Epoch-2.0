import type { Result } from "./contract";

/** Wrap a successful machine result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap a deterministic refusal with a single reason code. */
export function refuse<C extends string>(code: C, reason: string): Result<never, C> {
  return { ok: false, reason, codes: [code] };
}
