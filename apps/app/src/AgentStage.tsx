// Agentztein in 3D on the dashboard. The three.js scene loads after the page (it is the heaviest piece), so a still
// picture stands in until it is ready, and stays if the device has no WebGL. A tap or Enter makes it jump and say
// the next thing; the speech bubble is plain HTML, so screen readers get it too.
import { useEffect, useRef, useState } from "react";
import type { DashStage, StageChip, StageMood, StageScreen } from "@landing/dashstage.js";

export type { StageChip, StageMood, StageScreen };

type Props = {
  mood: StageMood;
  screen: StageScreen;
  chips: StageChip[];
  say: string;
  sayKey: string | number;
  label: string;
  onPoke: () => void;
};

export function AgentStage({ mood, screen, chips, say, sayKey, label, onPoke }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<DashStage | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ mood, screen, chips });
  latest.current = { mood, screen, chips };

  useEffect(() => {
    let gone = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    void import("@landing/dashstage.js")
      .then(({ createDashStage }) => {
        if (gone || !host.current) return;
        const s = createDashStage(host.current, { reduced });
        if (!s) return;
        stage.current = s;
        s.set(latest.current.mood, latest.current.screen);
        s.setChips(latest.current.chips);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => stage.current?.set(mood, screen), [mood, screen, ready]);
  const chipKey = chips.map((c) => `${c.color}${c.candidate ? "c" : ""}`).join();
  useEffect(() => stage.current?.setChips(latest.current.chips), [chipKey, ready]);

  const poke = () => {
    stage.current?.jolt();
    onPoke();
  };

  return (
    <div className={`stage${ready ? " ready" : ""}`}>
      <div className="stage-gl" ref={host} />
      {!ready && <img className="stage-still" src={mood === "alert" ? "/img/agent-alert.webp" : "/img/agent-ok.webp"} alt="" width={180} height={270} />}
      <p key={sayKey} className={`bubble${mood === "alert" ? " warn" : ""}`} aria-live="polite">{say}</p>
      <button type="button" className="stage-hit" aria-label={label} onClick={poke} />
    </div>
  );
}
