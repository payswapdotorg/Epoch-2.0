/**
 * Branded primitives and shared value shapes.
 *
 * Brands are string intersections only. Branded values are constructed
 * exclusively inside the builder machines in src/build/*.ts, after
 * validation — never at arbitrary call sites.
 */

/** Canonical sha-256 digest: 64 lowercase hex characters. */
export type Digest = string & { readonly __brand: "Digest" };

/** Digest of a canonical world-model entity record (authority: world model). */
export type EntityDigest = string & { readonly __brand: "EntityDigest" };

/** Kebab-case record identifier, e.g. "boq-item-wall-w1". */
export type KebabId = string & { readonly __brand: "KebabId" };

/** ISO-8601 timestamp. Always an INPUT — never generated in-package. */
export type Iso8601 = string & { readonly __brand: "Iso8601" };

/** ISO-4217-style currency code, e.g. "EUR". */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

/** Money in integer minor units of a single currency. */
export interface MoneyMinor {
  /** Non-negative integer amount in minor units (e.g. cents). */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** Result shape shared by every deterministic machine. */
export type Result<V, R> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly rejection: R };
