import { useCallback, useEffect, useState } from "react";
import { scanViewportOverpassTargets, twinCache } from "./services/twinDataService";
import TopCommandBar from "./components/TopCommandBar";
import MavenLeftDrawer from "./components/MavenLeftDrawer";
import SatelliteTacticalMap from "./components/SatelliteTacticalMap";
import MavenSelectionDrawer from "./components/MavenSelectionDrawer";
import TimelineBarOverlay from "./components/TimelineBarOverlay";
import type {
    CameraCommand,
    LayerVisibility,
    NationalTelemetrySnapshot,
    SelectedEntity,
    TsoZone,
    ViewportBounds,
} from "./types";

import "./DigitalTwin.css";

const DEFAULT_LAYERS: LayerVisibility = {
    windOffshore: true,
    windOnshore: true,
    solar: true,
    storageAndHydro: true,
    h2Electrolyzers: true,
    substations: true,
    osmLivePlants: true,
    autobahnHpc: true,
    wsvHydroSensors: true,
    dwdWeatherStations: true,
    gridCorridors: true,
    redispatchCircles: true,
    tacticalSectors: true,
    placeLabels: true,
};

const TSO_CAMERA: Record<TsoZone, { lon: number; lat: number; zoom: number }> = {
    ALLE: { lon: 10.35, lat: 51.45, zoom: 5.8 },
    TenneT: { lon: 9.65, lat: 52.35, zoom: 6.3 },
    "50Hertz": { lon: 12.85, lat: 52.45, zoom: 6.6 },
    Amprion: { lon: 7.45, lat: 51.15, zoom: 6.7 },
    TransnetBW: { lon: 9.05, lat: 48.55, zoom: 7.2 },
};

export default function DigitalTwin() {
    const [snapshot, setSnapshot] = useState<NationalTelemetrySnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isScanningSector, setIsScanningSector] = useState(false);
    const [offsetHours, setOffsetHours] = useState(0);
    const [selectedTso, setSelectedTso] = useState<TsoZone>("ALLE");
    const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
    const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>({
        kind: "ASSET",
        id: "sub-wilster",
    });
    const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);

    const loadData = useCallback(async (offset: number, force = false) => {
        setIsLoading(true);
        try {
            const snap = await twinCache.getSnapshot(offset, force);
            setSnapshot(snap);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData(offsetHours, false);
    }, [offsetHours, loadData]);

    const handleToggleLayer = (key: keyof LayerVisibility) => {
        setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const triggerFlyTo = (cmd: Omit<CameraCommand, "nonce">) => {
        setCameraCommand({ ...cmd, nonce: Date.now() });
    };

    const handleSelectTso = (zone: TsoZone) => {
        setSelectedTso(zone);
        const cam = TSO_CAMERA[zone];
        triggerFlyTo({ lon: cam.lon, lat: cam.lat, zoom: cam.zoom, pitch: 0, bearing: 0 });
    };

    const handleScanViewport = useCallback(
        async (bounds: ViewportBounds) => {
            setIsScanningSector(true);
            try {
                const found = await scanViewportOverpassTargets(bounds);
                if (found.length > 0) {
                    twinCache.addScannedTargets(found);
                    const updated = await twinCache.getSnapshot(offsetHours, false);
                    setSnapshot(updated);
                }
            } finally {
                setIsScanningSector(false);
            }
        },
        [offsetHours]
    );

    if (!snapshot) {
        return (
            <div className="gaia-loading">
                INITIALISIERE BLUEBERRY SMART SYSTEM …
            </div>
        );
    }

    return (
        <div className="gaia-root">
            <TopCommandBar
                snapshot={snapshot}
                selectedTso={selectedTso}
                onSelectTso={handleSelectTso}
                offsetHours={offsetHours}
                isLoading={isLoading}
                onRefresh={() => void loadData(offsetHours, true)}
            />

            <div className="gaia-workbench">
                <MavenLeftDrawer
                    snapshot={snapshot}
                    layers={layers}
                    onToggleLayer={handleToggleLayer}
                    onSelectEntity={setSelectedEntity}
                    onFlyTo={triggerFlyTo}
                    onRefresh={() => void loadData(offsetHours, true)}
                    isLoading={isLoading}
                />

                <div className="gaia-center-pane">
                    <TimelineBarOverlay
                        timeline={snapshot.timeline}
                        offsetHours={offsetHours}
                        eeSharePct={snapshot.eeSharePct}
                        onChangeOffset={setOffsetHours}
                    />

                    <SatelliteTacticalMap
                        assets={snapshot.assets}
                        corridors={snapshot.corridors}
                        sectors={snapshot.sectors}
                        layers={layers}
                        selectedTso={selectedTso}
                        selectedEntity={selectedEntity}
                        cameraCommand={cameraCommand}
                        isScanningSector={isScanningSector}
                        onSelectEntity={setSelectedEntity}
                        onScanViewport={(b) => void handleScanViewport(b)}
                    />
                </div>

                <MavenSelectionDrawer
                    snapshot={snapshot}
                    selectedEntity={selectedEntity}
                    onSelectEntity={setSelectedEntity}
                    onFlyTo={triggerFlyTo}
                />
            </div>
        </div>
    );
}
