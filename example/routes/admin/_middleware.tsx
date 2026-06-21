import { middleware, ParentState } from "./$_middleware.ts";

export default middleware(async function (ctx) {
  console.log("In admin middleware");
  return ctx.next({ ...ctx.state, isAdmin: true });
});

export interface State extends ParentState {
  foo: string;
  isAdmin: true;
}
