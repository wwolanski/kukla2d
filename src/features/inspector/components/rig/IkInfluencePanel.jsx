import { SectionTitle } from "@/features/inspector/components/fields/InspectorRow.jsx";

export function IkInfluencePanel({ constraints, activeBone }) {
  if (activeBone) {
    const affecting = constraints.filter(
      (constraint) =>
        constraint.type === "ik" &&
        constraint.affectedBoneIds?.includes(activeBone.id),
    );
    return (
      <div className="space-y-2">
        <SectionTitle help="IK constraints affecting this bone and their role (root or descendant in the chain).">
          IK influence
        </SectionTitle>
        {affecting.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No IK constraint affects this bone.
          </p>
        ) : (
          affecting.map((constraint) => (
            <div
              key={constraint.id}
              className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: `#${(constraint.color ?? 0x22d3ee).toString(16).padStart(6, "0")}`,
                  }}
                />
                {constraint.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {constraint.assignedBoneId === activeBone.id
                  ? "root"
                  : "descendant"}
              </span>
            </div>
          ))
        )}
      </div>
    );
  }

  return null;
}
