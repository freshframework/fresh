import { app } from "./$_app.ts";

import "../style.css";

export default app(function App(props) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Fresh app</title>
      </head>
      <body>{props.children}</body>
    </html>
  );
});
