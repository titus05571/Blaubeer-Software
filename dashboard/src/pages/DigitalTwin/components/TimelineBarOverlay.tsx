import { useEffect, useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { TimelinePoint } from "../types";

interface TimelineBarOverlayProps {
    timeline: TimelinePoint[];
    offsetHours: number;
    eeSharePct: number;
    onChangeOffset: (h: number) => void;
}

export default function TimelineBarOverlay({
    timeline,
    offsetHours,
    onChangeOffset,
}: TimelineBarOverlayProps) {
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => {
            onChangeOffset(offsetHours >= 12 ? -12 : offsetHours + 2);
        }, 1250);
        return () => window.clearInterval(id);
    }, [playing, offsetHours, onChangeOffset]);

    return (
        <div className="gaia-top-hud">
            <button
                type="button"
                className="gaia-hud-play"
                onClick={() => setPlaying((p) => !p)}
                title={playing ? "Pause" : "24h DWD-Zeitverlauf abspielen"}
            >
                <Icon icon={playing ? "pause" : "play"} size={11} />
            </button>

            <button
                type="button"
                className={`gaia-hud-live ${offsetHours === 0 ? "active" : ""}`}
                onClick={() => {
                    setPlaying(false);
                    onChangeOffset(0);
                }}
            >
                LIVE
            </button>

            <div className="gaia-hud-steps">
                {timeline.map((pt) => {
                    const active = pt.offsetHours === offsetHours;
                    return (
                        <button
                            key={pt.offsetHours}
                            type="button"
                            className={`gaia-step-btn ${active ? "active" : ""}`}
                            onClick={() => onChangeOffset(pt.offsetHours)}
                            title={`${pt.label} — EE: PLACEHOLDER`}
                        >
                            {/* ${pt.eeSharePct} */}
                            {pt.label}
                        </button>
                    );
                })}
            </div>

            <div className="gaia-hud-kpi">
                EE <strong>PLACEHOLDER</strong>
            </div>
        </div>
    );
}
