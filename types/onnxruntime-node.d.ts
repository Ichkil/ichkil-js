/**
 * Type shim for `onnxruntime-node` (pinned to 1.19.2).
 *
 * The published package declares `"types": "dist/index.d.ts"` but ships no
 * `.d.ts` files at all; its runtime module is exactly
 * `onnxruntime-common` re-exported with the native backend registered, so
 * we describe it with the well-typed common package. This shim is picked up
 * by the local `tsc --noEmit` typecheck and by tsup's dts build (both read
 * `tsconfig.json`, which includes this folder).
 */
declare module "onnxruntime-node" {
  export * from "onnxruntime-common";
}
