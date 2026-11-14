// The kaizen wordmark in block letters: the side menu's logo, and the header's title on a phone's Home.
export function Wordmark(props: { label?: string }) {
  const img = props.label ? { role: "img", "aria-label": props.label } : {};
  return (
    <pre className="mark" {...img}>
      <span>{"█ █  ▄▀█  █  ▀▀█  █▀▀  █▄ █"}</span>
      {"\n"}
      <span>{"█▀▄  █▀█  █   ▄▀  ██▄  █ ▀█"}</span>
      {"\n"}
      <span>{"█ █  █ █  █  █▄▄  █▄▄  █  █"}</span>
    </pre>
  );
}
