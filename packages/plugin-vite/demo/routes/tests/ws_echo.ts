import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    return ctx.upgrade({
      message(socket, e) {
        socket.send("echo: " + e.data);
      },
    });
  },
});
