import { middleware, ParentState } from "./$_middleware.ts";

// A middleware sitting in a dynamic `[id]` folder. Its `ctx.params` is typed
// from the folder path (so `ctx.params.id` is a known `string`), and the value
// is the segment matched for whichever route below this folder is being served.
export default middleware(function (ctx) {
  return ctx.next({ ...ctx.state, item: ctx.params.id });
});

export interface State extends ParentState {
  item: string;
}
