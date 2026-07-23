import type { TypeError as AppTypeError, TypeName } from "./type.ts";

declare const emptyObjectSymbol: unique symbol;
export type EmptyObject = { [emptyObjectSymbol]?: never };

export type ErrorFactory<TType extends TypeName, TShape extends object> = keyof TShape extends never
  ? () => AppTypeError<TType>
  : EmptyObject extends TShape
    ? () => AppTypeError<TType>
    : (shape: TShape) => AppTypeError<TType> & TShape;

/**
 * Creates a typed error factory with an optional payload shape.
 *
 * Example:
 * const createRpcResponseTimeoutError = defineError("RpcResponseTimeoutError")<{
 * 	method: string;
 * }>();
 *
 * const error = createRpcResponseTimeoutError({ method: "ping" });
 * // { type: "RpcResponseTimeoutError", method: "ping" }
 */
export const defineError =
  <TType extends TypeName>(type: TType) =>
  <TShape extends object = EmptyObject>() =>
    ((shape?: TShape) => ({
      type,
      ...(shape ?? {}),
    })) as ErrorFactory<TType, TShape>;
