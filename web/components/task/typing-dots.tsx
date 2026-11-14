// "The agent is working": three dots in an agent-coloured bubble.
export const TypingDots = () => (
  <div
    role="status"
    aria-label="The agent is working"
    className="mb-2 -mt-1 inline-flex gap-1 self-start rounded-[14px] rounded-bl-sm bg-muted px-3 py-2.5"
  >
    {[0, 1, 2].map((i) => (
      <i
        key={i}
        style={{ animationDelay: `${i * 0.15}s` }}
        className="block size-1.5 rounded-full bg-muted-foreground motion-safe:animate-dot"
      />
    ))}
  </div>
);
