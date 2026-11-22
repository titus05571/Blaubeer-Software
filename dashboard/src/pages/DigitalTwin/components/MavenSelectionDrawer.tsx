import { useState } from "react";
import { Icon } from "@blueprintjs/core";
import { buildSatelliteReconUrl } from "../services/twinDataService";
import type {
    ApiOrigin,
    CameraCommand,
    NationalTelemetrySnapshot,
    SelectedEntity,
} from "../types";

interface MavenSelectionDrawerProps {
    snapshot: NationalTelemetrySnapshot;
    selectedEntity: SelectedEntity;
    onSelectEntity: (entity: SelectedEntity) => void;
    onFlyTo: (cmd: Omit<CameraCommand, "nonce">) => void;
}

const ORIGIN_LABEL: Record<ApiOrigin, string> = {
    MASTR_CORE: "MaStR Referenz + DWD ICON-D2",
    OVERPASS_OSM: "Wikidata / OSM Stammdaten + DWD",
    OVERPASS_ISR_SCAN: "Overpass OSM Live-Scan + DWD",
    AUTOBAHN_BUND: "Autobahn GmbH Bundes-API",
    WSV_PEGELONLINE: "WSV Pegelonline Echtzeit-API",
    DWD_BRIGHTSKY: "DWD Bright Sky SYNOP Live-API",
};

export default function MavenSelectionDrawer({
    snapshot,
    selectedEntity,
    onSelectEntity,
    onFlyTo,
}: MavenSelectionDrawerProps) {
    const [actionsOpen, setActionsOpen] = useState(false);
    const [reconZoomSpan, setReconZoomSpan] = useState(0.011);

    const asset =
        selectedEntity?.kind === "ASSET"
            ? snapshot.assets.find((a) => a.id === selectedEntity.id) ?? null
            : null;

    const corridor =
        selectedEntity?.kind === "CORRIDOR"
            ? snapshot.corridors.find((c) => c.id === selectedEntity.id) ?? null
            : null;

    const connectedCorridors = asset
        ? snapshot.corridors.filter(
              (c) => c.fromAssetId === asset.id || c.toAssetId === asset.id
          )
        : [];

    const reconCenterLat = asset
        ? asset.lat
        : corridor
        ? corridor.waypoints[0][1]
        : 51.1605;
    const reconCenterLon = asset
        ? asset.lon
        : corridor
        ? corridor.waypoints[0][0]
        : 12.4042;

    const reconImageUrl = buildSatelliteReconUrl(
        reconCenterLat,
        reconCenterLon,
        reconZoomSpan
    );

    const isGenerator =
        asset !== null &&
        asset.installedCapacityMw > 0 &&
        (asset.category === "wind_offshore" ||
            asset.category === "wind_onshore" ||
            asset.category === "solar" ||
            asset.category === "storage" ||
            asset.category === "biomass_hydro");

    return (
        <aside className="gaia-right-drawer">
            <div className="gaia-selection-top">
                <span>Selection</span>
                {selectedEntity && (
                    <button
                        type="button"
                        className="gaia-clear-btn"
                        onClick={() => onSelectEntity(null)}
                    >
                        <Icon icon="cross" size={12} />
                    </button>
                )}
            </div>

            {asset || corridor ? (
                <div className="gaia-selection-scroll">
                    <div className="gaia-entity-banner">
                        <div className="gaia-entity-glyph">
                            <Icon icon={asset ? "locate" : "exchange"} size={18} />
                        </div>
                        <div className="gaia-entity-titles">
                            <strong>{asset ? asset.name : corridor!.name}</strong>
                            <span>
                                {asset
                                    ? `${asset.callsign} // ${asset.mastrId}`
                                    : `Trassenmodell // ${corridor!.type}`}
                            </span>
                        </div>
                    </div>

                    <div className="gaia-meta-table">
                        <div className="gaia-meta-row">
                            <span>Data source</span>
                            <strong>
                                {asset
                                    ? ORIGIN_LABEL[asset.apiOrigin]
                                    : "ÜNB Trassen- & Lastflussmodell"}
                            </strong>
                        </div>
                        <div className="gaia-meta-row">
                            <span>Datentyp</span>
                            <strong>
                                {asset?.apiOrigin === "WSV_PEGELONLINE" ||
                                asset?.apiOrigin === "DWD_BRIGHTSKY"
                                    ? "Echte Sensor-Live-Messung"
                                    : isGenerator
                                    ? "Stammdaten + Live-Wettermodell"
                                    : "Geprüfte Infrastruktur-Stammdaten"}
                            </strong>
                        </div>
                        <div className="gaia-meta-row">
                            <span>Layer</span>
                            <strong>
                                {asset ? asset.category.toUpperCase() : "HVDC / 380kV"}
                            </strong>
                        </div>
                        <div className="gaia-meta-row">
                            <span>Classification</span>
                            <strong
                                className={
                                    (asset && asset.status === "REDISPATCH") ||
                                    (corridor && corridor.congested)
                                        ? "txt-red"
                                        : "txt-green"
                                }
                            >
                                {asset
                                    ? asset.status === "REDISPATCH"
                                        ? "REDISPATCH (INDIZ)"
                                        : asset.status
                                    : corridor!.congested
                                    ? "HOHE LAST (MODELL)"
                                    : "NOMINAL"}
                            </strong>
                        </div>
                    </div>

                    <div className="gaia-actions-wrap">
                        <button
                            type="button"
                            className="gaia-actions-btn"
                            onClick={() => setActionsOpen((p) => !p)}
                        >
                            <span>Actions</span>
                            <Icon icon="chevron-down" size={12} />
                        </button>

                        {actionsOpen && (
                            <div className="gaia-actions-menu">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActionsOpen(false);
                                        onFlyTo({
                                            lon: reconCenterLon,
                                            lat: reconCenterLat,
                                            zoom: 15.6,
                                            pitch: 45,
                                        });
                                    }}
                                >
                                    Satelliten-Tiefflug auf Objekt (Zoom 15.6)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActionsOpen(false);
                                        onFlyTo({
                                            lon: reconCenterLon,
                                            lat: reconCenterLat,
                                            zoom: 17.4,
                                            pitch: 0,
                                        });
                                    }}
                                >
                                    Maximale Draufsicht (Zoom 17.4)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActionsOpen(false);
                                        onFlyTo({
                                            lon: 10.35,
                                            lat: 51.45,
                                            zoom: 5.8,
                                            pitch: 0,
                                            bearing: 0,
                                        });
                                    }}
                                >
                                    Zurück zur Deutschland-Übersicht
                                </button>
                            </div>
                        )}
                    </div>

                    {/* SATELLITE RECON PREVIEW */}
                    <div className="gaia-section-block">
                        <div className="gaia-section-header">
                            <Icon icon="camera" size={12} />
                            <span>Satellite Recon Preview (Esri Live)</span>
                            <div className="gaia-recon-zoom-btns">
                                <button
                                    type="button"
                                    title="Näher ran"
                                    onClick={() =>
                                        setReconZoomSpan((s) =>
                                            Math.max(0.0025, Number((s * 0.6).toFixed(4)))
                                        )
                                    }
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    title="Weiter raus"
                                    onClick={() =>
                                        setReconZoomSpan((s) =>
                                            Math.min(0.04, Number((s * 1.6).toFixed(4)))
                                        )
                                    }
                                >
                                    −
                                </button>
                            </div>
                        </div>

                        <div
                            className="gaia-recon-frame"
                            onClick={() =>
                                onFlyTo({
                                    lon: reconCenterLon,
                                    lat: reconCenterLat,
                                    zoom: 15.6,
                                    pitch: 42,
                                })
                            }
                        >
                            <img
                                src={reconImageUrl}
                                alt="Satellite Recon Close-Up"
                                className="gaia-recon-img"
                            />
                            <div className="gaia-recon-hud">
                                <span className="gaia-recon-tag">EO/SAT LIVE TILE</span>
                                <span className="gaia-recon-crosshair">+</span>
                                <span className="gaia-recon-coords">
                                    {reconCenterLat.toFixed(4)}°N {reconCenterLon.toFixed(4)}°E
                                </span>
                            </div>
                        </div>
                    </div>

                    {connectedCorridors.length > 0 && (
                        <div className="gaia-section-block">
                            <div className="gaia-section-header">
                                <Icon icon="link" size={12} />
                                <span>Verknüpfte Trassen ({connectedCorridors.length})</span>
                            </div>
                            <div className="gaia-links-list">
                                {connectedCorridors.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className="gaia-link-item"
                                        onClick={() =>
                                            onSelectEntity({ kind: "CORRIDOR", id: c.id })
                                        }
                                    >
                                        <span>{c.name}</span>
                                        <strong>{c.loadPct}%</strong>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* DETAILS // PROPERTIES */}
                    <div className="gaia-section-block">
                        <div className="gaia-section-header">
                            <Icon icon="properties" size={12} />
                            <span>Details // Properties</span>
                        </div>

                        {asset ? (
                            <div className="gaia-props-card">
                                {isGenerator ? (
                                    <div className="gaia-prop-item">
                                        <span>MODELL-EINSPEISUNG (DWD-BASIERT) / NENNLEISTUNG</span>
                                        <strong>
                                            {asset.currentOutputMw} MW / {asset.installedCapacityMw} MW (
                                            {asset.utilizationPct}%)
                                        </strong>
                                    </div>
                                ) : (
                                    <div className="gaia-prop-item">
                                        <span>STROMERZEUGUNG</span>
                                        <strong>
                                            0 MW (Kein Erzeuger —{" "}
                                            {asset.category === "substation"
                                                ? "Umspannwerk / Netzknoten"
                                                : asset.category === "hydro_sensor"
                                                ? "WSV Messpegel"
                                                : asset.category === "weather_station"
                                                ? "DWD Wetterstation"
                                                : "Stromverbraucher / Last"}
                                            )
                                        </strong>
                                    </div>
                                )}

                                {asset.extraMetrics &&
                                    Object.entries(asset.extraMetrics).map(([k, v]) => (
                                        <div key={k} className="gaia-prop-item">
                                            <span>{k}</span>
                                            <strong className="txt-green">{v}</strong>
                                        </div>
                                    ))}

                                {asset.curtailedMw > 0 && (
                                    <div className="gaia-prop-item">
                                        <span>GESCHÄTZTE ABREGELUNG (MODELL)</span>
                                        <strong className="txt-red">-{asset.curtailedMw} MW</strong>
                                    </div>
                                )}

                                <div className="gaia-prop-item">
                                    <span>DWD ICON-D2 WIND (120m) AM STANDORT</span>
                                    <strong>
                                        {asset.weather.windSpeed120m} m/s ({asset.weather.windDirection}°)
                                    </strong>
                                </div>

                                <div className="gaia-prop-item">
                                    <span>DWD GLOBALSTRAHLUNG / TEMPERATUR (LIVE)</span>
                                    <strong>
                                        {asset.weather.solarIrradiance} W/m² //{" "}
                                        {asset.weather.temperature2m} °C
                                    </strong>
                                </div>

                                <div className="gaia-prop-item">
                                    <span>TIMESTAMP / REGELZONE</span>
                                    <strong>
                                        {snapshot.timestampIso.replace("T", " ").slice(0, 16)} UTC //{" "}
                                        {asset.tso}
                                    </strong>
                                </div>
                            </div>
                        ) : (
                            <div className="gaia-props-card">
                                <div className="gaia-prop-item">
                                    <span>MODELL-LASTFLUSS / THERMISCHE KAPAZITÄT</span>
                                    <strong>
                                        {corridor!.currentFlowMw} MW / {corridor!.capacityMw} MW (
                                        {corridor!.loadPct}%)
                                    </strong>
                                </div>
                                <div className="gaia-prop-item">
                                    <span>SPANNUNGSEBENE</span>
                                    <strong>
                                        {corridor!.voltageKv} kV ({corridor!.type})
                                    </strong>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="gaia-section-block">
                        <div className="gaia-section-header">
                            <Icon icon="chart" size={12} />
                            <span>Nationale Hochrechnung (DWD-Modell)</span>
                        </div>
                        <div className="gaia-props-card">
                            <div className="gaia-prop-item">
                                <span>WIND ONSHORE + OFFSHORE (MODELL DE)</span>
                                <strong>
                                    {(
                                        snapshot.bySourceGw.windOnshore +
                                        snapshot.bySourceGw.windOffshore
                                    ).toFixed(2)}{" "}
                                    GW
                                </strong>
                            </div>
                            <div className="gaia-prop-item">
                                <span>PHOTOVOLTAIK (MODELL DE)</span>
                                <strong>{snapshot.bySourceGw.solar.toFixed(2)} GW</strong>
                            </div>
                            <div className="gaia-prop-item">
                                <span>CORRENTLY GRÜNSTROMINDEX / CO₂ (LIVE)</span>
                                <strong>
                                    GSI {snapshot.gsiScore} // {snapshot.co2IntensityGPerKwh} g/kWh
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="gaia-empty-selection">
                    <Icon icon="locate" size={22} />
                    <p>
                        Klicke auf einen Knoten oder eine Trasse auf der Satellitenkarte
                        (Doppelklick startet den Tiefflug).
                    </p>
                </div>
            )}
        </aside>
    );
}
