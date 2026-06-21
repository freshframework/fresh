import "./button.css";

export function Button(props: { children: string; id: string; onClick: () => void }) {
  return (
    <button class="button" id={props.id} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
