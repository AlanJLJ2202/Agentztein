// Agentztein as the guide of every screen: the same creature as the 3D lab, half-length (so its face reads even
// small), with the object that tells the situation, and one short sentence in a speech bubble. The scenes are
// stills rendered from the 3D model (apps/landing/tools/render-stills.mjs "scene-*"), so they cost nothing to show.
import type { CSSProperties } from "react";

/**
 * key: holds the API key · nokey: asleep, the key beside it · budget: coins · budget-alert: coins and a warning ·
 * dream: asleep with the moon and z's · voice: a microphone · radar: a magnifying glass · code: a code screen ·
 * exam: a clipboard with ticks · credits: a card · happy: arms up · alert: worried · hello: waving.
 */
export type Scene = "key" | "nokey" | "budget" | "budget-alert" | "dream" | "voice" | "radar" | "code" | "exam" | "credits" | "happy" | "alert" | "hello";
/** Width / height of the stills (they are about this shape once cropped to their outline). */
const RATIO = 1.12;

export function Robot({ scene, say, size = 110, className = "" }: { scene: Scene; say?: string; size?: number; className?: string }) {
  return (
    <div className={`robot ${className}`} style={{ "--rs": `${size}px` } as CSSProperties}>
      <img src={`/img/scene-${scene}.webp`} alt="" width={size} height={Math.round(size / RATIO)} className={scene === "dream" || scene === "nokey" ? "asleep" : ""} />
      {say && <p className="robot-says" role="status">{say}</p>}
    </div>
  );
}
