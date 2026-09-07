import { useCallback, useMemo } from "react";

import type { PhysicsRule } from "@kukla2d/contracts";

import { PHYSICS_RULES } from "@/io/live2d/cmo3/physics";

import { useProjectStore } from "@/store/projectStore";

import { isRecord } from "@/lib/guards";
import { finiteNumberOr } from "@/lib/math";

interface PhysicsVertex {
  y: number;
  mobility: number;
  delay: number;
  acceleration: number;
}

interface PhysicsEditorRule extends PhysicsRule {
  id: string;
  name: string;
  enabled?: boolean;
  category: string;
  requireTag?: string | null;
  vertices: PhysicsVertex[];
  outputParamId?: string;
  outputScale?: number;
}

type EditableRuleField =
  | "name"
  | "enabled"
  | "category"
  | "requireTag"
  | "outputParamId"
  | "outputScale";

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseVertex(value: unknown): PhysicsVertex | null {
  const record = recordValue(value);
  if (!record) return null;
  return {
    y: finiteNumberOr(record.y, 0),
    mobility: finiteNumberOr(record.mobility, 0.8),
    delay: finiteNumberOr(record.delay, 0.2),
    acceleration: finiteNumberOr(record.acceleration, 1),
  };
}

function parseRule(value: unknown): PhysicsEditorRule | null {
  const record = recordValue(value);
  if (!record || typeof record.id !== "string") return null;
  const vertices = Array.isArray(record.vertices)
    ? record.vertices
        .map(parseVertex)
        .filter((vertex): vertex is PhysicsVertex => vertex !== null)
    : [];
  return {
    ...record,
    id: record.id,
    name: typeof record.name === "string" ? record.name : record.id,
    category: typeof record.category === "string" ? record.category : "hair",
    vertices,
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
    ...(typeof record.requireTag === "string" || record.requireTag === null
      ? { requireTag: record.requireTag }
      : {}),
    ...(typeof record.outputParamId === "string"
      ? { outputParamId: record.outputParamId }
      : {}),
    ...(typeof record.outputScale === "number"
      ? { outputScale: record.outputScale }
      : {}),
  };
}

function parseRules(value: unknown): PhysicsEditorRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseRule)
    .filter((rule): rule is PhysicsEditorRule => rule !== null);
}

const BUILT_IN_RULES = parseRules(PHYSICS_RULES);

function usePhysicsPanelControllerImpl() {
  const storedRules = useProjectStore((state) => state.project.physicsRules);
  const setPhysicsRules = useProjectStore((state) => state.setPhysicsRules);
  const updatePhysicsRule = useProjectStore((state) => state.updatePhysicsRule);
  const deletePhysicsRule = useProjectStore((state) => state.deletePhysicsRule);
  const rules = useMemo(() => parseRules(storedRules), [storedRules]);

  const loadDefaults = useCallback(() => {
    setPhysicsRules(
      BUILT_IN_RULES.map((rule) => ({
        ...rule,
        enabled: true,
        vertices: rule.vertices.map((vertex) => ({ ...vertex })),
      })),
    );
  }, [setPhysicsRules]);

  const clearRules = useCallback(() => setPhysicsRules([]), [setPhysicsRules]);

  const updateField = useCallback(
    (
      ruleId: string,
      field: EditableRuleField,
      value: string | number | boolean | null,
    ) => {
      updatePhysicsRule(ruleId, { [field]: value });
    },
    [updatePhysicsRule],
  );

  const updateVertex = useCallback(
    (
      ruleId: string,
      vertexIndex: number,
      field: keyof PhysicsVertex,
      value: number,
    ) => {
      const rule = rules.find((candidate) => candidate.id === ruleId);
      if (!rule || !Number.isInteger(vertexIndex) || vertexIndex < 0) return;
      const vertices = rule.vertices.map((vertex, index) =>
        index === vertexIndex ? { ...vertex, [field]: value } : vertex,
      );
      updatePhysicsRule(ruleId, { vertices });
    },
    [rules, updatePhysicsRule],
  );

  return {
    rules,
    defaultRuleCount: BUILT_IN_RULES.length,
    isEmpty: rules.length === 0,
    loadDefaults,
    clearRules,
    updateField,
    updateVertex,
    deleteRule: deletePhysicsRule,
  };
}

export const usePhysicsPanelController = (): ReturnType<
  typeof usePhysicsPanelControllerImpl
> => usePhysicsPanelControllerImpl();
