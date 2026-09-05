export interface ProcessingHooks {
  throwIfAborted(): void;
  checkpoint(): Promise<void>;
  report(progress: number, stage: string): void;
}

