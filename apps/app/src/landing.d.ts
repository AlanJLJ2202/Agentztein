// The 3D creature lives in the landing (apps/landing/src); the app imports it through the @landing alias in vite.config.ts.
declare module "@landing/dashstage.js" {
  export type StageMood = "sleep" | "idle" | "think" | "alert" | "happy";
  export type StageScreen = "off" | "pulse" | "alert" | "test" | "ok" | "sync";
  export type StageChip = { color: number; candidate?: boolean };
  export type DashStage = {
    set(mood: StageMood, screen: StageScreen): void;
    setChips(chips: StageChip[]): void;
    jolt(): void;
    dispose(): void;
  };
  export function createDashStage(host: HTMLElement, o?: { reduced?: boolean }): DashStage | null;
}
declare module "@landing/track.js" {
  export function startTracking(page: "landing" | "app", target?: string): void;
  export function track(event: "section" | "cta" | "lab" | "tab" | "signin", target?: string, value?: number): void;
  export function trackSignIn(token: string): void;
  export function stopTracking(): void;
}
