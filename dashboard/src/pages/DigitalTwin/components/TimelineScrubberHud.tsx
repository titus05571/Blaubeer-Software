import { useEffect, useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { TimelinePoint } from "../types";

interface TimelineScrubberHudProps {
    timeline: TimelinePoint[];
    offsetHours: number;
    onChangeOffset: (offset: number) => void;
}

export default function TimelineScrubberHud({
    timeline,
    offsetHours,
    onChangeOffset,
}: TimelineScrubberHudProps) {
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            onChangeOffset(offsetHours >= 12 ? -12 : offsetHours + 1);
        }, 1200);
        return () => window.clearInterval(timer);
    }, [playing, offsetHours, onChangeOffset]);

    return (
        <footer className="mss-overlay-timeline mss-panel">
            <div className="mss-timeline-controls">
                <button
                    type="button"
                    className="mss-icon-btn"
                    onClick={() => setPlaying((p) => !p)}
                    title={playing ? "Zeitsimulation pausieren" : "24h-Verlauf abspielen"}
                >
                    <Icon icon={playing ? "pause" : "play"} size={13} />
                </button>

                <button
                    type="button"
                    className={`mss-live-pill ${offsetHours === 0 ? "active" : ""}`}
                    onClick={() => {
                        setPlaying(false);
                        onChangeOffset(0);
                    }}
                >
                    <span className="mss-status-dot live" />
                    LIVE
                </button>

                <div className="mss-offset-readout">
                    <Icon icon="time" size={12} />
                    <span>
                        {offsetHours === 0
                            ? "ECHTZEIT-SYNCHRON"
                            : offsetHours > 0
                            ? `DWD PROGNOSE +${offsetHours}h`
                            : `HISTORIE ${offsetHours}h`}
                    </span>
                </div>
            </div>

            <div className="mss-slider-area">
                <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={offsetHours}
                    onChange={(e) => onChangeOffset(Number(e.target.value))}
                    className="mss-range-input"
                />

                <div className="mss-spark-bars">
                    {timeline.map((pt) => {
                        const isCurrent = Math.abs(pt.offsetHours - offsetHours) <= 1;
                        const totalRe = pt.windGw + pt.solarGw + pt.bioHydroGw;
                        const heightPct = Math.min(100, Math.round((totalRe / 85) * 100));
                        return (
                            <button
                                key={pt.offsetHours}
                                type="button"
                                className={`mss-spark-col ${isCurrent ? "current" : ""}`}
                                onClick={() => onChangeOffset(pt.offsetHours)}
                                title={`${pt.label}: EE ${totalRe.toFixed(1)} GW (${pt.eeSharePct}%)`}
                            >
                                <div className="mss-spark-bar-wrap">
                                    <div
                                        className="mss-spark-bar"
                                        style={{ height: `${heightPct}%` }}
                                    />
                                </div>
                                <span className="mss-spark-label">{pt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </footer>
    );
}
