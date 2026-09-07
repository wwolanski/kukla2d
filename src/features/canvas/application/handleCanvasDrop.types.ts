export interface CanvasDropEvent {
  preventDefault(): void;
  dataTransfer: DataTransfer | null;
  clientX: number;
  clientY: number;
}
