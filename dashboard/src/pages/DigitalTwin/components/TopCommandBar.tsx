import { useEffect, useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { NationalTelemetrySnapshot, TsoZone } from "../types";

interface TopCommandBarProps {
    snapshot: NationalTelemetrySnapshot;
    selectedTso: TsoZone;
    onSelectTso: (zone: TsoZone) => void;
    offsetHours: number;
    isLoading: boolean;
    onRefresh: () => void;
}

const TSO_ZONES: TsoZone[] = ["ALLE", "TenneT", "50Hertz", "Amprion", "TransnetBW"];

export default function TopCommandBar({
    snapshot,
    selectedTso,
    onSelectTso,
    offsetHours,
    isLoading,
    onRefresh,
}: TopCommandBarProps) {
    const [clock, setClock] = useState<string>("");

    useEffect(() => {
        const update = () => {
            const now = new Date();
            setClock(now.toISOString().replace("T", " ").slice(0, 19) + "Z");
        };
        update();
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, []);

    const isLive = offsetHours === 0;
    const onlineFeeds = snapshot.apiFeeds.filter((f) => f.online).length;

    return (
        <header className="gaia-command-bar">
            <div className="gaia-cmd-left">
                <div className="gaia-cmd-tag">
                    <span className={`gaia-dot ${isLive ? "live" : "sim"}`} />
                    <span>Blueberry Smart System</span>
                </div>

                <div className="gaia-cmd-sync">
                    <Icon icon="pulse" size={11} />
                    <span>
                        {onlineFeeds}/{snapshot.apiFeeds.length} APIS ONLINE ({snapshot.assets.length} TARGETS)
                    </span>
                </div>

                <div className="gaia-tso-bar" role="group" aria-label="Regelzone filtern">
                    {TSO_ZONES.map((zone) => (
                        <button
                            key={zone}
                            type="button"
                            className={`gaia-tso-chip ${selectedTso === zone ? "active" : ""}`}
                            onClick={() => onSelectTso(zone)}
                        >
                            {zone.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="gaia-cmd-right">
                <div className="gaia-kpi-item">
                    <span>EE-ANTEIL</span>
                    <strong className="txt-green">PLACEHOLDER</strong>
                    {/* {snapshot.eeSharePct} */}
                </div>
                <div className="gaia-kpi-item">
                    <span>FREQ</span>
                    <strong>{snapshot.gridFrequencyHz.toFixed(3)} Hz</strong>
                </div>
                <div className="gaia-kpi-item">
                    <span>CO₂</span>
                    <strong>PLACEHOLDER</strong>
                    {/* {snapshot.eeSharePct} */}
                </div>
                <div className="gaia-kpi-item">
                    <span>DAY-AHEAD</span>
                    <strong className="txt-cyan">{snapshot.spotPriceEurMwh} €/MWh</strong>
                </div>

                <span className="gaia-cmd-clock">{clock}</span>

                <button
                    type="button"
                    className="gaia-cmd-refresh"
                    onClick={onRefresh}
                    title="Alle API-Streams neu synchronisieren"
                >
                    <Icon icon="refresh" size={12} className={isLoading ? "spin" : ""} />
                </button>
            </div>
        </header>
    );
}
