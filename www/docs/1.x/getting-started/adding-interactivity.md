---
description: |
  Add JavaScript based interactivity to your project without sacrificing user
  experience, by using Fresh's powerful islands system.
---

Up to now none of the pages in the demo project have contained any client side
JavaScript. This is great for resiliency and performance, but it can also limit
the possibilities of interactivity. In many current generation web frameworks,
you get the choice of shipping no JavaScript to the client or shipping a
renderer for the entire page.

This is not very flexible, especially considering that most pages will only have
small pieces of content that require interactivity. For example, an otherwise
static page might need a little bit of JavaScript to power an image carousel or
"buy now" button. This model is often called
[islands architecture][islands-architecture]. This refers to a page having
little "islands" of interactivity, in a sea of otherwise static content.

Fresh embraces this model. All pages are rendered server side, but you can
create "island components" that are _also_ rendered client side. To do this,
Fresh projects have a special `islands/` folder. The modules in this folder each
encapsulate a single island component. The name of the module should be the
[pascal case][pascal-case] or [kebab case][kebab-case] name of the island
component. For example a counter component would be defined in the file
`islands/Counter.tsx`. A buy now button could be defined in the file
`islands/buy-now-button.tsx`.

Here is an example of an island component that counts down to a specific time.

```tsx islands/Countdown.tsx
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const timeFmt = new Intl.RelativeTimeFormat("en-US");

// The target date is passed as a string instead of as a `Date`, because the
// props to island components need to be JSON (de)serializable.
export default function Countdown(props: { target: string }) {
  const target = new Date(props.target);
  const now = useSignal(new Date());

  // Set up an interval to update the `now` date every second with the current
  // date as long as the component is mounted.
  useEffect(() => {
    const timer = setInterval(() => {
      if (now.value > target) {
        clearInterval(timer);
      }
      now.value = new Date();
    }, 1000);
    return () => clearInterval(timer);
  }, [props.target]);

  const secondsLeft = Math.floor(
    (target.getTime() - now.value.getTime()) / 1000,
  );

  // If the target date has passed, we stop counting down.
  if (secondsLeft <= 0) {
    return <span>🎉</span>;
  }

  // Otherwise, we format the remaining time using `Intl.RelativeTimeFormat` and
  // render it.
  return <span>{timeFmt.format(secondsLeft, "seconds")}</span>;
}
```

To include this in a page component, one can just use the component normally.
Fresh will take care of automatically mounting the island component on the
client with the correct props:

```tsx routes/countdown.tsx
import Countdown from "../islands/Countdown.tsx";

export default function Page() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  return (
    <p>
      The big event is happening <Countdown target={date.toISOString()} />.
    </p>
  );
}
```

The page that is rendered on the client now has an interactive countdown.

[islands-architecture]: https://jasonformat.com/islands-architecture
[pascal-case]: https://en.wiktionary.org/wiki/Pascal_case
[kebab-case]: https://en.wiktionary.org/wiki/kebab_case
