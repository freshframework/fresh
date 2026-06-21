import { middleware, ParentState } from "./$_middleware.ts";

export default middleware(async function (ctx) {
  console.log("In root middleware");
  return ctx.next({ foo: "bar" });
});

export interface State extends ParentState {
  foo: string;
}
