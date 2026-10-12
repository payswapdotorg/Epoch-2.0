declare const sha256HexTag: unique symbol;

/** Branded lowercase-hex sha256 digest string. */
export type Sha256Hex = string & { readonly [sha256HexTag]: true };
