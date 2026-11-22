import { useState } from "react";
import { Icon } from "@blueprintjs/core";
import type {
    CameraCommand,
    EnergyAsset,
    LayerVisibility,
    NationalTelemetrySnapshot,
    SelectedEntity,
} from "../types";

interface MavenLeftDrawerProps {
    snapshot: NationalTelemetrySnapshot;
    layers: LayerVisibility;
    onToggleLayer: (key: keyof LayerVisibility) => void;
    onSelectEntity: (entity: SelectedEntity) => void;
    onFlyTo: (cmd: Omit<CameraCommand, "nonce">) => void;
    onRefresh: () => void;
    isLoading: boolean;
}

type LeftTab = "layers" | "sources" | "tools";

export default function MavenLeftDrawer({
    snapshot,
    layers,
    onToggleLayer,
    onSelectEntity,
    onFlyTo,
    onRefresh,
    isLoading,
}: MavenLeftDrawerProps) {
    const [activeTab, setActiveTab] = useState<LeftTab>("layers");
    const [query, setQuery] = useState("");
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        mastr: true,
        liveApis: true,
        tactical: true,
    });

    const toggleGroup = (id: string) =>
        setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

    const matchingAssets: EnergyAsset[] =
        query.trim().length > 0
            ? snapshot.assets
                  .filter(
                      (a) =>
                          a.name.toLowerCase().includes(query.toLowerCase()) ||
                          a.callsign.toLowerCase().includes(query.toLowerCase()) ||
                          a.bundesland.toLowerCase().includes(query.toLowerCase())
                  )
                  .slice(0, 30)
            : [];

    const renderLayerRow = (key: keyof LayerVisibility, label: string, indent = false) => {
        const active = layers[key];
        return (
            <button
                key={key}
                type="button"
                className={`gaia-tree-row ${indent ? "indented" : ""}`}
                onClick={() => onToggleLayer(key)}
            >
                <Icon icon={indent ? "minus" : "folder-close"} size={11} className="gaia-tree-icon" />
                <span className="gaia-tree-label">{label}</span>
                <span className={`gaia-status-ring ${active ? "on" : "off"}`} />
            </button>
        );
    };

    return (
        <aside className="gaia-left-drawer">
            <div className="gaia-tabs">
                <button type="button" className={`gaia-tab ${activeTab === "layers" ? "active" : ""}`} onClick={() => setActiveTab("layers")}>
                    <Icon icon="layers" size={12} />
                    <span>Map Layers</span>
                </button>
                <button type="button" className={`gaia-tab ${activeTab === "sources" ? "active" : ""}`} onClick={() => setActiveTab("sources")}>
                    <Icon icon="database" size={12} />
                    <span>Data Sources</span>
                </button>
                <button type="button" className={`gaia-tab ${activeTab === "tools" ? "active" : ""}`} onClick={() => setActiveTab("tools")}>
                    <Icon icon="wrench" size={12} />
                    <span>Tools</span>
                </button>
            </div>

            <div className="gaia-search-box">
                <Icon icon="search" size={12} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${snapshot.assets.length} targets...`}
                />
                {query && (
                    <button type="button" className="gaia-clear-btn" onClick={() => setQuery("")}>
                        <Icon icon="cross" size={11} />
                    </button>
                )}
            </div>

            {query.trim().length > 0 && (
                <div className="gaia-search-results">
                    <div className="gaia-section-caption">TREFFER ({matchingAssets.length})</div>
                    {matchingAssets.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            className="gaia-search-hit"
                            onClick={() => {
                                onSelectEntity({ kind: "ASSET", id: a.id });
                                onFlyTo({ lon: a.lon, lat: a.lat, zoom: 14.5, pitch: 45 });
                            }}
                        >
                            <strong>{a.callsign} // {a.apiOrigin}</strong>
                            <span>{a.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {activeTab === "layers" && (
                <div className="gaia-tree-scroll">
                    {renderLayerRow("placeLabels", "Esri Grenzen & Ortsnamen")}

                    <button type="button" className="gaia-group-header" onClick={() => toggleGroup("mastr")}>
                        <Icon icon={openGroups.mastr ? "chevron-down" : "chevron-right"} size={12} />
                        <Icon icon="folder-open" size={12} />
                        <span>Erzeugungsanlagen &amp; Netz</span>
                    </button>
                    {openGroups.mastr && (
                        <div className="gaia-group-children">
                            {renderLayerRow("windOffshore", "Offshore Windparks [W]", true)}
                            {renderLayerRow("windOnshore", "Onshore Windfelder [W]", true)}
                            {renderLayerRow("solar", "Groß-Solarparks [S]", true)}
                            {renderLayerRow("storageAndHydro", "PSW, Batterie & Wasser [B]", true)}
                            {renderLayerRow("h2Electrolyzers", "H₂-Elektrolyseure [H2]", true)}
                            {renderLayerRow("substations", "380kV / HGÜ Konverter [U]", true)}
                        </div>
                    )}

                    <button type="button" className="gaia-group-header" onClick={() => toggleGroup("liveApis")}>
                        <Icon icon={openGroups.liveApis ? "chevron-down" : "chevron-right"} size={12} />
                        <Icon icon="database" size={12} />
                        <span>Externe Sensor- &amp; Live-APIs</span>
                    </button>
                    {openGroups.liveApis && (
                        <div className="gaia-group-children">
                            {renderLayerRow("osmLivePlants", "Overpass OSM Kraftwerke & ISR", true)}
                            {renderLayerRow("autobahnHpc", "Autobahn HPC-Ladeparks [EV]", true)}
                            {renderLayerRow("wsvHydroSensors", "WSV Pegelonline Sensoren [~]", true)}
                            {renderLayerRow("dwdWeatherStations", "DWD BrightSky SYNOP [M]", true)}
                        </div>
                    )}

                    <button type="button" className="gaia-group-header" onClick={() => toggleGroup("tactical")}>
                        <Icon icon={openGroups.tactical ? "chevron-down" : "chevron-right"} size={12} />
                        <Icon icon="polygon-filter" size={12} />
                        <span>tactical_graphics</span>
                    </button>
                    {openGroups.tactical && (
                        <div className="gaia-group-children">
                            {renderLayerRow("redispatchCircles", "Redispatch-Radien (Rote Zonen)", true)}
                            {renderLayerRow("tacticalSectors", "EE- & H₂-Sektoren (Polygone)", true)}
                            {renderLayerRow("gridCorridors", "HGÜ / 380kV Lastfluss-Trassen", true)}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "sources" && (
                <div className="gaia-tree-scroll gaia-pad">
                    {snapshot.apiFeeds.map((feed) => (
                        <div key={feed.name} className="gaia-source-card">
                            <div className="gaia-source-head">
                                <strong>{feed.name}</strong>
                                <span className={feed.online ? "txt-green" : "txt-red"}>
                                    {feed.online ? `${feed.targetCount} OK` : "RETRY"}
                                </span>
                            </div>
                            <p>{feed.detail}</p>
                        </div>
                    ))}
                    <button type="button" className="gaia-action-btn" onClick={onRefresh}>
                        <Icon icon="refresh" size={12} className={isLoading ? "spin" : ""} />
                        <span>Alle 7 API-Streams neu synchronisieren</span>
                    </button>
                </div>
            )}

            {activeTab === "tools" && (
                <div className="gaia-tree-scroll gaia-pad">
                    <div className="gaia-section-caption">SATELLITEN-TIEFFLUG PRESETS</div>
                    <button type="button" className="gaia-preset-btn" onClick={() => onFlyTo({ lon: 10.35, lat: 51.45, zoom: 5.8, pitch: 0, bearing: 0 })}>
                        <Icon icon="globe" size={12} />
                        <span>Gesamtdeutschland Übersicht (2D)</span>
                    </button>
                    <button type="button" className="gaia-preset-btn" onClick={() => onFlyTo({ lon: 9.2, lat: 53.9, zoom: 7.5, pitch: 52, bearing: -12 })}>
                        <Icon icon="compass" size={12} />
                        <span>Nordsee &amp; Schleswig-Holstein (3D)</span>
                    </button>
                    <button type="button" className="gaia-preset-btn" onClick={() => { onSelectEntity({ kind: "ASSET", id: "pv-witznitz" }); onFlyTo({ lon: 12.4042, lat: 51.1605, zoom: 14.2, pitch: 40 }); }}>
                        <Icon icon="locate" size={12} />
                        <span>Energiepark Witznitz (650 MW PV)</span>
                    </button>
                    <button type="button" className="gaia-preset-btn" onClick={() => { onSelectEntity({ kind: "ASSET", id: "st-goldisthal" }); onFlyTo({ lon: 11.0053, lat: 50.5094, zoom: 14.6, pitch: 50 }); }}>
                        <Icon icon="locate" size={12} />
                        <span>PSW Goldisthal Oberbecken</span>
                    </button>
                    <button type="button" className="gaia-preset-btn" onClick={() => { onSelectEntity({ kind: "ASSET", id: "sub-wilster" }); onFlyTo({ lon: 9.3506, lat: 53.9308, zoom: 16.0, pitch: 35 }); }}>
                        <Icon icon="locate" size={12} />
                        <span>380kV UW Wilster Schaltfeld</span>
                    </button>
                </div>
            )}
        </aside>
    );
}
