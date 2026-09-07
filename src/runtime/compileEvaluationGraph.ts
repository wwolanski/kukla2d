import type {
  BoneId,
  ConstraintId,
  NodeId,
  ProjectDocument,
} from "@kukla2d/contracts";

import { isRecord } from "@/lib/guards";

type EvaluationNode =
  | { type: "bone"; id: BoneId }
  | { type: "constraint"; id: ConstraintId }
  | { type: "physics"; id: string }
  | { type: "deformer"; id: NodeId };

type EvaluationGraphDiagnostic =
  | { code: "GRAPH_CYCLE"; graphId: string; remainingInDegree: number }
  | { code: "MISSING_BONE"; graphId: string; boneId: string }
  | { code: "INVALID_PHYSICS_GROUP"; index: number };

interface EvaluationGraphResult {
  order: readonly EvaluationNode[];
  diagnostics: readonly EvaluationGraphDiagnostic[];
  errors: readonly string[];
}

type GraphProject = Pick<
  ProjectDocument,
  "bones" | "constraints" | "physics_groups" | "nodes"
>;

export function compileEvaluationGraph(
  project: Partial<GraphProject>,
): EvaluationGraphResult {
  const graphNodes = new Map<string, EvaluationNode>();
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  const diagnostics: EvaluationGraphDiagnostic[] = [];

  function addNode(graphId: string, node?: EvaluationNode): void {
    if (!adjacency.has(graphId)) adjacency.set(graphId, new Set());
    if (!inDegree.has(graphId)) inDegree.set(graphId, 0);
    if (node) graphNodes.set(graphId, node);
  }
  function addEdge(fromId: string, toId: string): void {
    addNode(fromId);
    addNode(toId);
    const targets = adjacency.get(fromId);
    if (!targets || targets.has(toId)) return;
    targets.add(toId);
    inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
  }

  const boneIds = new Set<string>((project.bones ?? []).map((bone) => bone.id));
  for (const bone of project.bones ?? []) {
    const graphId = `bone:${bone.id}`;
    addNode(graphId, { type: "bone", id: bone.id });
    if (bone.parentId)
      addBoneDependency(`bone:${bone.parentId}`, graphId, bone.parentId);
  }
  for (const constraint of project.constraints ?? []) {
    const graphId = `constraint:${constraint.id}`;
    addNode(graphId, { type: "constraint", id: constraint.id });
    const affectedIds = new Set<string>(constraint.affectedBoneIds);
    if (constraint.targetBoneId && !affectedIds.has(constraint.targetBoneId)) {
      addBoneDependency(
        `bone:${constraint.targetBoneId}`,
        graphId,
        constraint.targetBoneId,
      );
    }
    for (const boneId of constraint.affectedBoneIds)
      addBoneDependency(graphId, `bone:${boneId}`, boneId);
  }
  for (const [index, group] of (project.physics_groups ?? []).entries()) {
    const parsed = parsePhysicsDependencies(group);
    if (!parsed) {
      diagnostics.push({ code: "INVALID_PHYSICS_GROUP", index });
      continue;
    }
    const graphId = `physics:${parsed.id}`;
    addNode(graphId, { type: "physics", id: parsed.id });
    for (const boneId of parsed.boneIds)
      addBoneDependency(graphId, `bone:${boneId}`, boneId);
  }
  for (const node of project.nodes ?? []) {
    if (node.type !== "warpDeformer") continue;
    const graphId = `deformer:${node.id}`;
    addNode(graphId, { type: "deformer", id: node.id });
  }

  function addBoneDependency(
    fromId: string,
    toId: string,
    boneId: string,
  ): void {
    if (!boneIds.has(boneId))
      diagnostics.push({ code: "MISSING_BONE", graphId: fromId, boneId });
    addEdge(fromId, toId);
  }

  const queue = [...inDegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: EvaluationNode[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const node = graphNodes.get(current);
    if (node) order.push(node);
    for (const neighbor of adjacency.get(current) ?? []) {
      const degree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        queue.push(neighbor);
        queue.sort();
      }
    }
  }
  for (const [graphId, degree] of inDegree) {
    if (degree > 0)
      diagnostics.push({
        code: "GRAPH_CYCLE",
        graphId,
        remainingInDegree: degree,
      });
  }
  return { order, diagnostics, errors: diagnostics.map(formatGraphDiagnostic) };
}

function parsePhysicsDependencies(
  value: unknown,
): { id: string; boneIds: string[] } | null {
  if (
    !isRecord(value) ||
    (typeof value.id !== "string" && typeof value.name !== "string")
  )
    return null;
  const id =
    typeof value.id === "string"
      ? value.id
      : typeof value.name === "string"
        ? value.name
        : null;
  if (!id) return null;
  if (!Array.isArray(value.outputs)) return { id, boneIds: [] };
  const boneIds: string[] = [];
  for (const output of value.outputs) {
    if (isRecord(output) && typeof output.boneId === "string")
      boneIds.push(output.boneId);
  }
  return { id, boneIds };
}

function formatGraphDiagnostic(diagnostic: EvaluationGraphDiagnostic): string {
  switch (diagnostic.code) {
    case "GRAPH_CYCLE":
      return `GRAPH_CYCLE: ${diagnostic.graphId} (remaining in-degree: ${diagnostic.remainingInDegree})`;
    case "MISSING_BONE":
      return `MISSING_BONE: ${diagnostic.boneId} referenced by ${diagnostic.graphId}`;
    case "INVALID_PHYSICS_GROUP":
      return `INVALID_PHYSICS_GROUP: index ${diagnostic.index}`;
  }
}
