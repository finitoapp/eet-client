export type TypeName = Capitalize<string>;

export interface Typed<T extends TypeName> {
  readonly type: T;
}

export interface TypeError<Name extends TypeName = TypeName> {
  readonly type: Name;

  /**
   * The value that was received and caused the error. Provides additional
   * context for debugging and validation feedback.
   */
  readonly value: unknown;
}
