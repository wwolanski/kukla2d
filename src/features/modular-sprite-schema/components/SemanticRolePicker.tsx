import { useMemo } from "react";

import type {
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SemanticRoleIcon } from "./SemanticRoleIcon.js";

type SelectRootProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
};
const UiSelect = Select as React.ComponentType<SelectRootProps>;
const UiSelectTrigger = SelectTrigger as React.ComponentType<
  React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }
>;
const UiSelectContent = SelectContent as React.ComponentType<
  React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }
>;
const UiSelectItem = SelectItem as React.ComponentType<{
  value: string;
  className?: string;
  children?: React.ReactNode;
}>;
const UiSelectValue = SelectValue as React.ComponentType<{
  children?: React.ReactNode;
}>;

export function SemanticRolePicker({
  role,
  semanticRoleId,
  semantics,
  onChange,
  onSaveSemantic,
}: {
  role: string;
  semanticRoleId?: string;
  semantics: SemanticCatalog;
  onChange: (value: { role: string; semanticRoleId?: string }) => void;
  onSaveSemantic: (definition: SemanticDefinition) => Promise<void>;
}): React.ReactElement {
  const definitions = useMemo(
    () => semantics.list("part-role"),
    [role, semanticRoleId, semantics],
  );
  const selected = definitions.find(
    (item) => item.id === semanticRoleId || item.key === role,
  );
  const persistCustom = (): void => {
    const key = role
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!key || selected) return;
    const definition = {
      id: `user.part-role.${key}`,
      revision: 1 as const,
      kind: "part-role" as const,
      key,
      label: role.trim(),
      aliases: [],
      origin: "user" as const,
    };
    void onSaveSemantic(definition);
    onChange({ role: key, semanticRoleId: definition.id });
  };
  return (
    <div className="grid gap-1">
      <UiSelect
        value={selected?.id ?? "custom-value"}
        onValueChange={(value) => {
          const definition = definitions.find((item) => item.id === value);
          if (definition)
            onChange({ role: definition.key, semanticRoleId: definition.id });
          else onChange({ role });
        }}
      >
        <UiSelectTrigger className="h-10">
          <UiSelectValue />
        </UiSelectTrigger>
        <UiSelectContent className="max-h-72">
          {definitions.map((item) => (
            <UiSelectItem key={item.id} value={item.id}>
              <span className="flex items-center gap-2">
                <SemanticRoleIcon role={item.key} />
                {item.label}
              </span>
            </UiSelectItem>
          ))}
          <UiSelectItem value="custom-value">
            <span className="flex items-center gap-2">
              <SemanticRoleIcon />
              Custom…
            </span>
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      {!selected && (
        <input
          className="h-9 rounded-md border bg-background px-2"
          aria-label="Custom semantic role"
          value={role}
          onChange={(event) => onChange({ role: event.target.value })}
          onBlur={persistCustom}
        />
      )}
    </div>
  );
}
