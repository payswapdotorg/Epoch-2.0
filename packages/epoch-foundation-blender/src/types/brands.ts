declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type KebabId = Brand<string, "KebabId">;
export type NonEmptyString = Brand<string, "NonEmptyString">;
export type ToolId = Brand<string, "ToolId">;
export type Semver = Brand<string, "Semver">;
export type FormatId = Brand<string, "FormatId">;
export type LicenseId = Brand<string, "LicenseId">;
export type Digest = Brand<string, "Digest">;
export type UtcTimestamp = Brand<string, "UtcTimestamp">;
