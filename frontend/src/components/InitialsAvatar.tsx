function nameToHue(name: string): number {
  return name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function InitialsAvatar({
  name,
  className = "size-10",
  textClassName = "text-sm",
}: {
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const hue = nameToHue(name);
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ background: `hsl(${hue}, 30%, 72%)` }}
    >
      <span className={`font-serif italic leading-none text-white/90 ${textClassName}`}>
        {getInitials(name)}
      </span>
    </div>
  );
}
