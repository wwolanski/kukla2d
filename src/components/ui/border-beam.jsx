export function BorderBeam({
  duration = 4,
  className = "",
  color = "",
  highlightColor = "",
}) {
  return (
    <span
      aria-hidden="true"
      className={`border-beam pointer-events-none absolute inset-0 rounded-[inherit] ${className}`}
      style={{
        "--border-beam-duration": `${duration}s`,
        ...(color ? { "--border-beam-color": color } : {}),
        ...(highlightColor
          ? { "--border-beam-highlight": highlightColor }
          : {}),
      }}
    />
  );
}
