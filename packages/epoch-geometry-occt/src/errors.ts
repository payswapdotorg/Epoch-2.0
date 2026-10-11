export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeometryError';
  }
}

export class InvalidGeometryError extends GeometryError {
  constructor(message: string) {
    super(`Invalid geometry: ${message}`);
    this.name = 'InvalidGeometryError';
  }
}

export class UnsupportedOperationError extends GeometryError {
  readonly op: string;
  readonly reason: string;
  constructor(op: string, reason: string) {
    super(`Unsupported operation '${op}': ${reason}`);
    this.name = 'UnsupportedOperationError';
    this.op = op;
    this.reason = reason;
  }
}

export class UnknownShapeError extends GeometryError {
  readonly digest: string;
  constructor(digest: string) {
    super(`Unknown shape reference: ${digest}`);
    this.name = 'UnknownShapeError';
    this.digest = digest;
  }
}
