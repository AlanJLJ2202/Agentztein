// Agentztein as the guide of every screen: the same creature as the 3D lab, in the pose that fits what is going on,
// with one short sentence in a speech bubble. The poses are stills rendered from the 3D model
// (apps/landing/tools/render-stills.mjs), so they cost nothing to show.
import type { CSSProperties } from "react";

/** ok: all good · alert: needs you · sleep: asleep or no brain · think: explaining · happy: something went well ·
 *  wave: hello · read: reading (the radar). */
export type Pose = "ok" | "alert" | "sleep" | "think" | "happy" | "wave" | "read";

export function Robot({ pose, say, size = 96, className = "" }: { pose: Pose; say?: string; size?: number; className?: string }) {
  return (
    <div className={`robot ${className}`} style={{ "--rs": `${size}px` } as CSSProperties}>
      <img src={`/img/agent-${pose}.webp`} alt="" width={size} height={Math.round((size * 563) / 380)} className={pose === "sleep" ? "asleep" : ""} />
      {say && <p className="robot-says" role="status">{say}</p>}
    </div>
  );
}
