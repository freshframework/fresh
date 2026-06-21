import { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

export function Wrapper(props: { children: ComponentChildren }) {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => setShowing((showing) => !showing), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div>
      Children:
      {showing ? "Showing" : "Not showing"}
      {showing && props.children}
    </div>
  );
}
