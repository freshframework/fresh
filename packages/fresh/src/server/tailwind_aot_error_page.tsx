const LINK = "https://usefresh.dev/docs/concepts/ahead-of-time-builds";

export default function TailwindErrorPage() {
  return (
    <div class="frsh-error-page">
      <div style="max-width: 48rem; padding: 2rem 1rem; margin: 0 auto; font-family: sans-serif">
        <h1>Finish setting up Fresh</h1>
        <p style="line-height: 1.6;margin-bottom: 1rem;">
          The <b>tailwindcss</b>{" "}
          plugin requires ahead of time builds to be set up for production
          usage. To finish the setup, follow these steps:
        </p>
        <ol style="line-height: 1.6; margin-bottom: 1.5rem">
          <li>
            Go to your project in Deno Deploy and click the{" "}
            <code>Settings</code> tab.
          </li>
          <li>
            In the Git Integration section, enter <code>deno task build</code>
            {" "}
            in the <code>Build Command</code> input.
          </li>
          <li>
            Save the changes.
          </li>
        </ol>
        <p>
          See the detailed guide here: <a href={LINK}>{LINK}</a>.
        </p>
      </div>
    </div>
  );
}
