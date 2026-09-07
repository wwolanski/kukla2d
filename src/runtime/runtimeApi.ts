import type {
  Animation,
  AnimationId,
  Bone,
  Node,
  ProjectDocument,
} from "@kukla2d/contracts";

import { evaluateLayers } from "./animationMixer.js";
import { evaluatePose } from "./pose.js";

import type {
  AnimationLayer,
  RuntimeAnimationEvent,
} from "./animationMixer.types.js";
import type { EvaluatedPose } from "./pose.types.js";
import type {
  StateMachineState,
  StateMachineTransition,
} from "./stateMachine.types.js";
import type { PoseOverrides } from "../domain/animationEngine.types.js";

interface RuntimeDocument {
  animations: readonly Animation[];
  bones: readonly Bone[];
  nodes: readonly Node[];
  defaultPose?: ProjectDocument["defaultPose"];
}

interface RuntimeInstance {
  id: string;
  layers: AnimationLayer[];
  parameters: Record<string, number>;
  stateMachine: {
    states: readonly StateMachineState[];
    transitions: readonly StateMachineTransition[];
  } | null;
  currentStateId: string | null;
  stateTime: number;
  activeSkinId: string | null;
  state: "active" | "disposed";
}

interface PlayOptions {
  layer?: number;
  weight?: number;
  mode?: "override" | "additive";
  mask?: readonly string[];
  timeScale?: number;
  loop?: boolean;
}

interface RuntimeUpdate {
  state: "updated";
  pose: EvaluatedPose;
  events: readonly RuntimeAnimationEvent[];
  overrides: PoseOverrides;
}

type RuntimeCommandResult =
  | { ok: true; state: "created" | "disposed" | "playing" | "updated" }
  | {
      ok: false;
      state:
        | "runtime-disposed"
        | "instance-not-found"
        | "instance-disposed"
        | "clip-not-found";
    };

export class Kukla2dRuntime {
  readonly instances = new Map<string, RuntimeInstance>();
  private eventSubscribers = new Set<(event: RuntimeAnimationEvent) => void>();
  private disposed = false;

  constructor(private readonly document: RuntimeDocument) {}

  createInstance(id: string): RuntimeInstance {
    if (this.disposed) throw new Error("Runtime is disposed");
    const instance: RuntimeInstance = {
      id,
      layers: [],
      parameters: {},
      stateMachine: null,
      currentStateId: null,
      stateTime: 0,
      activeSkinId: null,
      state: "active",
    };
    this.instances.set(id, instance);
    return instance;
  }

  disposeInstance(id: string): RuntimeCommandResult {
    const instance = this.instances.get(id);
    if (!instance) return { ok: false, state: "instance-not-found" };
    instance.state = "disposed";
    this.instances.delete(id);
    return { ok: true, state: "disposed" };
  }

  play(
    instanceId: string,
    clipId: AnimationId,
    options: PlayOptions = {},
  ): RuntimeCommandResult {
    const instance = this.instances.get(instanceId);
    if (this.disposed) return { ok: false, state: "runtime-disposed" };
    if (!instance) return { ok: false, state: "instance-not-found" };
    if (instance.state === "disposed")
      return { ok: false, state: "instance-disposed" };
    if (!this.document.animations.some((animation) => animation.id === clipId))
      return { ok: false, state: "clip-not-found" };
    instance.layers.push({
      order: options.layer ?? 0,
      weight: options.weight ?? 1,
      mode: options.mode ?? "override",
      maskBoneIds: options.mask ? new Set(options.mask) : null,
      clipId,
      time: 0,
      timeScale: options.timeScale ?? 1,
      loop: options.loop ?? true,
    });
    return { ok: true, state: "playing" };
  }

  setParameter(
    instanceId: string,
    paramName: string,
    value: number,
  ): RuntimeCommandResult {
    const instance = this.instances.get(instanceId);
    if (!instance) return { ok: false, state: "instance-not-found" };
    if (instance.state === "disposed")
      return { ok: false, state: "instance-disposed" };
    instance.parameters[paramName] = value;
    return { ok: true, state: "updated" };
  }

  update(instanceId: string, deltaSeconds: number): RuntimeUpdate | null {
    const instance = this.instances.get(instanceId);
    if (this.disposed || !instance || instance.state === "disposed")
      return null;
    const evaluation = evaluateLayers(
      instance.layers,
      this.document.animations,
      deltaSeconds,
    );
    const pose = evaluatePose(this.document, evaluation.overrides);
    for (const event of evaluation.events) {
      for (const subscriber of this.eventSubscribers) subscriber(event);
    }
    return {
      state: "updated",
      pose,
      events: evaluation.events,
      overrides: evaluation.overrides,
    };
  }

  subscribeEvent(
    subscriber: (event: RuntimeAnimationEvent) => void,
  ): () => void {
    if (this.disposed) return () => undefined;
    this.eventSubscribers.add(subscriber);
    return () => {
      this.eventSubscribers.delete(subscriber);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const instance of this.instances.values()) instance.state = "disposed";
    this.instances.clear();
    this.eventSubscribers.clear();
    this.disposed = true;
  }
}
