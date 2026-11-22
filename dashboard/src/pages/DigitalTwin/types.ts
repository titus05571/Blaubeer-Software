export type TsoZone = "ALLE" | "50Hertz" | "Amprion" | "TenneT" | "TransnetBW";

export type BasemapStyle = "satellite-hybrid" | "satellite-pure" | "dark-c2";

export type AssetCategory =
    | "wind_offshore"
    | "wind_onshore"
    | "solar"
    | "storage"
    | "biomass_hydro"
    | "h2_electrolyzer"
    | "substation"
    | "hpc_charger"
    | "hydro_sensor"
    | "weather_station";

export type ApiOrigin =
    | "MASTR_CORE"
    | "OVERPASS_OSM"
    | "OVERPASS_ISR_SCAN"
    | "AUTOBAHN_BUND"
    | "WSV_PEGELONLINE"
    | "DWD_BRIGHTSKY";

export type AssetStatus = "NOMINAL" | "REDISPATCH" | "PEAK";

export interface WeatherTelemetry {
    windSpeed120m: number;
    windDirection: number;
    solarIrradiance: number;
    temperature2m: number;
}

export interface EnergyAsset {
    id: string;
    mastrId: string;
    callsign: string;
    name: string;
    category: AssetCategory;
    apiOrigin: ApiOrigin;
    tso: Exclude<TsoZone, "ALLE">;
    bundesland: string;
    lat: number;
    lon: number;
    installedCapacityMw: number;
    currentOutputMw: number;
    utilizationPct: number;
    curtailedMw: number;
    redispatchRadiusKm: number;
    status: AssetStatus;
    weather: WeatherTelemetry;
    extraMetrics?: Record<string, string>;
}

export interface TransmissionCorridor {
    id: string;
    name: string;
    voltageKv: 380 | 525;
    type: "AC_380KV" | "HVDC_CORRIDOR";
    fromAssetId: string;
    toAssetId: string;
    waypoints: Array<[number, number]>;
    capacityMw: number;
    currentFlowMw: number;
    loadPct: number;
    congested: boolean;
}

export interface TacticalSectorPolygon {
    id: string;
    name: string;
    sectorType: "OFFSHORE_ZONE" | "SOLAR_CLUSTER" | "GRID_CORRIDOR_BOX";
    color: string;
    coordinates: Array<[number, number]>;
}

export interface TimelinePoint {
    offsetHours: number;
    label: string;
    windGw: number;
    solarGw: number;
    bioHydroGw: number;
    totalLoadGw: number;
    eeSharePct: number;
}

export interface ApiFeedStatus {
    name: string;
    endpoint: string;
    online: boolean;
    targetCount: number;
    detail: string;
}

export interface NationalTelemetrySnapshot {
    timestampIso: string;
    dataSourceMode: "LIVE_MULTI_API" | "HYBRID_DWD_SIM";
    gridFrequencyHz: number;
    totalLoadGw: number;
    renewableTotalGw: number;
    residualLoadGw: number;
    eeSharePct: number;
    gsiScore: number;
    co2IntensityGPerKwh: number;
    spotPriceEurMwh: number;
    bySourceGw: {
        windOnshore: number;
        windOffshore: number;
        solar: number;
        biomassHydro: number;
        storageDischarge: number;
    };
    apiFeeds: ApiFeedStatus[];
    assets: EnergyAsset[];
    corridors: TransmissionCorridor[];
    sectors: TacticalSectorPolygon[];
    timeline: TimelinePoint[];
}

export interface LayerVisibility {
    windOffshore: boolean;
    windOnshore: boolean;
    solar: boolean;
    storageAndHydro: boolean;
    h2Electrolyzers: boolean;
    substations: boolean;
    osmLivePlants: boolean;
    autobahnHpc: boolean;
    wsvHydroSensors: boolean;
    dwdWeatherStations: boolean;
    gridCorridors: boolean;
    redispatchCircles: boolean;
    tacticalSectors: boolean;
    placeLabels: boolean;
}

export type SelectedEntity =
    | { kind: "ASSET"; id: string }
    | { kind: "CORRIDOR"; id: string }
    | null;

export interface CameraCommand {
    lon: number;
    lat: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
    nonce: number;
}

export interface ViewportBounds {
    south: number;
    west: number;
    north: number;
    east: number;
}
