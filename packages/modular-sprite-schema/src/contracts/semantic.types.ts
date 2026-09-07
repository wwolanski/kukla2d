export type SemanticDefinitionKind =
  "part-role" | "character-type" | "character-class";
export interface SemanticDefinition {
  id: string;
  revision: number;
  kind: SemanticDefinitionKind;
  key: string;
  label: string;
  description?: string;
  parentId?: string;
  aliases: string[];
  origin: "builtin" | "user" | "remote";
}
