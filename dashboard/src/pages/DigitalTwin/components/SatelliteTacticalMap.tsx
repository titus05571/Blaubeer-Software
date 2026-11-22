import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import type { MapMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "@blueprintjs/core";

import { createGeoCirclePolygon } from "../services/twinDataService";
import type {
    BasemapStyle,
    CameraCommand,
    EnergyAsset,
    LayerVisibility,
    SelectedEntity,
    TacticalSectorPolygon,
    TransmissionCorridor,
    TsoZone,
    ViewportBounds,
} from "../types";

interface SatelliteTacticalMapProps {
    assets: EnergyAsset[];
    corridors: TransmissionCorridor[];
    sectors: TacticalSectorPolygon[];
    layers: LayerVisibility;
    selectedTso?: TsoZone;
    selectedEntity: SelectedEntity;
    cameraCommand: CameraCommand | null;
    isScanningSector: boolean;
    onSelectEntity: (entity: SelectedEntity) => void;
    onScanViewport: (bounds: ViewportBounds) => void;
}

function createRasterStyle(): StyleSpecification {
    return {
        version: 8,
        sources: {
            "esri-satellite": {
                type: "raster",
                tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                tileSize: 256,
                maxzoom: 19,
            },
            "esri-dark": {
                type: "raster",
                tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
                tileSize: 256,
                maxzoom: 16,
            },
            "esri-labels": {
                type: "raster",
                tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
                tileSize: 256,
                maxzoom: 19,
            },
        },
        layers: [
            { id: "base-dark", type: "raster", source: "esri-dark", layout: { visibility: "none" } },
            { id: "base-satellite", type: "raster", source: "esri-satellite", paint: { "raster-contrast": 0.06, "raster-brightness-max": 0.92 } },
            { id: "overlay-labels", type: "raster", source: "esri-labels", paint: { "raster-opacity": 0.88 } },
        ],
    };
}

function isAssetVisible(asset: EnergyAsset, layers: LayerVisibility, tsoFilter: TsoZone): boolean {
    const activeTso = tsoFilter || "ALLE";
    if (activeTso !== "ALLE" && asset.tso !== activeTso) return false;
    if ((asset.apiOrigin === "OVERPASS_OSM" || asset.apiOrigin === "OVERPASS_ISR_SCAN") && layers.osmLivePlants === false) {
        return false;
    }
    switch (asset.category) {
        case "wind_offshore": return layers.windOffshore !== false;
        case "wind_onshore": return layers.windOnshore !== false;
        case "solar": return layers.solar !== false;
        case "storage":
        case "biomass_hydro": return layers.storageAndHydro !== false;
        case "h2_electrolyzer": return layers.h2Electrolyzers !== false;
        case "substation": return layers.substations !== false;
        case "hpc_charger": return layers.autobahnHpc !== false;
        case "hydro_sensor": return layers.wsvHydroSensors !== false;
        case "weather_station": return layers.dwdWeatherStations !== false;
    }
}

function getBadgeStyle(asset: EnergyAsset): { bg: string; border: string; glyph: string; shape: "sq" | "dia" | "cir" } {
    if (asset.status === "REDISPATCH") return { bg: "#dc2626", border: "#fecaca", glyph: "!", shape: "dia" };
    switch (asset.category) {
        case "wind_offshore":
        case "wind_onshore": return { bg: "#1d4ed8", border: "#93c5fd", glyph: "W", shape: "sq" };
        case "solar": return { bg: "#ca8a04", border: "#fef08a", glyph: "S", shape: "sq" };
        case "storage":
        case "biomass_hydro": return { bg: "#7e22ce", border: "#e9d5ff", glyph: "B", shape: "sq" };
        case "h2_electrolyzer": return { bg: "#0d9488", border: "#99f6e4", glyph: "H2", shape: "sq" };
        case "substation": return { bg: "#15803d", border: "#bbf7d0", glyph: "U", shape: "sq" };
        case "hpc_charger": return { bg: "#ea580c", border: "#fed7aa", glyph: "EV", shape: "sq" };
        case "hydro_sensor": return { bg: "#0284c7", border: "#bae6fd", glyph: "~", shape: "cir" };
        case "weather_station": return { bg: "#334155", border: "#38bdf8", glyph: "M", shape: "cir" };
    }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export default function SatelliteTacticalMap({
    assets,
    corridors,
    sectors,
    layers,
    selectedTso = "ALLE",
    selectedEntity,
    cameraCommand,
    isScanningSector,
    onSelectEntity,
    onScanViewport,
}: SatelliteTacticalMapProps) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);

    const stateRef = useRef({ assets, corridors, sectors, layers, selectedTso, selectedEntity, onSelectEntity });
    stateRef.current = { assets, corridors, sectors, layers, selectedTso, selectedEntity, onSelectEntity };

    const [basemap, setBasemap] = useState<BasemapStyle>("satellite-hybrid");
    const [cursorCoords, setCursorCoords] = useState({ lat: 51.45, lon: 10.35, zoom: 5.8 });
    const [is3dPitch, setIs3dPitch] = useState(false);

    const renderTacticalCanvas = useCallback(() => {
        const map = mapRef.current;
        const canvas = overlayCanvasRef.current;
        const stage = stageRef.current;
        if (!map || !canvas || !stage) return;

        const rect = stage.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);

        const { assets: curAssets, corridors: curCors, sectors: curSecs, layers: curLayers, selectedTso: curTso, selectedEntity: curSel } = stateRef.current;
        const activeTso = curTso || "ALLE";
        const zoom = map.getZoom();

        if (curLayers.tacticalSectors !== false) {
            for (const sec of curSecs) {
                ctx.beginPath();
                sec.coordinates.forEach(([lon, lat], idx) => {
                    const p = map.project([lon, lat]);
                    if (idx === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.fillStyle = `${sec.color}26`;
                ctx.fill();
                ctx.strokeStyle = sec.color;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        if (curLayers.redispatchCircles !== false) {
            const rdList = curAssets.filter((a) => a.status === "REDISPATCH" && (activeTso === "ALLE" || a.tso === activeTso));
            for (const rd of rdList) {
                const ring = createGeoCirclePolygon(rd.lat, rd.lon, rd.redispatchRadiusKm, 40);
                ctx.beginPath();
                ring.forEach(([lon, lat], idx) => {
                    const p = map.project([lon, lat]);
                    if (idx === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.fillStyle = "rgba(220, 38, 38, 0.28)";
                ctx.fill();
                ctx.strokeStyle = "rgba(248, 113, 113, 0.92)";
                ctx.lineWidth = 1.8;
                ctx.stroke();
            }
        }

        if (curLayers.gridCorridors !== false) {
            for (const cor of curCors) {
                const isSelCor = curSel?.kind === "CORRIDOR" && curSel.id === cor.id;
                ctx.beginPath();
                cor.waypoints.forEach(([lon, lat], idx) => {
                    const p = map.project([lon, lat]);
                    if (idx === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.strokeStyle = "rgba(5, 8, 15, 0.92)";
                ctx.lineWidth = isSelCor ? 7 : 5;
                ctx.stroke();

                ctx.strokeStyle = cor.congested ? "#ef4444" : cor.type === "HVDC_CORRIDOR" ? "#38bdf8" : "#4ade80";
                ctx.lineWidth = isSelCor ? 3.8 : 2.5;
                ctx.stroke();
            }
        }

        const visibleAssets = curAssets.filter((a) => isAssetVisible(a, curLayers, activeTso));
        for (const asset of visibleAssets) {
            const pt = map.project([asset.lon, asset.lat]);
            if (pt.x < -40 || pt.x > rect.width + 40 || pt.y < -40 || pt.y > rect.height + 40) continue;

            const isCore = asset.apiOrigin === "MASTR_CORE";
            const isSelected = curSel?.kind === "ASSET" && curSel.id === asset.id;
            const style = getBadgeStyle(asset);
            const r = isSelected ? 10.5 : isCore || zoom >= 8 ? 8.5 : 6.5;

            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.shadowColor = "rgba(0,0,0,0.85)";
            ctx.shadowBlur = 4;
            ctx.fillStyle = style.bg;
            ctx.strokeStyle = style.border;
            ctx.lineWidth = 1.7;

            if (style.shape === "dia") {
                ctx.save();
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-r, -r, r * 2, r * 2);
                ctx.strokeRect(-r, -r, r * 2, r * 2);
                ctx.restore();
            } else if (style.shape === "cir") {
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillRect(-r, -r, r * 2, r * 2);
                ctx.strokeRect(-r, -r, r * 2, r * 2);
            }

            if (r >= 7) {
                ctx.shadowBlur = 0;
                ctx.fillStyle = "#ffffff";
                ctx.font = style.glyph.length > 1 ? "bold 7.5px monospace" : "bold 9.5px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(style.glyph, 0, 0.5);
            }

            if (isSelected) {
                const b = r + 5;
                const l = 5;
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(-b, -b + l); ctx.lineTo(-b, -b); ctx.lineTo(-b + l, -b);
                ctx.moveTo(b - l, -b); ctx.lineTo(b, -b); ctx.lineTo(b, -b + l);
                ctx.moveTo(-b, b - l); ctx.lineTo(-b, b); ctx.lineTo(-b + l, b);
                ctx.moveTo(b - l, b); ctx.lineTo(b, b); ctx.lineTo(b, b - l);
                ctx.stroke();
            }

            if (isSelected || (isCore && zoom >= 5.5) || zoom >= 7.6) {
                const txt = asset.callsign;
                ctx.font = "bold 9.5px Consolas, monospace";
                const tw = ctx.measureText(txt).width;
                ctx.fillStyle = "rgba(8, 12, 20, 0.88)";
                ctx.fillRect(-tw / 2 - 3, r + 3, tw + 6, 12);
                ctx.fillStyle = isSelected ? "#38bdf8" : "#f1f5f9";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(txt, 0, r + 4);
            }

            ctx.restore();
        }

        ctx.restore();
    }, []);

    useEffect(() => {
        const container = mapContainerRef.current;
        const stage = stageRef.current;
        if (!container || !stage) return;

        const map = new MapLibreMap({
            container,
            style: createRasterStyle(),
            center: [10.35, 51.45],
            zoom: 5.8,
            pitch: 0,
            bearing: 0,
            maxPitch: 70,
            attributionControl: false,
        });

        map.on("render", renderTacticalCanvas);
        map.on("move", renderTacticalCanvas);
        map.on("load", renderTacticalCanvas);

        const ro = new ResizeObserver(() => {
            map.resize();
            renderTacticalCanvas();
        });
        ro.observe(stage);

        map.on("mousemove", (e: MapMouseEvent) => {
            setCursorCoords({
                lat: Number(e.lngLat.lat.toFixed(4)),
                lon: Number(e.lngLat.lng.toFixed(4)),
                zoom: Number(map.getZoom().toFixed(1)),
            });
            const { assets: curA, layers: curL, selectedTso: curT } = stateRef.current;
            const hit = curA.some((a) => {
                if (!isAssetVisible(a, curL, curT || "ALLE")) return false;
                const p = map.project([a.lon, a.lat]);
                return Math.hypot(p.x - e.point.x, p.y - e.point.y) <= 13;
            });
            map.getCanvas().style.cursor = hit ? "pointer" : "";
        });

        map.on("click", (e: MapMouseEvent) => {
            const { assets: curA, corridors: curC, layers: curL, selectedTso: curT, onSelectEntity: selectFn } = stateRef.current;
            let bestAsset: EnergyAsset | null = null;
            let bestDist = 14;
            for (const a of curA) {
                if (!isAssetVisible(a, curL, curT || "ALLE")) continue;
                const p = map.project([a.lon, a.lat]);
                const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestAsset = a;
                }
            }
            if (bestAsset) {
                selectFn({ kind: "ASSET", id: bestAsset.id });
                return;
            }
            if (curL.gridCorridors !== false) {
                for (const c of curC) {
                    for (let i = 0; i < c.waypoints.length - 1; i++) {
                        const p1 = map.project(c.waypoints[i]);
                        const p2 = map.project(c.waypoints[i + 1]);
                        if (distToSegment(e.point.x, e.point.y, p1.x, p1.y, p2.x, p2.y) <= 8) {
                            selectFn({ kind: "CORRIDOR", id: c.id });
                            return;
                        }
                    }
                }
            }
        });

        map.on("dblclick", (e: MapMouseEvent) => {
            const { assets: curA, layers: curL, selectedTso: curT, onSelectEntity: selectFn } = stateRef.current;
            for (const a of curA) {
                if (!isAssetVisible(a, curL, curT || "ALLE")) continue;
                const p = map.project([a.lon, a.lat]);
                if (Math.hypot(p.x - e.point.x, p.y - e.point.y) <= 16) {
                    e.preventDefault();
                    selectFn({ kind: "ASSET", id: a.id });
                    map.flyTo({ center: [a.lon, a.lat], zoom: 15.3, pitch: 45, duration: 1200 });
                    return;
                }
            }
        });

        mapRef.current = map;
        requestAnimationFrame(renderTacticalCanvas);

        return () => {
            ro.disconnect();
            map.remove();
            mapRef.current = null;
        };
    }, [renderTacticalCanvas]);

    useEffect(() => {
        renderTacticalCanvas();
    }, [assets, corridors, sectors, layers, selectedTso, selectedEntity, renderTacticalCanvas]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !cameraCommand) return;
        map.flyTo({
            center: [cameraCommand.lon, cameraCommand.lat],
            zoom: cameraCommand.zoom,
            pitch: cameraCommand.pitch ?? map.getPitch(),
            bearing: cameraCommand.bearing ?? map.getBearing(),
            duration: 1300,
            essential: true,
        });
    }, [cameraCommand]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        const showSat = basemap === "satellite-hybrid" || basemap === "satellite-pure";
        const showLabels = basemap === "satellite-hybrid" && layers.placeLabels !== false;
        if (map.getLayer("base-satellite")) map.setLayoutProperty("base-satellite", "visibility", showSat ? "visible" : "none");
        if (map.getLayer("base-dark")) map.setLayoutProperty("base-dark", "visibility", showSat ? "none" : "visible");
        if (map.getLayer("overlay-labels")) map.setLayoutProperty("overlay-labels", "visibility", showLabels ? "visible" : "none");
    }, [basemap, layers.placeLabels]);

    const handleTriggerSectorScan = () => {
        const map = mapRef.current;
        if (!map) return;
        const b = map.getBounds();
        onScanViewport({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };

    const toggle3d = () => {
        const map = mapRef.current;
        if (!map) return;
        const next = !is3dPitch;
        setIs3dPitch(next);
        map.easeTo({ pitch: next ? 52 : 0, bearing: next ? -10 : 0, duration: 700 });
    };

    const visibleCount = assets.filter((a) => isAssetVisible(a, layers, selectedTso)).length;

    return (
        <div ref={stageRef} className="gaia-map-stage">
            <div ref={mapContainerRef} className="gaia-maplibre-container" />
            <canvas
                ref={overlayCanvasRef}
                className="gaia-tactical-canvas"
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 4,
                }}
            />

            <div className="gaia-isr-bar">
                <span className="gaia-target-counter">
                    TARGETS: <strong>{visibleCount}</strong>
                </span>
                <button
                    type="button"
                    className="gaia-isr-scan-btn"
                    onClick={handleTriggerSectorScan}
                    disabled={isScanningSector}
                    title="Scannt im 14km-Umkreis um die Kartenmitte nach einzelnen Windrädern, PV-Anlagen & Umspannwerken"
                >
                    <Icon icon="target" size={12} className={isScanningSector ? "spin" : ""} />
                    <span>{isScanningSector ? "SCANNE …" : "SCAN"}</span>
                </button>
            </div>

            <div className="gaia-map-toolstrip bottom-left">
                <button type="button" className="gaia-tool-btn" title="Hineinzoomen" onClick={() => mapRef.current?.zoomIn()}>
                    <Icon icon="plus" size={13} />
                </button>
                <button type="button" className="gaia-tool-btn" title="Herauszoomen" onClick={() => mapRef.current?.zoomOut()}>
                    <Icon icon="minus" size={13} />
                </button>
                <button type="button" className={`gaia-tool-btn ${is3dPitch ? "active" : ""}`} title="3D-Schrägansicht" onClick={toggle3d}>
                    <Icon icon="compass" size={13} />
                </button>
                <button
                    type="button"
                    className="gaia-tool-btn"
                    title="Gesamtdeutschland"
                    onClick={() => mapRef.current?.flyTo({ center: [10.35, 51.45], zoom: 5.8, pitch: 0, bearing: 0 })}
                >
                    <Icon icon="fullscreen" size={13} />
                </button>
            </div>

            <div className="gaia-bottom-statusbar">
                <button
                    type="button"
                    className="gaia-basemap-pill"
                    onClick={() =>
                        setBasemap((p) =>
                            p === "satellite-hybrid" ? "satellite-pure" : p === "satellite-pure" ? "dark-c2" : "satellite-hybrid"
                        )
                    }
                >
                    <span className="gaia-basemap-thumb" />
                    <span>
                        {basemap === "satellite-hybrid"
                            ? "Esri Satellite Hybrid"
                            : basemap === "satellite-pure"
                            ? "Esri Satellite Pure"
                            : "Tactical Dark C2"}
                    </span>
                </button>

                <span className="gaia-coords-text">
                    Coordinates: {cursorCoords.lat.toFixed(4)}° N, {cursorCoords.lon.toFixed(4)}° E | Zoom {cursorCoords.zoom}
                </span>
            </div>
        </div>
    );
}
