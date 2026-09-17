// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { convertScmlToProject, parseScml } from '@/features/projects';
import { buildFramePose } from '@/features/canvas';
import { buildBoneTreeRows } from '@/features/layers/domain/buildBoneTreeRows';
import { validateProject } from '@/schema/projectSchema';

const samplePath = 'test/fixtures/scml/Forest_Ranger_1/Animations.scml';

describe('Spriter SCML import', () => {
  it('parses and converts Forest_Ranger_1 into native assets, bones, and animation clips', () => {
    const scml = parseScml(readFileSync(samplePath, 'utf8'));
    const sources = new Map(scml.files.map(file => [file.key, { url: `blob:test-${file.key}`, size: 100 }]));
    const project = convertScmlToProject(scml, { sources, sourceFileName: 'Animations.scml' });

    expect(project.textures).toHaveLength(13);
    expect(project.bones).toHaveLength(8);
    expect(project.animations).toHaveLength(18);
    expect(project.animations.map(animation => animation.name)).toContain('Idle');
    expect(project.animations.map(animation => animation.name)).toContain('Walking');
    expect(project.nodes.some(node => node.type === 'part' && node.textureId !== node.id)).toBe(true);
    const stagingParts = project.nodes.filter(node => node.type === 'part' && node.opacity > 0);
    expect(stagingParts.length).toBeGreaterThan(0);
    expect(stagingParts.every(node => node.boneId)).toBe(true);
    expect(stagingParts.every(node => node.transform.x !== 0 || node.transform.y !== 0)).toBe(true);
    expect(project.defaultPose).toEqual({});
    expect(project.canvas.width).toBeGreaterThan(0);
    expect(project.canvas.height).toBeGreaterThan(0);

    const boneByName = new Map(project.bones.map(bone => [bone.name, bone]));
    expect(boneByName.get('bone_001').parentId).toBe(boneByName.get('bone_000').id);
    expect(boneByName.get('bone_003').parentId).toBe(boneByName.get('bone_002').id);
    expect(boneByName.get('bone_005').parentId).toBe(boneByName.get('bone_004').id);
    const body = project.nodes.find(node => node.name === 'Body');
    const head = project.nodes.find(node => node.name === 'Head');
    expect(body.boneId).toBe(boneByName.get('bone_000').id);
    expect(head.boneId).toBe(boneByName.get('bone_001').id);
    expect(body.draw_order).toBe(5);
    expect(head.draw_order).toBe(6);

    const expanded = new Set(project.bones.map(bone => `bone:${bone.id}`));
    const boneRows = buildBoneTreeRows({ bones: project.bones, nodes: project.nodes, expanded });
    expect(boneRows.find(row => row.kind === 'node' && row.node.id === head.id).boneId).toBe(head.boneId);
    expect(boneRows.filter(row => row.kind === 'node' && row.boneId === null)).toHaveLength(0);

    const base = project.animations.find(animation => animation.name === 'Base');
    const animationState = {
      activeAnimationId: base.id,
      currentTime: 0,
      endFrame: 10,
      fps: base.fps,
      loopKeyframes: true,
      draftPose: new Map(),
    };
    const stagingFrame = buildFramePose({ project, editorState: { editorMode: 'edit' }, animationState });
    const animationFrame = buildFramePose({ project, editorState: { editorMode: 'animation' }, animationState });
    for (const stagingNode of stagingFrame.effectiveNodes) {
      const animatedNode = animationFrame.effectiveNodes.find(node => node.id === stagingNode.id);
      expect(animatedNode.opacity).toBeCloseTo(stagingNode.opacity);
      expect(animatedNode.draw_order).toBe(stagingNode.draw_order);
      expect(animatedNode.transform.x).toBeCloseTo(stagingNode.transform.x, 3);
      expect(animatedNode.transform.y).toBeCloseTo(stagingNode.transform.y, 3);
    }

    const rootBone = boneByName.get('bone_000');
    project.defaultPose = { [rootBone.id]: { x: rootBone.setup.x + 25 } };
    const movedStagingFrame = buildFramePose({ project, editorState: { editorMode: 'edit' }, animationState });
    const stagedBody = stagingFrame.effectiveNodes.find(node => node.id === body.id);
    const movedBody = movedStagingFrame.effectiveNodes.find(node => node.id === body.id);
    expect(movedBody.transform.x).toBeCloseTo(stagedBody.transform.x + 25, 3);
    project.defaultPose = {};

    const result = validateProject(project);
    expect(result.success, result.success ? '' : result.error.message).toBe(true);
  });

  it('keeps SCML spin direction and converts Y-up coordinates to canvas Y-down', () => {
    const xml = `<?xml version="1.0"?>
      <spriter_data>
        <folder id="0"><file id="0" name="part.png" width="20" height="10" pivot_x="0.5" pivot_y="0.5"/></folder>
        <entity id="0" name="Actor">
          <obj_info name="root" type="bone" w="10" h="2"/>
          <animation id="0" name="Turn" length="1000" interval="250">
            <mainline>
              <key id="0"><bone_ref id="0" timeline="1" key="0"/><object_ref id="0" parent="0" timeline="0" key="0" z_index="2"/></key>
              <key id="1" time="500"><bone_ref id="0" timeline="1" key="1"/><object_ref id="0" parent="0" timeline="0" key="1" z_index="2"/></key>
            </mainline>
            <timeline id="0" name="part">
              <key id="0" spin="1"><object folder="0" file="0" x="10" y="5" angle="350"/></key>
              <key id="1" time="500" spin="1"><object folder="0" file="0" x="20" y="15" angle="10"/></key>
            </timeline>
            <timeline id="1" obj="0" name="root" object_type="bone">
              <key id="0" spin="1"><bone x="1" y="2" angle="0"/></key>
              <key id="1" time="500" spin="1"><bone x="11" y="12" angle="90"/></key>
            </timeline>
          </animation>
        </entity>
      </spriter_data>`;
    const parsed = parseScml(xml);
    const project = convertScmlToProject(parsed, {
      sources: new Map([['0:0', { url: 'blob:part', size: 1 }]]),
      sourceFileName: 'turn.scml',
    });
    const clip = project.animations[0];
    const node = project.nodes.find(candidate => candidate.type === 'part');
    const rotation = clip.tracks.find(track => track.targetId === node.id && track.property === 'rotation');
    const y = clip.tracks.find(track => track.targetId === node.id && track.property === 'y');

    expect(rotation.keyframes[0].value).toBeCloseTo(-350);
    expect(rotation.keyframes[1].value).toBeCloseTo(-360);
    expect(rotation.keyframes[2].value).toBeCloseTo(-10);
    expect(Number(y.keyframes[1].value)).toBeLessThan(Number(y.keyframes[0].value));

    const bone = project.bones[0];
    const frame = buildFramePose({
      project,
      editorState: { editorMode: 'animation' },
      animationState: {
        activeAnimationId: clip.id,
        currentTime: 250,
        endFrame: 4,
        fps: clip.fps,
        loopKeyframes: true,
        draftPose: new Map(),
      },
    });
    const effectiveNode = frame.effectiveNodes.find(candidate => candidate.id === node.id);
    const shiftX = bone.setup.x - 1;
    const shiftY = bone.setup.y + 2;
    const radians = Math.PI / 4;
    const expectedPivotX = 6 + 15 * Math.cos(radians) - 10 * Math.sin(radians) + shiftX;
    const expectedPivotY = -(7 + 15 * Math.sin(radians) + 10 * Math.cos(radians)) + shiftY;
    expect(effectiveNode.transform.x + effectiveNode.transform.pivotX).toBeCloseTo(expectedPivotX, 3);
    expect(effectiveNode.transform.y + effectiveNode.transform.pivotY).toBeCloseTo(expectedPivotY, 3);
    expect(effectiveNode.transform.rotation).toBeCloseTo(-45, 3);
  });
});
