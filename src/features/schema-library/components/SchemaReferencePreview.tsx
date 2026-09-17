import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

function colorFor(index: number): string {
  return ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185"][
    index % 5
  ]!;
}

export function SchemaReferencePreview({
  schema,
  src,
}: {
  schema: ModularSpriteSchema;
  src?: string | undefined;
}): React.ReactElement {
  if (src) {
    return (
      <img
        src={src}
        alt="Reference source"
        className="h-full max-h-[360px] w-full object-contain"
      />
    );
  }

  const slots = [...schema.slots].sort((left, right) => left.drawOrder - right.drawOrder);
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Reference source layout preview"
      className="h-full max-h-[360px] w-full"
    >
      <rect width="100" height="100" rx="3" fill="hsl(var(--muted))" />
      {slots.flatMap((slot, slotIndex) =>
        slot.components.map((component) => {
          const { bounds, centroid } = component;
          const color = colorFor(slotIndex);
          return (
            <g key={`${slot.slotKey}:${component.componentKey}`}>
              <rect
                x={bounds.x * 100}
                y={bounds.y * 100}
                width={bounds.width * 100}
                height={bounds.height * 100}
                fill={color}
                fillOpacity="0.24"
                stroke={color}
                strokeWidth="0.7"
              />
              <circle cx={centroid.x * 100} cy={centroid.y * 100} r="1.3" fill={color} />
              <text
                x={bounds.x * 100 + 1}
                y={bounds.y * 100 + 4}
                fill="currentColor"
                fontSize="2.8"
              >
                {slot.drawOrder}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
