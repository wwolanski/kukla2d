export interface ThemePreset {
  readonly id: string;
  readonly name: string;
  readonly colors: Readonly<Record<string, string>>;
}
