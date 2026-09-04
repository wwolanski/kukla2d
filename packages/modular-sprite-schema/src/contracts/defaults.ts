import type { MatcherProfile, VerdictPolicy } from './index.js';

export const DEFAULT_VERDICT_POLICY: VerdictPolicy = {
  version: 1,
  matchThresholdBp: 9000,
  possibleMatchThresholdBp: 7500,
  highSimilarityBp: 9000,
  highMarginBp: 800,
  mediumSimilarityBp: 7500,
  mediumMarginBp: 300,
};

export const DEFAULT_MATCHER_PROFILE: MatcherProfile = {
  profileId: 'default-v1',
  analyzerWeightsBp: {
    'canvas.aspect-ratio': 700,
    'islands.count': 900,
    'parts.component-count': 900,
    'parts.position': 1300,
    'parts.bounds-overlap': 1000,
    'parts.absolute-size': 1000,
    'parts.aspect-ratio': 800,
    'parts.shape': 1300,
    'relations.size-ratio': 1000,
    'assignment.coverage': 1100,
  },
  passThresholdBp: 7000,
  positionTolerance: 0.18,
  sizeTolerance: 0.35,
  aspectRatioTolerance: 0.35,
  shapeMaskSize: 32,
  sizeRatioRules: [],
  verdictPolicy: DEFAULT_VERDICT_POLICY,
};
