import type {
    ApiFeedStatus,
    AssetCategory,
    EnergyAsset,
    NationalTelemetrySnapshot,
    TacticalSectorPolygon,
    TimelinePoint,
    TransmissionCorridor,
    ViewportBounds,
    WeatherTelemetry,
} from "../types";

type TsoName = "50Hertz" | "Amprion" | "TenneT" | "TransnetBW";

interface BaseAssetSeed {
    id: string;
    mastrId: string;
    callsign: string;
    name: string;
    category: AssetCategory;
    tso: TsoName;
    bundesland: string;
    lat: number;
    lon: number;
    installedCapacityMw: number;
    redispatchRadiusKm: number;
}

const seed = (
    id: string,
    callsign: string,
    name: string,
    category: AssetCategory,
    tso: TsoName,
    bundesland: string,
    lat: number,
    lon: number,
    installedCapacityMw: number,
    redispatchRadiusKm: number
): BaseAssetSeed => ({
    id,
    mastrId: `MASTR-${callsign}`,
    callsign,
    name,
    category,
    tso,
    bundesland,
    lat,
    lon,
    installedCapacityMw,
    redispatchRadiusKm,
});

// Hinweis: Bei Umspannwerken (substation) ist installedCapacityMw = 0 (keine Stromerzeugung!)
const ASSET_SEEDS: BaseAssetSeed[] = [
    seed("off-borkum", "OFF-BRK-01", "Offshore Borkum Riffgrund 1–3", "wind_offshore", "TenneT", "AWZ Nordsee", 54.011, 6.598, 1850, 42),
    seed("off-godewind", "OFF-GDW-02", "Offshore Gode Wind 1–3", "wind_offshore", "TenneT", "AWZ Nordsee", 54.045, 7.025, 1120, 34),
    seed("off-helgoland", "OFF-AMR-03", "Offshore Amrumbank / Meerwind Süd", "wind_offshore", "TenneT", "AWZ Nordsee", 54.435, 7.692, 1420, 44),
    seed("off-butendiek", "OFF-BTD-04", "Offshore Windpark Butendiek (Sylt)", "wind_offshore", "TenneT", "AWZ Nordsee", 55.018, 7.774, 880, 32),
    seed("off-bard", "OFF-VEJ-05", "Offshore Veja Mate / BARD 1", "wind_offshore", "TenneT", "AWZ Nordsee", 54.322, 5.865, 1200, 36),
    seed("off-hohesee", "OFF-HHS-06", "EnBW Hohe See & Albatros", "wind_offshore", "TenneT", "AWZ Nordsee", 54.432, 6.328, 1110, 34),
    seed("off-arkona", "OFF-ARK-07", "Offshore Arkona / Wikinger (Rügen)", "wind_offshore", "50Hertz", "AWZ Ostsee", 54.783, 14.075, 1180, 38),
    seed("off-baltic2", "OFF-BLT-08", "EnBW Baltic 2 & Kriegers Flak", "wind_offshore", "50Hertz", "AWZ Ostsee", 54.982, 13.162, 940, 30),

    seed("on-reussenkoege", "WND-NF-01", "Bürgerwindpark Reußenköge", "wind_onshore", "TenneT", "Schleswig-Holstein", 54.6115, 8.9045, 260, 46),
    seed("on-dithmarschen", "WND-DIT-02", "Windcluster Friedrichskoog / Marne", "wind_onshore", "TenneT", "Schleswig-Holstein", 53.998, 8.925, 220, 36),
    seed("on-fehmarn", "WND-FEH-03", "Windfeld Fehmarn / Ostholstein", "wind_onshore", "TenneT", "Schleswig-Holstein", 54.462, 11.135, 180, 28),
    seed("on-holtriem", "WND-FRI-04", "Windpark Holtriem / Aurich", "wind_onshore", "TenneT", "Niedersachsen", 53.6085, 7.4522, 210, 38),
    seed("on-cuxhaven", "WND-CUX-05", "Windfeld Wurster Nordseeküste", "wind_onshore", "TenneT", "Niedersachsen", 53.752, 8.598, 190, 32),
    seed("on-emsland", "WND-EMS-06", "Windcluster Papenburg / Meppen", "wind_onshore", "Amprion", "Niedersachsen", 52.942, 7.335, 175, 30),
    seed("on-prignitz", "WND-PRG-07", "Windfeld Prignitz / Putlitz", "wind_onshore", "50Hertz", "Brandenburg", 53.218, 12.042, 230, 38),
    seed("on-uckermark", "WND-UCK-08", "Windfeld Uckermark / Prenzlau", "wind_onshore", "50Hertz", "Brandenburg", 53.268, 13.882, 310, 50),
    seed("on-odervorland", "WND-ODR-09", "Windpark Jacobsdorf / Odervorland", "wind_onshore", "50Hertz", "Brandenburg", 52.338, 14.352, 160, 28),
    seed("on-rostocker", "WND-MVP-10", "Windcluster Güstrow / Rostock-Süd", "wind_onshore", "50Hertz", "Mecklenburg-Vorpommern", 53.885, 12.185, 195, 34),
    seed("on-boerde", "WND-BRD-11", "Windfeld Magdeburger Börde", "wind_onshore", "50Hertz", "Sachsen-Anhalt", 51.965, 11.432, 240, 32),
    seed("on-sintfeld", "WND-SNT-12", "Windfeld Sintfeld / Paderborn", "wind_onshore", "Amprion", "Nordrhein-Westfalen", 51.6062, 8.9325, 185, 28),
    seed("on-vogelsberg", "WND-VOG-13", "Windcluster Vogelsberg", "wind_onshore", "TenneT", "Hessen", 50.592, 9.218, 140, 25),
    seed("on-hunsrueck", "WND-HUN-14", "Windpark Ellern / Hunsrück", "wind_onshore", "Amprion", "Rheinland-Pfalz", 49.988, 7.645, 195, 28),
    seed("on-ostalb", "WND-ALB-15", "Windpark Lauterstein / Ostalb", "wind_onshore", "TransnetBW", "Baden-Württemberg", 48.712, 9.912, 95, 22),
    seed("on-frankenwald", "WND-FRK-16", "Windcluster Hof / Frankenwald", "wind_onshore", "TenneT", "Bayern", 50.295, 11.825, 110, 22),

    seed("pv-witznitz", "SOL-WTZ-01", "Energiepark Witznitz (650 MWp)", "solar", "50Hertz", "Sachsen", 51.1605, 12.4042, 650, 24),
    seed("pv-weesow", "SOL-WEE-02", "Solarpark Weesow-Willmersdorf", "solar", "50Hertz", "Brandenburg", 52.6514, 13.7028, 187, 25),
    seed("pv-gottesgabe", "SOL-GOT-03", "Solarpark Gottesgabe & Aluhütte", "solar", "50Hertz", "Brandenburg", 52.635, 14.195, 300, 22),
    seed("pv-meuro", "SOL-LAU-04", "Solarkomplex Meuro / Senftenberg", "solar", "50Hertz", "Brandenburg", 51.5418, 13.9922, 166, 22),
    seed("pv-jaenschwalde", "SOL-JAE-05", "PV-Park Cottbus-Nord", "solar", "50Hertz", "Brandenburg", 51.792, 14.432, 145, 20),
    seed("pv-tramm", "SOL-TRM-06", "Solarpark Tramm-Göthen", "solar", "50Hertz", "Mecklenburg-Vorpommern", 53.528, 11.642, 172, 20),
    seed("pv-handewitt", "SOL-SLW-07", "Solarpark Eggebek / Handewitt", "solar", "TenneT", "Schleswig-Holstein", 54.622, 9.352, 110, 20),
    seed("pv-schornhof", "SOL-ING-08", "Solarpark Schornhof / Ingolstadt", "solar", "TenneT", "Bayern", 48.6536, 11.2338, 140, 28),
    seed("pv-straubing", "SOL-NDB-09", "PV-Gürtel Gäuboden / Plattling", "solar", "TenneT", "Bayern", 48.782, 12.865, 180, 28),
    seed("pv-bundorf", "SOL-UFR-10", "Bürger-Solarpark Bundorf", "solar", "TenneT", "Bayern", 50.218, 10.512, 125, 20),
    seed("pv-mengen", "SOL-OBW-11", "Solarpark Mengen / Oberschwaben", "solar", "TransnetBW", "Baden-Württemberg", 48.048, 9.358, 130, 20),
    seed("pv-indeland", "SOL-NRW-12", "PV-Cluster Rheinisches Revier", "solar", "Amprion", "Nordrhein-Westfalen", 50.892, 6.418, 120, 22),

    seed("st-goldisthal", "PSW-GLD-01", "Pumpspeicherwerk Goldisthal", "storage", "50Hertz", "Thüringen", 50.5094, 11.0053, 1060, 18),
    seed("st-markersbach", "PSW-MRK-02", "Pumpspeicherwerk Markersbach", "storage", "50Hertz", "Sachsen", 50.528, 12.875, 1050, 18),
    seed("st-wehr", "PSW-WHR-03", "Pumpspeicherwerk Wehr / Schluchsee", "storage", "TransnetBW", "Baden-Württemberg", 47.658, 7.942, 910, 18),
    seed("st-waldeck", "PSW-WLD-04", "Pumpspeicherwerk Waldeck / Edersee", "storage", "TenneT", "Hessen", 51.182, 9.055, 620, 16),
    seed("st-jardelund", "BAT-JRD-05", "Großbatterie Bollingstedt / Jardelund", "storage", "TenneT", "Schleswig-Holstein", 54.8286, 9.2055, 48, 20),
    seed("st-hamm", "BAT-HAM-06", "Großbatterie Hamm-Uentrop", "storage", "Amprion", "Nordrhein-Westfalen", 51.682, 7.962, 117, 20),
    seed("hy-iffezheim", "HYD-IFF-01", "Rheinkraftwerk Iffezheim", "biomass_hydro", "TransnetBW", "Baden-Württemberg", 48.8336, 8.1114, 148, 18),
    seed("hy-isar-geo", "GEO-MUC-02", "Geothermie & Laufwasser Sauerlach", "biomass_hydro", "TenneT", "Bayern", 47.978, 11.652, 45, 18),

    // Elektrolyseure & Umspannwerke: 0 MW Stromerzeugung (Verbraucher bzw. Netzknoten!)
    seed("h2-lingen", "H2-LNG-300", "GET H2 Nukleus Elektrolyseur Lingen (Last)", "h2_electrolyzer", "Amprion", "Niedersachsen", 52.492, 7.318, 0, 16),
    seed("h2-leuna", "H2-LEU-100", "Grüner H2-Elektrolyseur Leuna (Last)", "h2_electrolyzer", "50Hertz", "Sachsen-Anhalt", 51.312, 12.012, 0, 16),
    seed("h2-heide", "H2-HEI-150", "Westküste 100 H2-Hub Heide (Last)", "h2_electrolyzer", "TenneT", "Schleswig-Holstein", 54.185, 9.085, 0, 16),

    seed("sub-wilster", "SUB-WIL-380", "UW Wilster West (380kV Netzknoten)", "substation", "TenneT", "Schleswig-Holstein", 53.9308, 9.3506, 0, 54),
    seed("sub-emden", "SUB-EMD-525", "Konverterstation Emden/Ost (380/525kV)", "substation", "Amprion", "Niedersachsen", 53.368, 7.248, 0, 42),
    seed("sub-wolmirstedt", "SUB-WLM-380", "UW Wolmirstedt (380kV Netzknoten)", "substation", "50Hertz", "Sachsen-Anhalt", 52.2569, 11.6083, 0, 44),
    seed("sub-lubmin", "SUB-LUB-380", "UW Lubmin (380kV Ostsee-Knoten)", "substation", "50Hertz", "Mecklenburg-Vorpommern", 54.142, 13.648, 0, 38),
    seed("sub-osterath", "SUB-OST-380", "UW / Konverter Osterath (380kV)", "substation", "Amprion", "Nordrhein-Westfalen", 51.265, 6.628, 0, 30),
    seed("sub-grafenrheinfeld", "SUB-GRF-380", "UW Bergrheinfeld (380kV Netzknoten)", "substation", "TenneT", "Bayern", 50.0006, 10.1802, 0, 34),
    seed("sub-isar", "SUB-ISR-525", "UW Isar / Niederaichbach (380kV)", "substation", "TenneT", "Bayern", 48.606, 12.295, 0, 32),
    seed("sub-philippsburg", "SUB-PHL-380", "UW / Konverter Philippsburg (380kV)", "substation", "TransnetBW", "Baden-Württemberg", 49.252, 8.438, 0, 30),
];

const REGIONAL_GRAPH_FALLBACK: Array<[string, AssetCategory, number, number, number]> = [
    ["Windpark Nauen-Havelland", "wind_onshore", 52.61, 12.88, 95],
    ["Windpark Klettwitz (Lausitz)", "wind_onshore", 51.54, 13.89, 115],
    ["Windpark Stößen-Teuchern", "wind_onshore", 51.12, 11.96, 90],
    ["Windpark Schneebergerhof", "wind_onshore", 49.68, 7.89, 45],
    ["Windpark Druiberg (Harz)", "wind_onshore", 51.99, 10.81, 75],
    ["Windpark Asseln (Lichtenau)", "wind_onshore", 51.66, 8.97, 85],
    ["Offshore Alpha Ventus", "wind_offshore", 54.01, 6.61, 60],
    ["Offshore Trianel Borkum", "wind_offshore", 54.04, 6.42, 400],
    ["Offshore DanTysk", "wind_offshore", 55.14, 7.21, 288],
    ["Offshore Sandbank", "wind_offshore", 55.19, 6.86, 288],
    ["Solarpark Neuhardenberg", "solar", 52.61, 14.24, 145],
    ["Solarpark Templin-Groß Dölln", "solar", 53.03, 13.54, 128],
    ["Solarpark FinowTower", "solar", 52.83, 13.68, 85],
    ["Solarpark Lieberose", "solar", 51.93, 14.37, 71],
    ["Solarpark Waldpolenz", "solar", 51.33, 12.63, 52],
    ["380kV UW Audorf", "substation", 54.31, 9.72, 0],
    ["380kV UW Dollern", "substation", 53.54, 9.51, 0],
    ["380kV UW Landesbergen", "substation", 52.56, 9.12, 0],
    ["380kV UW Wahle", "substation", 52.27, 10.37, 0],
    ["380kV UW Mecklar", "substation", 50.91, 9.74, 0],
    ["380kV UW Kriftel", "substation", 50.09, 8.47, 0],
    ["380kV UW Daxlanden", "substation", 49.01, 8.33, 0],
    ["380kV UW Raitersaich", "substation", 49.36, 10.85, 0],
    ["PSW Koepchenwerk", "storage", 51.41, 7.45, 153],
    ["PSW Geesthacht", "storage", 53.42, 10.41, 120],
];

const TACTICAL_SECTORS: TacticalSectorPolygon[] = [
    { id: "sec-awz-nordsee", name: "AWZ Nordsee Offshore-Sektor", sectorType: "OFFSHORE_ZONE", color: "#3b82f6", coordinates: [[5.65, 53.78], [8.25, 53.78], [8.25, 55.12], [5.65, 55.12], [5.65, 53.78]] },
    { id: "sec-awz-ostsee", name: "AWZ Ostsee Offshore-Sektor", sectorType: "OFFSHORE_ZONE", color: "#3b82f6", coordinates: [[13.05, 54.45], [14.62, 54.45], [14.62, 55.12], [13.05, 55.12], [13.05, 54.45]] },
    { id: "sec-lausitz-solar", name: "Sektor Lausitz Solar-Cluster", sectorType: "SOLAR_CLUSTER", color: "#22c55e", coordinates: [[12.05, 51.02], [14.55, 51.02], [14.55, 51.92], [12.05, 51.92], [12.05, 51.02]] },
    { id: "sec-bayern-pv", name: "Sektor Donau-Isar PV-Gürtel", sectorType: "SOLAR_CLUSTER", color: "#22c55e", coordinates: [[10.85, 48.35], [13.05, 48.35], [13.05, 49.05], [10.85, 49.05], [10.85, 48.35]] },
    { id: "sec-rhein-ruhr", name: "Lastschwerpunkt Rhein-Ruhr / H2", sectorType: "GRID_CORRIDOR_BOX", color: "#a855f7", coordinates: [[6.25, 50.75], [8.15, 50.75], [8.15, 51.85], [6.25, 51.85], [6.25, 50.75]] },
];

const CORRIDOR_SEEDS: Array<{
    id: string;
    name: string;
    voltageKv: 380 | 525;
    type: "AC_380KV" | "HVDC_CORRIDOR";
    fromAssetId: string;
    toAssetId: string;
    midWaypoints?: Array<[number, number]>;
    capacityMw: number;
}> = [
    { id: "cor-dolwin", name: "HGÜ DolWin / BorWin Nordsee → Emden (Bestand)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "off-borkum", toAssetId: "sub-emden", capacityMw: 3200 },
    { id: "cor-sylwin", name: "HGÜ HelWin / SylWin → Wilster (Bestand)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "off-helgoland", toAssetId: "sub-wilster", midWaypoints: [[8.55, 54.12]], capacityMw: 2800 },
    { id: "cor-anord", name: "Korridor A-Nord (Emden → Osterath, Netzausbau)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "sub-emden", toAssetId: "sub-osterath", midWaypoints: [[7.25, 52.35]], capacityMw: 2000 },
    { id: "cor-ultranet", name: "Korridor Ultranet (Osterath → Philippsburg)", voltageKv: 380, type: "HVDC_CORRIDOR", fromAssetId: "sub-osterath", toAssetId: "sub-philippsburg", midWaypoints: [[7.52, 50.15]], capacityMw: 2000 },
    { id: "cor-suedlink-1", name: "380kV Nord-Süd / SuedLink-Achse (Wilster → Franken)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "sub-wilster", toAssetId: "sub-grafenrheinfeld", midWaypoints: [[9.45, 52.55], [9.78, 51.25]], capacityMw: 4000 },
    { id: "cor-suedlink-2", name: "380kV Nord-Süd / SuedLink-West (Wilster → Baden)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "sub-wilster", toAssetId: "sub-philippsburg", midWaypoints: [[9.05, 52.15], [8.85, 50.35]], capacityMw: 4000 },
    { id: "cor-suedostlink", name: "380kV Ost-Süd / SuedOstLink-Achse (Wolmirstedt → Isar)", voltageKv: 525, type: "HVDC_CORRIDOR", fromAssetId: "sub-wolmirstedt", toAssetId: "sub-isar", midWaypoints: [[11.98, 50.85], [12.12, 49.65]], capacityMw: 4000 },
    { id: "cor-ostsee-lubmin", name: "Ostsee-Netzanbindung Arkona → UW Lubmin", voltageKv: 380, type: "AC_380KV", fromAssetId: "off-arkona", toAssetId: "sub-lubmin", capacityMw: 2400 },
    { id: "cor-lubmin-wolmir", name: "380kV Ost-Magistrale (Lubmin → Wolmirstedt)", voltageKv: 380, type: "AC_380KV", fromAssetId: "sub-lubmin", toAssetId: "sub-wolmirstedt", midWaypoints: [[13.88, 53.26], [13.25, 52.62]], capacityMw: 2900 },
    { id: "cor-sued-kuppel", name: "380kV Süd-Kuppelleitung (Philippsburg → Isar)", voltageKv: 380, type: "AC_380KV", fromAssetId: "sub-philippsburg", toAssetId: "sub-isar", midWaypoints: [[10.35, 48.85]], capacityMw: 2800 },
];

export function buildSatelliteReconUrl(lat: number, lon: number, deltaDeg = 0.011): string {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dLon = deltaDeg / Math.max(0.35, cosLat);
    return (
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
        `?bbox=${(lon - dLon).toFixed(5)},${(lat - deltaDeg * 0.62).toFixed(5)},${(lon + dLon).toFixed(5)},${(lat + deltaDeg * 0.62).toFixed(5)}` +
        `&bboxSR=4326&imageSR=3857&size=560,320&format=jpg&f=image`
    );
}

export function createGeoCirclePolygon(lat: number, lon: number, radiusKm: number, steps = 40): Array<[number, number]> {
    const coords: Array<[number, number]> = [];
    const latRad = (lat * Math.PI) / 180;
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.cos(latRad));
    for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        coords.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
    }
    return coords;
}

function guessTso(lat: number, lon: number): TsoName {
    if (lon >= 11.2 && lat >= 50.3) return "50Hertz";
    if (lat < 49.4 && lon < 10.2) return "TransnetBW";
    if (lon < 8.6 && lat < 52.8) return "Amprion";
    return "TenneT";
}

interface OpenMeteoNodeHourly {
    time: string[];
    temperature_2m: number[];
    shortwave_radiation: number[];
    wind_speed_120m: number[];
    wind_direction_120m: number[];
}

async function fetchDwdWeatherMatrix(): Promise<OpenMeteoNodeHourly[] | null> {
    try {
        const lats = ASSET_SEEDS.map((a) => a.lat.toFixed(3)).join(",");
        const lons = ASSET_SEEDS.map((a) => a.lon.toFixed(3)).join(",");
        const url =
            `https://api.open-meteo.com/v1/dwd-icon?latitude=${lats}&longitude=${lons}` +
            `&hourly=temperature_2m,shortwave_radiation,wind_speed_120m,wind_direction_120m` +
            `&wind_speed_unit=ms&past_days=1&forecast_days=2&timezone=GMT`;
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) return null;
        const json: unknown = await res.json();
        if (!Array.isArray(json)) return null;
        return json.map((item: Record<string, unknown>) => item.hourly as OpenMeteoNodeHourly);
    } catch {
        return null;
    }
}

interface RawGraphNode {
    id: string;
    mastrId: string;
    callsign: string;
    name: string;
    category: AssetCategory;
    lat: number;
    lon: number;
    capMw: number;
    qid: string;
}

// Lädt reale Geostandorte aus Wikidata (Stammdaten; Wetter & Leistung werden anschließend live aus DWD berechnet!)
async function fetchGermanEnergyGraphNodes(): Promise<RawGraphNode[]> {
    const sparql = `SELECT ?item ?itemLabel ?coord ?type WHERE { VALUES ?type { wd:Q194356 wd:Q1003207 wd:Q2298412 wd:Q339353 wd:Q15911738 wd:Q174814 } ?item wdt:P31 ?type ; wdt:P17 wd:Q183 ; wdt:P625 ?coord . SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } } LIMIT 180`;
    try {
        const res = await fetch(
            `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
            { signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
            const json = (await res.json()) as {
                results?: {
                    bindings?: Array<{
                        item?: { value?: string };
                        itemLabel?: { value?: string };
                        coord?: { value?: string };
                        type?: { value?: string };
                    }>;
                };
            };
            const out: RawGraphNode[] = [];
            for (const b of json.results?.bindings ?? []) {
                if (out.length >= 135) break;
                const m = (b.coord?.value ?? "").match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
                if (!m) continue;
                const lon = Number(m[1]);
                const lat = Number(m[2]);
                if (Number.isNaN(lat) || Number.isNaN(lon) || lat < 47.2 || lat > 55.2 || lon < 5.6 || lon > 15.1) continue;
                if (ASSET_SEEDS.some((s) => Math.hypot(s.lat - lat, s.lon - lon) < 0.1)) continue;
                if (out.some((o) => Math.hypot(o.lat - lat, o.lon - lon) < 0.12)) continue;

                const t = b.type?.value ?? "";
                const qid = (b.item?.value ?? "").split("/").pop() ?? `${out.length}`;
                let category: AssetCategory = "wind_onshore";
                let prefix = "GEO-WND";
                let capMw = 48;

                if (t.endsWith("Q1003207") || t.endsWith("Q2298412")) {
                    category = "solar";
                    prefix = "GEO-SOL";
                    capMw = 45;
                } else if (t.endsWith("Q339353")) {
                    category = "storage";
                    prefix = "GEO-PSW";
                    capMw = 220;
                } else if (t.endsWith("Q15911738")) {
                    category = "biomass_hydro";
                    prefix = "GEO-HYD";
                    capMw = 42;
                } else if (t.endsWith("Q174814")) {
                    // Umspannwerk: erzeugt 0 MW!
                    category = "substation";
                    prefix = "GEO-SUB";
                    capMw = 0;
                }

                const idx = out.length + 1;
                out.push({
                    id: `wkd-${qid}-${idx}`,
                    mastrId: `WKD-${qid}`,
                    callsign: `${prefix}-${idx.toString().padStart(3, "0")}`,
                    name: b.itemLabel?.value ?? `Energieanlage ${qid}`,
                    category,
                    lat,
                    lon,
                    capMw,
                    qid,
                });
            }
            if (out.length > 0) return out;
        }
    } catch {
        // Fallback
    }

    return REGIONAL_GRAPH_FALLBACK.map(([name, category, lat, lon, capMw], i) => ({
        id: `reg-${i + 1}`,
        mastrId: `DE-REG-${1000 + i}`,
        callsign: `REG-${(i + 1).toString().padStart(3, "0")}`,
        name,
        category,
        lat,
        lon,
        capMw,
        qid: `REG-${i + 1}`,
    }));
}

// AUTOBAHN GMBH BUNDES-API: Echte Standorte von HPC-Ladeparks (0 MW Stromerzeugung, reine Ladeinfrastruktur!)
async function fetchAutobahnHpcHubs(): Promise<EnergyAsset[]> {
    const highways = ["A1", "A2", "A3", "A7", "A8", "A9"];
    const out: EnergyAsset[] = [];
    try {
        const lists = await Promise.all(
            highways.map(async (bab) => {
                try {
                    const res = await fetch(
                        `https://verkehr.autobahn.de/o/autobahn/${bab}/services/electric_charging_station`,
                        { signal: AbortSignal.timeout(5500) }
                    );
                    if (!res.ok) return [];
                    const json = (await res.json()) as {
                        electric_charging_station?: Array<{
                            title?: string;
                            subtitle?: string;
                            coordinate?: { lat?: string | number; long?: string | number };
                        }>;
                    };
                    return (json.electric_charging_station ?? []).slice(0, 10).map((item) => ({ bab, item }));
                } catch {
                    return [];
                }
            })
        );
        for (const entry of lists.flat()) {
            if (out.length >= 44) break;
            const lat = Number(entry.item.coordinate?.lat);
            const lon = Number(entry.item.coordinate?.long);
            if (Number.isNaN(lat) || Number.isNaN(lon) || lat < 47.3 || lat > 55.0) continue;
            if (out.some((ex) => Math.hypot(ex.lat - lat, ex.lon - lon) < 0.25)) continue;
            const idx = out.length + 1;
            out.push({
                id: `hpc-${entry.bab}-${idx}`,
                mastrId: `BUND-HPC-${entry.bab}-${idx}`,
                callsign: `HPC-${entry.bab}-${idx.toString().padStart(2, "0")}`,
                name: `${entry.item.title ?? "HPC-Schnellladepark"} (${entry.bab})`,
                category: "hpc_charger",
                apiOrigin: "AUTOBAHN_BUND",
                tso: guessTso(lat, lon),
                bundesland: entry.item.subtitle ?? `Autobahn ${entry.bab}`,
                lat,
                lon,
                installedCapacityMw: 0,
                currentOutputMw: 0,
                utilizationPct: 0,
                curtailedMw: 0,
                redispatchRadiusKm: 8,
                status: "NOMINAL",
                weather: { windSpeed120m: 0, windDirection: 0, solarIrradiance: 0, temperature2m: 0 },
                extraMetrics: {
                    "AUTOBAHN": entry.bab,
                    "ANLAGENROLLE": "Ladeinfrastruktur / Stromverbraucher (0 MW Erzeugung)",
                    "API-DATENINHALT": "Echte Standort-Stammdaten (keine Live-Belegung)",
                },
            });
        }
    } catch {
        // Fallback leer
    }
    return out;
}

// WSV PEGELONLINE BUNDES-API: Echte Live-Wasserstände in cm (0 MW Eigenerzeugung, reiner Hydro-Sensor!)
async function fetchWsvPegelStations(): Promise<EnergyAsset[]> {
    try {
        const res = await fetch(
            "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true&includeCurrentMeasurement=true",
            { signal: AbortSignal.timeout(6500) }
        );
        if (!res.ok) return [];
        const raw = (await res.json()) as Array<{
            uuid?: string;
            shortname?: string;
            longname?: string;
            km?: number;
            longitude?: number;
            latitude?: number;
            water?: { shortname?: string };
            timeseries?: Array<{ shortname?: string; currentMeasurement?: { value?: number } }>;
        }>;
        const rivers = new Set(["RHEIN", "DONAU", "ELBE", "MOSEL", "WESER", "MAIN", "NECKAR", "INN"]);
        const out: EnergyAsset[] = [];

        for (const st of raw) {
            if (out.length >= 38) break;
            const lat = st.latitude;
            const lon = st.longitude;
            const river = st.water?.shortname?.toUpperCase() ?? "";
            if (typeof lat !== "number" || typeof lon !== "number" || !rivers.has(river)) continue;
            if (lat < 47.3 || lat > 54.9 || lon < 5.9 || lon > 14.9) continue;
            if (out.some((ex) => Math.hypot(ex.lat - lat, ex.lon - lon) < 0.34)) continue;

            const levelCm = st.timeseries?.find((t) => t.shortname === "W")?.currentMeasurement?.value;
            if (typeof levelCm !== "number") continue;
            const idx = out.length + 1;
            out.push({
                id: `wsv-${st.uuid ?? idx}`,
                mastrId: `WSV-${river}-${Math.round(st.km ?? idx)}`,
                callsign: `PEG-${river.slice(0, 3)}-${idx.toString().padStart(2, "0")}`,
                name: `WSV Pegel ${st.longname ?? st.shortname} (${river})`,
                category: "hydro_sensor",
                apiOrigin: "WSV_PEGELONLINE",
                tso: guessTso(lat, lon),
                bundesland: `Flussgebiet ${river}`,
                lat,
                lon,
                installedCapacityMw: 0,
                currentOutputMw: 0,
                utilizationPct: 0,
                curtailedMw: 0,
                redispatchRadiusKm: 10,
                status: "NOMINAL",
                weather: { windSpeed120m: 0, windDirection: 0, solarIrradiance: 0, temperature2m: 0 },
                extraMetrics: {
                    "PEGELSTAND (ECHTZEIT-MESSUNG)": `${Math.round(levelCm)} cm`,
                    "GEWÄSSER / FLUSS-KM": `${river} (km ${st.km ?? 0})`,
                    "ANLAGENROLLE": "Hydrologischer Bundes-Messpegel (kein Kraftwerk)",
                },
            });
        }
        return out;
    } catch {
        return [];
    }
}

// DWD BRIGHT SKY SYNOP STATIONEN: Echte Live-Wettermessstationen (0 MW Stromerzeugung!)
const DWD_SYNOP_POINTS = [
    { code: "DWD-HLG", label: "DWD Station Helgoland", lat: 54.175, lon: 7.892 },
    { code: "DWD-KIL", label: "DWD Station Kiel-Holtenau", lat: 54.378, lon: 10.142 },
    { code: "DWD-WRN", label: "DWD Station Rostock-Warnemünde", lat: 54.18, lon: 12.081 },
    { code: "DWD-EMD", label: "DWD Station Emden", lat: 53.388, lon: 7.229 },
    { code: "DWD-BER", label: "DWD Station Berlin-Tempelhof", lat: 52.468, lon: 13.402 },
    { code: "DWD-BRK", label: "DWD Höhenstation Brocken (1141m)", lat: 51.8, lon: 10.618 },
    { code: "DWD-KAH", label: "DWD Höhenstation Kahler Asten", lat: 51.18, lon: 8.489 },
    { code: "DWD-DRS", label: "DWD Station Dresden", lat: 51.128, lon: 13.754 },
    { code: "DWD-FRA", label: "DWD Station Frankfurt/Main", lat: 50.026, lon: 8.521 },
    { code: "DWD-NUE", label: "DWD Station Nürnberg", lat: 49.503, lon: 11.055 },
    { code: "DWD-FRB", label: "DWD Station Freiburg", lat: 48.023, lon: 7.834 },
    { code: "DWD-ZUG", label: "DWD Station Hohenpeißenberg", lat: 47.801, lon: 11.011 },
];

async function fetchDwdBrightSkyStations(): Promise<EnergyAsset[]> {
    const items = await Promise.all(
        DWD_SYNOP_POINTS.map(async (pt) => {
            try {
                const res = await fetch(`https://api.brightsky.dev/current_weather?lat=${pt.lat}&lon=${pt.lon}`, {
                    signal: AbortSignal.timeout(5500),
                });
                if (!res.ok) return null;
                const data = (await res.json()) as {
                    weather?: {
                        temperature?: number;
                        wind_speed_10?: number;
                        wind_gust_speed_10?: number;
                        wind_direction_10?: number;
                        cloud_cover?: number;
                        pressure_msl?: number;
                        solar_10?: number;
                    };
                    sources?: Array<{ wmo_station_id?: string }>;
                };
                if (!data.weather) return null;
                const w = data.weather;
                const wind10Ms = Number(((w.wind_speed_10 ?? 0) / 3.6).toFixed(1));
                const asset: EnergyAsset = {
                    id: `dwd-${pt.code.toLowerCase()}`,
                    mastrId: `WMO-${data.sources?.[0]?.wmo_station_id ?? "SYNOP"}`,
                    callsign: pt.code,
                    name: pt.label,
                    category: "weather_station",
                    apiOrigin: "DWD_BRIGHTSKY",
                    tso: guessTso(pt.lat, pt.lon),
                    bundesland: "DWD SYNOP Messnetz",
                    lat: pt.lat,
                    lon: pt.lon,
                    installedCapacityMw: 0,
                    currentOutputMw: 0,
                    utilizationPct: 0,
                    curtailedMw: 0,
                    redispatchRadiusKm: 12,
                    status: "NOMINAL",
                    weather: {
                        windSpeed120m: wind10Ms,
                        windDirection: Math.round(w.wind_direction_10 ?? 0),
                        solarIrradiance: typeof w.solar_10 === "number" ? Math.round(w.solar_10 * 6000) : 0,
                        temperature2m: Number((w.temperature ?? 0).toFixed(1)),
                    },
                    extraMetrics: {
                        "GEMESSENE BÖE (10m)": `${Math.round(w.wind_gust_speed_10 ?? 0)} km/h`,
                        "WIND (10m MESSMAST)": `${wind10Ms} m/s (${Math.round(w.wind_direction_10 ?? 0)}°)`,
                        "LUFTDRUCK / BEWÖLKUNG": `${w.pressure_msl ?? 1013} hPa // ${w.cloud_cover ?? 0} %`,
                        "ANLAGENROLLE": "Offizielle DWD-Wetterstation (0 MW Erzeugung)",
                    },
                };
                return asset;
            } catch {
                return null;
            }
        })
    );
    return items.filter((x): x is EnergyAsset => x !== null);
}

// ISR SEKTOR-SCAN (14km Radius)
export async function scanViewportOverpassTargets(bounds: ViewportBounds): Promise<EnergyAsset[]> {
    const cLat = ((bounds.south + bounds.north) / 2).toFixed(4);
    const cLon = ((bounds.west + bounds.east) / 2).toFixed(4);
    const ql = `[out:json][timeout:6];(node["power"="generator"](around:14000,${cLat},${cLon});node["power"="substation"](around:14000,${cLat},${cLon}););out qt 160;`;
    const mirrors = [
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ];
    for (const base of mirrors) {
        try {
            const res = await fetch(`${base}?data=${encodeURIComponent(ql)}`, { signal: AbortSignal.timeout(6500) });
            if (!res.ok) continue;
            const json = (await res.json()) as {
                elements?: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>;
            };
            if (!json.elements?.length) continue;
            return json.elements.slice(0, 160).flatMap((el, i) => {
                if (typeof el.lat !== "number" || typeof el.lon !== "number") return [];
                const tags = el.tags ?? {};
                const isSub = tags.power === "substation";
                const isSolar = tags["generator:source"] === "solar";
                const category: AssetCategory = isSub ? "substation" : isSolar ? "solar" : "wind_onshore";
                const code = isSub ? "ISR-SUB" : isSolar ? "ISR-PV" : "ISR-WND";
                return [
                    {
                        id: `isr-${el.id}`,
                        mastrId: `OSM-${el.id}`,
                        callsign: `${code}-${(i + 1).toString().padStart(3, "0")}`,
                        name: tags.name ?? `${code} Anlage #${el.id}`,
                        category,
                        apiOrigin: "OVERPASS_ISR_SCAN" as const,
                        tso: guessTso(el.lat, el.lon),
                        bundesland: "Overpass OSM 14km-Scan",
                        lat: el.lat,
                        lon: el.lon,
                        installedCapacityMw: isSub ? 0 : isSolar ? 2 : 4,
                        currentOutputMw: 0,
                        utilizationPct: 0,
                        curtailedMw: 0,
                        redispatchRadiusKm: 6,
                        status: "NOMINAL" as const,
                        weather: { windSpeed120m: 0, windDirection: 0, solarIrradiance: 0, temperature2m: 0 },
                    },
                ];
            });
        } catch {
            // Nächster Mirror
        }
    }
    return [];
}

async function fetchCorrentlyGsi(): Promise<{ gsi: number; co2: number } | null> {
    try {
        const res = await fetch("https://api.corrently.io/v2.0/gsi/prediction?zip=10115", { signal: AbortSignal.timeout(4500) });
        if (!res.ok) return null;
        const json = (await res.json()) as { forecast?: Array<{ gsi?: number; co2_g_standard?: number }> };
        const f = json.forecast?.[0];
        return typeof f?.gsi === "number" ? { gsi: Math.round(f.gsi), co2: Math.round(f.co2_g_standard ?? 240) } : null;
    } catch {
        return null;
    }
}

function computeWindCf(windMs: number, offshore: boolean): number {
    if (windMs < 3.0 || windMs > 26.0) return 0;
    const rated = offshore ? 11.4 : 12.2;
    if (windMs >= rated) return offshore ? 0.94 : 0.89;
    return Math.min(1, Math.pow((windMs - 3.0) / (rated - 3.0), 2.1) * 0.92);
}

function computeSolarCf(ghiWm2: number, tempC: number): number {
    if (ghiWm2 <= 5) return 0;
    const derate = Math.max(0.83, 1 - Math.max(0, tempC - 25) * 0.004);
    return Math.min(0.92, (ghiWm2 / 910) * derate);
}

function fallbackWeather(s: BaseAssetSeed, targetDate: Date): WeatherTelemetry {
    const utcH = targetDate.getUTCHours() + targetDate.getUTCMinutes() / 60;
    const cetH = (utcH + 1) % 24;
    const sun = Math.max(0, Math.sin(((cetH - 7.5) / 9) * Math.PI));
    const north = (s.lat - 47.5) / 7.5;
    return {
        windSpeed120m: Number((5.2 + north * 5.0).toFixed(1)),
        windDirection: 245,
        solarIrradiance: Math.round(sun * 420),
        temperature2m: 6.5,
    };
}

function closestHourIdx(times: string[], targetDate: Date): number {
    const tMs = targetDate.getTime();
    let best = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i++) {
        const d = Math.abs(Date.parse(`${times[i]}Z`) - tMs);
        if (d < minDiff) {
            minDiff = d;
            best = i;
        }
    }
    return best;
}

export class TwinSnapshotCache {
    private dwdHourly: OpenMeteoNodeHourly[] | null = null;
    private rawGraphNodes: RawGraphNode[] = [];
    private autobahnTargets: EnergyAsset[] = [];
    private wsvTargets: EnergyAsset[] = [];
    private dwdSynopTargets: EnergyAsset[] = [];
    private isrScannedTargets: EnergyAsset[] = [];
    private gsiOverride: { gsi: number; co2: number } | null = null;
    private lastFetchMs = 0;

    public addScannedTargets(newTargets: EnergyAsset[]): void {
        const byId = new Map(this.isrScannedTargets.map((t) => [t.id, t]));
        newTargets.forEach((t) => byId.set(t.id, t));
        this.isrScannedTargets = Array.from(byId.values()).slice(-400);
    }

    public async getSnapshot(offsetHours: number, force = false): Promise<NationalTelemetrySnapshot> {
        const now = Date.now();
        if (force || !this.dwdHourly || now - this.lastFetchMs > 240_000) {
            const [dwd, wsv, synop, wkdNodes, hpc, gsi] = await Promise.all([
                fetchDwdWeatherMatrix(),
                fetchWsvPegelStations(),
                fetchDwdBrightSkyStations(),
                fetchGermanEnergyGraphNodes(),
                fetchAutobahnHpcHubs(),
                fetchCorrentlyGsi(),
            ]);

            if (dwd) this.dwdHourly = dwd;
            if (wsv.length > 0) this.wsvTargets = wsv;
            if (synop.length > 0) this.dwdSynopTargets = synop;
            if (wkdNodes.length > 0) this.rawGraphNodes = wkdNodes;
            if (hpc.length > 0) this.autobahnTargets = hpc;
            if (gsi) this.gsiOverride = gsi;
            this.lastFetchMs = now;
        }
        return this.buildSnapshot(new Date(now + offsetHours * 3_600_000));
    }

    private weatherAtSeed(idx: number, targetDate: Date): WeatherTelemetry {
        const s = ASSET_SEEDS[idx];
        const h = this.dwdHourly?.[idx];
        if (!h?.time?.length) return fallbackWeather(s, targetDate);
        const i = closestHourIdx(h.time, targetDate);
        return {
            windSpeed120m: Number((h.wind_speed_120m?.[i] ?? 0).toFixed(1)),
            windDirection: Math.round(h.wind_direction_120m?.[i] ?? 0),
            solarIrradiance: Math.round(Math.max(0, h.shortwave_radiation?.[i] ?? 0)),
            temperature2m: Number((h.temperature_2m?.[i] ?? 0).toFixed(1)),
        };
    }

    // Sucht den nächstgelegenen echten DWD-ICON-D2-Wetterpunkt für beliebige Koordinaten in Deutschland!
    private nearestRealDwdWeather(lat: number, lon: number, seedWeathers: WeatherTelemetry[]): WeatherTelemetry {
        let bestIdx = 0;
        let minDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < ASSET_SEEDS.length; i++) {
            const d = Math.hypot(ASSET_SEEDS[i].lat - lat, ASSET_SEEDS[i].lon - lon);
            if (d < minDist) {
                minDist = d;
                bestIdx = i;
            }
        }
        return seedWeathers[bestIdx];
    }

    private computePowerForGenerator(category: AssetCategory, capMw: number, w: WeatherTelemetry, highReGrid: boolean) {
        if (capMw <= 0) return { outputMw: 0, utilPct: 0, cf: 0 };
        let cf = 0;
        if (category === "wind_offshore") cf = computeWindCf(w.windSpeed120m, true);
        else if (category === "wind_onshore") cf = computeWindCf(w.windSpeed120m, false);
        else if (category === "solar") cf = computeSolarCf(w.solarIrradiance, w.temperature2m);
        else if (category === "storage") cf = highReGrid ? 0.15 : 0.65;
        else if (category === "biomass_hydro") cf = 0.68;

        const outputMw = Math.round(capMw * cf);
        const utilPct = Math.round((outputMw / capMw) * 100);
        return { outputMw, utilPct, cf };
    }

    private computeNationalTotals(targetDate: Date) {
        let wOnCap = 0, wOnOut = 0, wOffCap = 0, wOffOut = 0, pvCap = 0, pvOut = 0;
        ASSET_SEEDS.forEach((s, idx) => {
            const w = this.weatherAtSeed(idx, targetDate);
            if (s.category === "wind_onshore") { wOnCap += s.installedCapacityMw; wOnOut += s.installedCapacityMw * computeWindCf(w.windSpeed120m, false); }
            else if (s.category === "wind_offshore") { wOffCap += s.installedCapacityMw; wOffOut += s.installedCapacityMw * computeWindCf(w.windSpeed120m, true); }
            else if (s.category === "solar") { pvCap += s.installedCapacityMw; pvOut += s.installedCapacityMw * computeSolarCf(w.solarIrradiance, w.temperature2m); }
        });
        // Modell-Hochrechnung auf installierte Gesamtleistung DE (~63.5 GW Wind Onshore, ~9.2 GW Offshore, ~96 GWp PV)
        const windOnshoreGw = Number(((wOnOut / Math.max(1, wOnCap)) * 63.5).toFixed(2));
        const windOffshoreGw = Number(((wOffOut / Math.max(1, wOffCap)) * 9.2).toFixed(2));
        const solarGw = Number(((pvOut / Math.max(1, pvCap)) * 96.0 * 0.76).toFixed(2));
        const biomassHydroGw = 6.5;
        const cetH = (targetDate.getUTCHours() + 1) % 24;
        const totalLoadGw = Number((cetH >= 7 && cetH <= 20 ? 60.5 + Math.sin(((cetH - 7) / 13) * Math.PI) * 8.5 : 48.5).toFixed(2));
        return { windOnshoreGw, windOffshoreGw, solarGw, biomassHydroGw, totalLoadGw };
    }

    private buildSnapshot(targetDate: Date): NationalTelemetrySnapshot {
        const nat = this.computeNationalTotals(targetDate);
        const seedWeathers = ASSET_SEEDS.map((_, idx) => this.weatherAtSeed(idx, targetDate));
        const highReGrid = nat.windOnshoreGw + nat.solarGw > 42;
        const highNorthWind = nat.windOnshoreGw + nat.windOffshoreGw > 26;

        // 1. Primäranlagen & 380kV-Umspannwerke
        const coreAssets: EnergyAsset[] = ASSET_SEEDS.map((s, idx) => {
            const weather = seedWeathers[idx];
            const calc = this.computePowerForGenerator(s.category, s.installedCapacityMw, weather, highReGrid);
            let outputMw = calc.outputMw;
            let curtailedMw = 0;
            let status: EnergyAsset["status"] = "NOMINAL";

            // Engpass-Indikation nur wenn auch real nennenswert Nordwind weht!
            const isBottleneckSubstation = (s.id === "sub-wilster" || s.id === "sub-emden" || s.id === "sub-lubmin") && highNorthWind;
            const isCurtailedWind = (s.category === "wind_onshore" || s.category === "wind_offshore") && s.lat > 53.1 && calc.cf >= 0.55;

            if (isBottleneckSubstation) {
                status = "REDISPATCH";
            } else if (isCurtailedWind) {
                curtailedMw = Math.round(outputMw * 0.16);
                outputMw = Math.max(0, outputMw - curtailedMw);
                status = "REDISPATCH";
            } else if (calc.cf >= 0.78) {
                status = "PEAK";
            }

            return {
                ...s,
                apiOrigin: "MASTR_CORE",
                currentOutputMw: outputMw,
                utilizationPct: s.installedCapacityMw > 0 ? Math.round((outputMw / s.installedCapacityMw) * 100) : 0,
                curtailedMw,
                status,
                weather,
            };
        });

        // 2. Wikidata / OSM Knoten bekommen jetzt ebenfalls das ECHTE DWD-Lokalwetter (nachts 0 W/m² -> 0 MW bei PV, 0 MW bei Umspannwerken!)
                const computedGraphAssets: EnergyAsset[] = this.rawGraphNodes.map((n) => {
            const weather = this.nearestRealDwdWeather(n.lat, n.lon, seedWeathers);
            const calc = this.computePowerForGenerator(n.category, n.capMw, weather, highReGrid);
            const extraMetrics: Record<string, string> =
                n.category === "substation"
                    ? {
                          "ANLAGENROLLE": "Umspannwerk / Netzknoten (0 MW Eigenerzeugung)",
                          "TELEMETRIE-HINWEIS": "Reine Standort-Stammdaten (keine öffentliche ÜNB-Live-Messung)",
                      }
                    : {
                          "BERECHNUNGSMETHODE": "Physik-Modell aus echtem DWD ICON-D2 Lokalwetter",
                          "STAMMDATEN-QUELLE": `Wikidata (${n.qid})`,
                      };

            return {
                id: n.id,
                mastrId: n.mastrId,
                callsign: n.callsign,
                name: n.name,
                category: n.category,
                apiOrigin: "OVERPASS_OSM",
                tso: guessTso(n.lat, n.lon),
                bundesland: "Wikidata / OSM Stammdaten DE",
                lat: n.lat,
                lon: n.lon,
                installedCapacityMw: n.capMw,
                currentOutputMw: calc.outputMw,
                utilizationPct: calc.utilPct,
                curtailedMw: 0,
                redispatchRadiusKm: 14,
                status: calc.cf >= 0.8 ? "PEAK" : "NOMINAL",
                weather,
                extraMetrics,
            };
        });


        // 3. WSV, Autobahn & ISR-Ziele ebenfalls mit echtem DWD-Lokalwetter versorgen
        const hydratedWsv = this.wsvTargets.map((t) => ({
            ...t,
            weather: this.nearestRealDwdWeather(t.lat, t.lon, seedWeathers),
        }));
        const hydratedHpc = this.autobahnTargets.map((t) => ({
            ...t,
            weather: this.nearestRealDwdWeather(t.lat, t.lon, seedWeathers),
        }));
        const hydratedIsr = this.isrScannedTargets.map((t) => {
            const w = this.nearestRealDwdWeather(t.lat, t.lon, seedWeathers);
            const calc = this.computePowerForGenerator(t.category, t.installedCapacityMw, w, highReGrid);
            return { ...t, weather: w, currentOutputMw: calc.outputMw, utilizationPct: calc.utilPct };
        });

        const byId = new Map(coreAssets.map((a) => [a.id, a]));
        const windLoadFactor = Math.min(100, Math.round(((nat.windOnshoreGw + nat.windOffshoreGw) / 48) * 95));
        const corridors: TransmissionCorridor[] = CORRIDOR_SEEDS.map((c) => {
            const from = byId.get(c.fromAssetId)!;
            const to = byId.get(c.toAssetId)!;
            const waypoints: Array<[number, number]> = [[from.lon, from.lat], ...(c.midWaypoints ?? []), [to.lon, to.lat]];
            const loadPct = Math.max(18, Math.min(98, windLoadFactor));
            return {
                id: c.id,
                name: c.name,
                voltageKv: c.voltageKv,
                type: c.type,
                fromAssetId: c.fromAssetId,
                toAssetId: c.toAssetId,
                waypoints,
                capacityMw: c.capacityMw,
                currentFlowMw: Math.round((c.capacityMw * loadPct) / 100),
                loadPct,
                congested: loadPct >= 78,
            };
        });

        const allAssets: EnergyAsset[] = [
            ...coreAssets,
            ...computedGraphAssets,
            ...hydratedHpc,
            ...hydratedWsv,
            ...this.dwdSynopTargets,
            ...hydratedIsr,
        ];

        const renewableTotalGw = Number((nat.windOnshoreGw + nat.windOffshoreGw + nat.solarGw + nat.biomassHydroGw).toFixed(2));
        const residualLoadGw = Number((nat.totalLoadGw - renewableTotalGw).toFixed(2));
        const eeSharePct = Number(Math.min(115, (renewableTotalGw / Math.max(1, nat.totalLoadGw)) * 100).toFixed(1));

        const apiFeeds: ApiFeedStatus[] = [
            { name: "Open-Meteo DWD ICON-D2 (Live)", endpoint: "api.open-meteo.com/v1/dwd-icon", online: this.dwdHourly !== null, targetCount: coreAssets.length, detail: "Echte 120m-Wind-, Strahlungs- & Temperaturwerte" },
            { name: "Wikidata & OSM Stammdaten DE", endpoint: "query.wikidata.org + overpass", online: computedGraphAssets.length > 0, targetCount: computedGraphAssets.length + hydratedIsr.length, detail: `Geostandorte Wind/PV/Umspannwerke (+${hydratedIsr.length} ISR)` },
            { name: "WSV Pegelonline Bundes-API (Live)", endpoint: "pegelonline.wsv.de/rest-api/v2", online: hydratedWsv.length > 0, targetCount: hydratedWsv.length, detail: "Echte Live-Wasserstände (cm) Bundeswasserstraßen" },
            { name: "DWD Bright Sky SYNOP (Live)", endpoint: "api.brightsky.dev/current_weather", online: this.dwdSynopTargets.length > 0, targetCount: this.dwdSynopTargets.length, detail: "Echte DWD-Stationsmesswerte (Böen, hPa, Wolken)" },
            { name: "Autobahn GmbH API (Stammdaten)", endpoint: "verkehr.autobahn.de/o/autobahn", online: hydratedHpc.length > 0, targetCount: hydratedHpc.length, detail: "Offizielle HPC-Schnellladestandorte A1–A9" },
            { name: "Corrently GrünstromIndex (Live)", endpoint: "api.corrently.io/v2.0/gsi", online: this.gsiOverride !== null, targetCount: 1, detail: `Live GSI: ${this.gsiOverride?.gsi ?? "--"} // CO₂: ${this.gsiOverride?.co2 ?? "--"} g/kWh` },
            { name: "MaStR Referenz + Esri World Imagery", endpoint: "arcgisonline.com (Zoom 19)", online: true, targetCount: coreAssets.length, detail: "Großanlagen-Topologie & Live-Satellitenkacheln" },
        ];

        const timeline: TimelinePoint[] = [];
        for (let h = -12; h <= 12; h += 2) {
            const d = new Date(Date.now() + h * 3_600_000);
            const t = this.computeNationalTotals(d);
            const wind = Number((t.windOnshoreGw + t.windOffshoreGw).toFixed(1));
            const re = wind + t.solarGw + t.biomassHydroGw;
            timeline.push({
                offsetHours: h,
                label: h === 0 ? "JETZT" : `${d.getHours().toString().padStart(2, "0")}:00`,
                windGw: wind,
                solarGw: Number(t.solarGw.toFixed(1)),
                bioHydroGw: Number(t.biomassHydroGw.toFixed(1)),
                totalLoadGw: Number(t.totalLoadGw.toFixed(1)),
                eeSharePct: Math.round((re / Math.max(1, t.totalLoadGw)) * 100),
            });
        }

        return {
            timestampIso: targetDate.toISOString(),
            dataSourceMode: this.dwdHourly ? "LIVE_MULTI_API" : "HYBRID_DWD_SIM",
            gridFrequencyHz: 50.0,
            totalLoadGw: nat.totalLoadGw,
            renewableTotalGw,
            residualLoadGw,
            eeSharePct,
            gsiScore: this.gsiOverride?.gsi ?? Math.round(eeSharePct),
            co2IntensityGPerKwh: this.gsiOverride?.co2 ?? Math.round(Math.max(45, 510 - Math.min(100, eeSharePct) * 4.3)),
            spotPriceEurMwh: Number((112 - eeSharePct * 1.02).toFixed(1)),
            bySourceGw: { windOnshore: nat.windOnshoreGw, windOffshore: nat.windOffshoreGw, solar: nat.solarGw, biomassHydro: nat.biomassHydroGw, storageDischarge: 1.85 },
            apiFeeds,
            assets: allAssets,
            corridors,
            sectors: TACTICAL_SECTORS,
            timeline,
        };
    }
}

export const twinCache = new TwinSnapshotCache();
