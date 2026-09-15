import { Check, X } from 'lucide-react';

import { useEditorStore } from '@/store/editorStore.js';
import { useProjectStore } from '@/store/projectStore.js';

import { computeWorldMatrices, mat3Identity } from '@/domain/transforms.js';

import { getBoneSegment } from '@/features/canvas/domain/picking.js';
import {
  assignOrAddProjectNodeBoneInfluence,
} from '@/features/rigging/index.js';

export function BoneAssignPrompt({ view }) {
  const interaction = useEditorStore(s => s.interaction);
  const setInteraction = useEditorStore(s => s.setInteraction);
  const setActiveLayerTab = useEditorStore(s => s.setActiveLayerTab);
  const expandGroup = useEditorStore(s => s.expandGroup);
  const project = useProjectStore(s => s.project);
  const updateProject = useProjectStore(s => s.updateProject);

  if (interaction?.kind !== 'pendingAssignBone') return null;

  const bone = project.bones?.find(b => b.id === interaction.boneId);
  const nodes = interaction.candidateNodeIds
    .map(id => project.nodes.find(n => n.id === id))
    .filter(Boolean);
  if (!bone || nodes.length === 0) return null;

  const boneMap = new Map((project.bones ?? []).map(item => [item.id, item]));
  const segment = getBoneSegment(bone, boneMap);
  const from = {
    x: ((segment.x1 + segment.x2) / 2) * view.zoom + view.panX,
    y: ((segment.y1 + segment.y2) / 2) * view.zoom + view.panY,
  };
  const worldMap = computeWorldMatrices(project.nodes);
  const centers = nodes.map(node => {
    const wm = worldMap.get(node.id) ?? mat3Identity();
    const lx = (node.imageWidth ?? 0) / 2;
    const ly = (node.imageHeight ?? 0) / 2;
    const wx = wm[0] * lx + wm[3] * ly + wm[6];
    const wy = wm[1] * lx + wm[4] * ly + wm[7];
    return {
      id: node.id,
      name: node.name,
      x: wx * view.zoom + view.panX,
      y: wy * view.zoom + view.panY,
    };
  });

  const targetX = centers.reduce((sum, c) => sum + c.x, 0) / centers.length;
  const targetY = centers.reduce((sum, c) => sum + c.y, 0) / centers.length;
  const midX = (from.x + targetX) / 2;
  const midY = (from.y + targetY) / 2;
  const lineDx = targetX - from.x;
  const lineDy = targetY - from.y;
  const lineLen = Math.max(1, Math.hypot(lineDx, lineDy));
  const side = from.y > targetY ? 1 : -1;
  const boxX = midX + (-lineDy / lineLen) * 72 * side;
  const boxY = midY + (lineDx / lineLen) * 72 * side;
  const names = nodes.map(n => n.name).join(', ');
  const influenceOnly = nodes.filter(node => {
    const ownerId = node.boneId
      ?? project.bones.find(candidate => candidate.nodeId === node.id)?.id
      ?? null;
    return ownerId && ownerId !== bone.id;
  });
  const addsInfluenceOnly = influenceOnly.length === nodes.length;
  const contours = nodes.flatMap(node => {
    const wm = worldMap.get(node.id) ?? mat3Identity();
    if (node.alphaContours?.length) {
      return node.alphaContours.map(contour => contour.map(([lx, ly]) => {
        const wx = wm[0] * lx + wm[3] * ly + wm[6];
        const wy = wm[1] * lx + wm[4] * ly + wm[7];
        return `${(wx * view.zoom + view.panX).toFixed(2)},${(wy * view.zoom + view.panY).toFixed(2)}`;
      }).join(' '));
    }
    const width = node.imageWidth ?? 0;
    const height = node.imageHeight ?? 0;
    if (!width || !height) return [];
    return [[
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([lx, ly]) => {
      const wx = wm[0] * lx + wm[3] * ly + wm[6];
      const wy = wm[1] * lx + wm[4] * ly + wm[7];
      return `${(wx * view.zoom + view.panX).toFixed(2)},${(wy * view.zoom + view.panY).toFixed(2)}`;
    }).join(' ')];
  });

  const confirm = () => {
    updateProject(projectDraft => {
      for (const nodeId of interaction.candidateNodeIds) {
        const node = projectDraft.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        assignOrAddProjectNodeBoneInfluence(projectDraft, node.id, interaction.boneId);
      }
    });
    setActiveLayerTab('groups');
    expandGroup(`bone:${interaction.boneId}`);
    setInteraction({ kind: 'idle' });
  };

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-40 h-full w-full">
        {contours.map((points, index) => (
          <polygon
            key={`candidate-${index}`}
            points={points}
            fill="rgba(34,211,238,0.08)"
            stroke="rgba(34,211,238,0.95)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        ))}
        {centers.map(center => (
          <line
            key={center.id}
            x1={from.x}
            y1={from.y}
            x2={center.x}
            y2={center.y}
            stroke="rgba(250,204,21,0.9)"
            strokeWidth="1.25"
            strokeDasharray="4 6"
          >
            <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.6s" repeatCount="indefinite" />
          </line>
        ))}
      </svg>

      <div
        className="absolute z-50 min-w-64 rounded-md border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur"
        style={{ left: boxX, top: boxY, transform: 'translate(-50%, -50%)' }}
      >
        <div className="mb-2 text-[11px] font-medium text-foreground">
          {addsInfluenceOnly
            ? `Add ${bone.name} to Auto Weights for ${names}?`
            : `Attach ${names} to ${bone.name}?`}
        </div>
        <div className="mb-2 max-w-72 text-[10px] leading-relaxed text-muted-foreground">
          {addsInfluenceOnly
            ? 'Existing owner and vertex weights stay unchanged. Run Auto Weights when the bone list is ready.'
            : `Creates the owner link and includes ${bone.name} in Auto Weights.`}
        </div>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setInteraction({ kind: 'idle' })}
            aria-label="Cancel bone assignment"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
            onClick={confirm}
            aria-label="Confirm bone assignment"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
