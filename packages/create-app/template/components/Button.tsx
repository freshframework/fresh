import { ComponentChildren } from "preact";

export function Button(props: { children: ComponentChildren; onClick?: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        background: "#0070f3",
        color: "white",
        border: "none",
        borderRadius: "4px",
        padding: "8px 16px",
        fontSize: "16px",
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}
