import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import * as d3 from "d3";

export type GeographischeAnalyseProps = {
    initialScenarioId?: string;
    defaultMwPerUnit?: number;
};

type PlantType = "windOffshore" | "windOnshore" | "pv" | "battery" | "electrolyzer";
type StateFeature = d3.ExtendedFeature<d3.GeoGeometryObjects, { name?: string; NAME_1?: string }>;

type MapPlant = {
    id: string;
    type: PlantType;
    lon: number;
    lat: number;
    mw: number;
    region: string;
    isManual: boolean;
};

type GeoScenario = {
    id: string;
    year: number;
    name: string;
    demandTwh: number;
    northSeaGw: number;
    balticSeaGw: number;
    onshoreGw: number;
    pvGw: number;
    batteryGw: number;
    h2Gw: number;
    bioHydroTwh: number;
    info: string;
};

type CtxMenu = { x: number; y: number; lon: number; lat: number; region: string; hitId: string | null };

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const fmt1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const GEO_URLS = [
    "/bundeslaender.geo.json",
    "https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/main/2_bundeslaender/3_mittel.geo.json",
    "https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/main/2_bundeslaender/4_niedrig.geo.json",
];

const META: Record<PlantType, { label: string; color: string; flh: number }> = {
    windOffshore: { label: "Wind Offshore", color: "#38bdf8", flh: 3700 },
    windOnshore: { label: "Wind Onshore", color: "#34d399", flh: 2050 },
    pv: { label: "Photovoltaik", color: "#facc15", flh: 960 },
    battery: { label: "Großspeicher", color: "#c084fc", flh: 0 },
    electrolyzer: { label: "H₂-Elektrolyseur", color: "#fb923c", flh: 0 },
};

const SCENARIOS: readonly GeoScenario[] = [
    { id: "ist-2023", year: 2023, name: "2023 Ist-Basis (8,5 GW See)", demandTwh: 525, northSeaGw: 7.2, balticSeaGw: 1.3, onshoreGw: 61, pvGw: 82, batteryGw: 7, h2Gw: 0.5, bioHydroTwh: 44, info: "Startjahr Agora 2024: 7,2 GW Nordsee + 1,3 GW Ostsee (~53 % EE bei 525 TWh)." },
    { id: "agora-2030", year: 2030, name: "2030 Agora-Pfad (26 GW See)", demandTwh: 727, northSeaGw: 21.5, balticSeaGw: 4.5, onshoreGw: 98, pvGw: 215, batteryGw: 30, h2Gw: 6, bioHydroTwh: 44, info: "Agora-Referenz 2030: 21,5 GW Nordsee & 4,5 GW Ostsee (~75 % EE). Rechtsklick auf Bundesland/Meer zum Zubauen auf ≥80 %!" },
    { id: "eeg-2030", year: 2030, name: "2030 EEG-Ziel (30 GW See · ≥80 %)", demandTwh: 727, northSeaGw: 24.8, balticSeaGw: 5.2, onshoreGw: 115, pvGw: 220, batteryGw: 35, h2Gw: 8, bioHydroTwh: 44, info: "EEG / WindSeeG: 30 GW Offshore (24,8 GW Nordsee, 5,2 GW Ostsee) + 115 GW Wind Land erreichen ≥80 % EE." },
    { id: "agora-2035", year: 2035, name: "2035 Stützjahr (45 GW See)", demandTwh: 860, northSeaGw: 38.0, balticSeaGw: 7.0, onshoreGw: 135, pvGw: 310, batteryGw: 60, h2Gw: 20, bioHydroTwh: 43, info: "Starker Ausbau in Deutscher Bucht & Ostsee-AWZ auf zusammen 45 GW Offshore." },
    { id: "agora-2040", year: 2040, name: "2040 Agora-Pfad (67 GW See)", demandTwh: 1000, northSeaGw: 57.5, balticSeaGw: 9.5, onshoreGw: 160, pvGw: 400, batteryGw: 85, h2Gw: 35, bioHydroTwh: 42, info: "Agora Tab. A1: 67 GW Offshore versorgen über HGÜ-Trassen Industrie und Elektrolyseure (~95 % EE)." },
    { id: "agora-2045", year: 2045, name: "2045 Klimaneutral (73 GW See)", demandTwh: 1267, northSeaGw: 62.5, balticSeaGw: 10.5, onshoreGw: 180, pvGw: 469, batteryGw: 102, h2Gw: 55, bioHydroTwh: 40, info: "Zielbild 2045: 62,5 GW Nordsee + 10,5 GW Ostsee, 180 GW Wind Land & 469 GW PV bei 1.267 TWh." },
];

const NORTH_SEA_AWZ: [number, number][] = [
    [6.3, 53.75], [5.35, 54.25], [4.15, 55.3], [4.5, 55.8], [6.6, 55.45],
    [8.2, 55.02], [8.35, 54.35], [8.1, 53.85], [7.1, 53.75], [6.3, 53.75],
];

const BALTIC_SEA_AWZ: [number, number][] = [
    [10.25, 54.55], [11.2, 54.52], [12.2, 54.68], [13.2, 54.92],
    [14.2, 54.72], [14.1, 54.15], [13.45, 54.62], [12.2, 54.3], [10.25, 54.55],
];

const FALLBACK_DE: [number, number][] = [
    [8.4, 55.05], [8.85, 54.35], [8.55, 53.55], [7.15, 53.65], [6.7, 52.6], [6.1, 51.85],
    [5.9, 51.05], [6.38, 49.48], [8.22, 48.98], [7.58, 47.6], [10.2, 47.32], [12.95, 47.62],
    [13.82, 48.78], [12.42, 49.98], [14.82, 50.88], [14.55, 52.55], [14.22, 53.92],
    [13.4, 54.65], [12.1, 54.18], [10.9, 54.0], [10.2, 54.45], [9.95, 54.82], [8.4, 55.05],
];

function rng32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getStateName(f: StateFeature): string {
    return f.properties?.name ?? f.properties?.NAME_1 ?? "Deutschland";
}

function detectRegion(lon: number, lat: number, states: StateFeature[]): string {
    for (const st of states) {
        if (d3.geoContains(st, [lon, lat])) return getStateName(st);
    }
    if (d3.polygonContains(NORTH_SEA_AWZ, [lon, lat]) || (lat > 53.6 && lon < 9.1)) return "Nordsee";
    if (d3.polygonContains(BALTIC_SEA_AWZ, [lon, lat]) || (lat > 53.9 && lon >= 9.8)) return "Ostsee";
    return "Festland";
}

function buildScenarioPlants(sc: GeoScenario, mwStep: number, states: StateFeature[]): MapPlant[] {
    const rand = rng32(sc.year * 997 + mwStep);
    const res: MapPlant[] = [];

    const spawnSea = (gw: number, poly: [number, number][], zone: string) => {
        const mwTotal = gw * 1000;
        const offStep = Math.min(mwStep, 1000); // Offshore feiner aufgelöst für klare Nord-/Ostsee-Darstellung
        const n = mwTotal > 0 ? Math.max(1, Math.round(mwTotal / offStep)) : 0;
        if (!n) return;
        const unitMw = mwTotal / n;
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        let placed = 0, guard = 0;
        while (placed < n && guard < n * 100) {
            guard += 1;
            const pt: [number, number] = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
            if (d3.polygonContains(poly, pt)) {
                res.push({ id: `${sc.id}-off-${zone}-${placed}`, type: "windOffshore", lon: pt[0], lat: pt[1], mw: unitMw, region: zone, isManual: false });
                placed += 1;
            }
        }
    };

    const spawnLand = (gw: number, type: PlantType, bias: number) => {
        const mwTotal = gw * 1000;
        const n = mwTotal > 0 ? Math.max(1, Math.round(mwTotal / mwStep)) : 0;
        if (!n) return;
        const unitMw = mwTotal / n;
        let placed = 0, guard = 0;
        while (placed < n && guard < n * 120) {
            guard += 1;
            const u = rand();
            const v = bias > 0 ? 1 - Math.pow(rand(), 0.68) : bias < 0 ? Math.pow(rand(), 0.7) : rand();
            const lon = 5.9 + u * (15.0 - 5.9);
            const lat = 47.3 + v * (55.0 - 47.3);
            const matchedState = states.length > 0
                ? states.find((st) => d3.geoContains(st, [lon, lat]))
                : d3.polygonContains(FALLBACK_DE, [lon, lat]) ? ({ properties: { name: "Deutschland" } } as StateFeature) : undefined;
            if (matchedState) {
                res.push({ id: `${sc.id}-${type}-${placed}`, type, lon, lat, mw: unitMw, region: getStateName(matchedState), isManual: false });
                placed += 1;
            }
        }
    };

    spawnSea(sc.northSeaGw, NORTH_SEA_AWZ, "Nordsee");
    spawnSea(sc.balticSeaGw, BALTIC_SEA_AWZ, "Ostsee");
    spawnLand(sc.onshoreGw, "windOnshore", 1);
    spawnLand(sc.pvGw, "pv", -1);
    spawnLand(sc.batteryGw, "battery", 0);
    spawnLand(sc.h2Gw, "electrolyzer", 1);
    return res;
}

export default function GeographischeAnalyse({
    initialScenarioId = "agora-2030",
    defaultMwPerUnit = 2500,
}: GeographischeAnalyseProps) {
    const [statesGeo, setStatesGeo] = useState<StateFeature[]>([]);
    const [scenarioId, setScenarioId] = useState(initialScenarioId);
    const [mwPerUnit, setMwPerUnit] = useState(defaultMwPerUnit);
    const [manualPlants, setManualPlants] = useState<MapPlant[]>([]);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
    const [layers, setLayers] = useState<Set<PlantType>>(() => new Set(["windOffshore", "windOnshore", "pv", "battery", "electrolyzer"]));
    const [addMw, setAddMw] = useState(1000);
    const [menu, setMenu] = useState<CtxMenu | null>(null);
    const [hoverText, setHoverText] = useState<string | null>(null);

    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const projRef = useRef<d3.GeoProjection | null>(null);
    const zoomTransRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const screenPtsRef = useRef<{ p: MapPlant; x: number; y: number }[]>([]);

    // Politische Bundesländer-GeoJSON laden
    useEffect(() => {
        let active = true;
        (async () => {
            for (const url of GEO_URLS) {
                try {
                    const r = await fetch(url);
                    if (!r.ok) continue;
                    const json = (await r.json()) as { features?: StateFeature[] };
                    if (active && Array.isArray(json.features) && json.features.length > 0) {
                        setStatesGeo(json.features);
                        return;
                    }
                } catch {
                    // Nächste Quelle versuchen
                }
            }
        })();
        return () => { active = false; };
    }, []);

    const scenario = useMemo(() => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[1], [scenarioId]);
    const presetPlants = useMemo(() => buildScenarioPlants(scenario, mwPerUnit, statesGeo), [scenario, mwPerUnit, statesGeo]);
    const plants = useMemo(() => [...presetPlants.filter((p) => !deletedIds.has(p.id)), ...manualPlants], [presetPlants, deletedIds, manualPlants]);

    const liveRef = useRef({ plants, layers, statesGeo });
    liveRef.current = { plants, layers, statesGeo };

    const stats = useMemo(() => {
        let nsMw = 0, bsMw = 0, onMw = 0, pvMw = 0, batMw = 0, h2Mw = 0, nsCnt = 0, bsCnt = 0;
        for (const p of plants) {
            if (p.type === "windOffshore") {
                if (p.region === "Ostsee") { bsMw += p.mw; bsCnt += 1; }
                else { nsMw += p.mw; nsCnt += 1; }
            } else if (p.type === "windOnshore") onMw += p.mw;
            else if (p.type === "pv") pvMw += p.mw;
            else if (p.type === "battery") batMw += p.mw;
            else if (p.type === "electrolyzer") h2Mw += p.mw;
        }
        const genTwh = ((nsMw + bsMw) * 3700 + onMw * 2050 + pvMw * 960) / 1_000_000 + scenario.bioHydroTwh;
        const rawRatio = genTwh / scenario.demandTwh;
        const flexMit = Math.min(1, (batMw + h2Mw) / 1000 / Math.max(25, rawRatio * 100));
        const curt = rawRatio > 0.65 ? (rawRatio - 0.65) * 0.24 * (1 - 0.72 * flexMit) : 0;
        const eePct = Math.min(100, ((genTwh * (1 - curt)) / scenario.demandTwh) * 100);
        return { nsGw: nsMw / 1000, bsGw: bsMw / 1000, onGw: onMw / 1000, pvGw: pvMw / 1000, batGw: batMw / 1000, h2Gw: h2Mw / 1000, nsCnt, bsCnt, eePct, genTwh };
    }, [plants, scenario]);

    useEffect(() => {
        const canvas = canvasRef.current, wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let raf = 0, w = 700, h = 580, dpr = 1;

        const syncSize = () => {
            const rect = wrap.getBoundingClientRect();
            w = Math.max(300, rect.width);
            h = Math.max(420, rect.height);
            dpr = Math.min(2, window.devicePixelRatio || 1);
            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
            }
            // MultiPoint verhindert den D3-Sphären-Winding-Bug und skaliert Deutschland + Nord-/Ostsee groß & mittig!
            projRef.current = d3.geoMercator().fitExtent(
                [[24, 20], [w - 24, h - 20]],
                { type: "MultiPoint", coordinates: [[4.3, 47.25], [15.05, 55.65]] }
            );
        };

        const ro = new ResizeObserver(syncSize);
        ro.observe(wrap);
        syncSize();

        const zoom = d3.zoom<HTMLCanvasElement, unknown>().scaleExtent([0.9, 10]).on("zoom", (ev) => {
            zoomTransRef.current = ev.transform;
            setMenu(null);
        });
        d3.select(canvas).call(zoom);

        const render = (ms: number) => {
            const proj = projRef.current;
            const zt = zoomTransRef.current;
            const { plants: curPlants, layers: curLayers, statesGeo: curStates } = liveRef.current;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = "#081c33";
            ctx.fillRect(0, 0, w, h);

            if (proj) {
                const geoPath = d3.geoPath(proj, ctx);
                ctx.save();
                ctx.translate(zt.x, zt.y);
                ctx.scale(zt.k, zt.k);

                // 1) Nordsee- & Ostsee-AWZ-Zonen
                for (const [poly, lbl, lPt] of [
                    [NORTH_SEA_AWZ, "NORDSEE (AWZ)", [6.1, 54.68]] as const,
                    [BALTIC_SEA_AWZ, "OSTSEE (AWZ)", [12.35, 54.65]] as const,
                ]) {
                    ctx.beginPath();
                    poly.forEach((pt, i) => {
                        const p = proj(pt);
                        if (p) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
                    });
                    ctx.closePath();
                    ctx.fillStyle = "rgba(56, 189, 248, 0.11)";
                    ctx.fill();
                    ctx.setLineDash([4 / zt.k, 3 / zt.k]);
                    ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
                    ctx.lineWidth = 1.1 / zt.k;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    const lp = proj([lPt[0], lPt[1]]);
                    if (lp) {
                        ctx.fillStyle = "#7dd3fc";
                        ctx.font = `700 ${11 / zt.k}px ${FONT}`;
                        ctx.textAlign = "center";
                        ctx.fillText(lbl, lp[0], lp[1]);
                    }
                }

                // 2) Politische Karte Deutschlands (alle 16 Bundesländer mit Landesgrenzen & Namen)
                if (curStates.length > 0) {
                    for (const feat of curStates) {
                        ctx.beginPath();
                        geoPath(feat);
                        ctx.fillStyle = "#1e293b";
                        ctx.fill();
                        ctx.strokeStyle = "#94a3b8";
                        ctx.lineWidth = 1.05 / zt.k;
                        ctx.stroke();
                    }
                    ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
                    ctx.font = `600 ${10 / zt.k}px ${FONT}`;
                    ctx.textAlign = "center";
                    for (const feat of curStates) {
                        const c = geoPath.centroid(feat);
                        if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
                            ctx.fillText(getStateName(feat), c[0], c[1]);
                        }
                    }
                } else {
                    ctx.beginPath();
                    FALLBACK_DE.forEach((pt, i) => {
                        const p = proj(pt);
                        if (p) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
                    });
                    ctx.closePath();
                    ctx.fillStyle = "#1e293b";
                    ctx.fill();
                    ctx.strokeStyle = "#94a3b8";
                    ctx.lineWidth = 1.2 / zt.k;
                    ctx.stroke();
                }

                // 3) Kompakte, klare Anlagen-Symbole (überdecken niemals die Bundeslandgrenzen)
                const nextScreen: { p: MapPlant; x: number; y: number }[] = [];
                const invK = 1 / Math.pow(zt.k, 0.78);
                const phase = ms * 0.0032;

                for (const p of curPlants) {
                    if (!curLayers.has(p.type)) continue;
                    const c = proj([p.lon, p.lat]);
                    if (!c) continue;
                    nextScreen.push({ p, x: zt.applyX(c[0]), y: zt.applyY(c[1]) });

                    const color = META[p.type].color;
                    if (p.type === "windOffshore" || p.type === "windOnshore") {
                        const r = (p.type === "windOffshore" ? 6.5 : 5.2) * invK;
                        ctx.strokeStyle = p.isManual ? "#ffffff" : "rgba(226,232,240,0.9)";
                        ctx.lineWidth = 1.3 * invK;
                        ctx.beginPath();
                        ctx.moveTo(c[0], c[1]);
                        ctx.lineTo(c[0], c[1] + r * 1.45);
                        ctx.stroke();

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1.45 * invK;
                        for (let b = 0; b < 3; b += 1) {
                            const a = phase + (b * Math.PI * 2) / 3 + p.lon * 3;
                            ctx.beginPath();
                            ctx.moveTo(c[0], c[1]);
                            ctx.lineTo(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r);
                            ctx.stroke();
                        }
                    } else if (p.type === "pv") {
                        const s = 3.2 * invK;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(c[0], c[1] - s);
                        ctx.lineTo(c[0] + s, c[1]);
                        ctx.lineTo(c[0], c[1] + s);
                        ctx.lineTo(c[0] - s, c[1]);
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], 3.0 * invK, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                screenPtsRef.current = nextScreen;
                ctx.restore();
            }
            raf = requestAnimationFrame(render);
        };

        raf = requestAnimationFrame(render);
        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);

    const onContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current, proj = projRef.current;
        if (!canvas || !proj || !proj.invert) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const hit = screenPtsRef.current.find((it) => Math.hypot(it.x - sx, it.y - sy) <= 11);
        const [ux, uy] = zoomTransRef.current.invert([sx, sy]);
        const geo = proj.invert([ux, uy]);
        if (!geo) return;

        setMenu({
            x: Math.min(sx, rect.width - 225),
            y: Math.min(sy, rect.height - 235),
            lon: geo[0],
            lat: geo[1],
            region: detectRegion(geo[0], geo[1], statesGeo),
            hitId: hit?.p.id ?? null,
        });
    };

    const onMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        const proj = projRef.current;
        if (!proj || !proj.invert) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const hit = screenPtsRef.current.find((it) => Math.hypot(it.x - sx, it.y - sy) <= 9);
        if (hit) {
            const p = hit.p;
            const extra = p.type === "windOffshore" ? ` (≈ ${Math.round(p.mw / 15)} WEA à 15 MW)` : p.type === "windOnshore" ? ` (≈ ${Math.round(p.mw / 5.5)} WEA à 5,5 MW)` : "";
            setHoverText(`${META[p.type].label} · ${p.region} · ${fmt1.format(p.mw)} MW${extra}${p.isManual ? " [Manuell]" : ""}`);
        } else {
            const [ux, uy] = zoomTransRef.current.invert([sx, sy]);
            const geo = proj.invert([ux, uy]);
            setHoverText(geo ? `Region: ${detectRegion(geo[0], geo[1], statesGeo)} (Rechtsklick zum Zubauen)` : null);
        }
    };

    const addManualPlant = (type: PlantType) => {
        if (!menu) return;
        setManualPlants((prev) => [
            ...prev,
            { id: `m-${Date.now()}-${Math.random()}`, type, lon: menu.lon, lat: menu.lat, mw: addMw, region: menu.region, isManual: true },
        ]);
        setMenu(null);
    };

    const removePlant = (id: string) => {
        if (id.startsWith("m-")) setManualPlants((prev) => prev.filter((p) => p.id !== id));
        else setDeletedIds((prev) => new Set(prev).add(id));
        setMenu(null);
    };

    return (
        <div className="content-body" style={{ fontFamily: FONT, color: "#f8fafc" }}>
            <div style={{ background: "#0f172a", borderRadius: 16, border: "1px solid #334155", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 19, color: "#f8fafc" }}>
                            Geographische Veranschauchlichung
                        </h2>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ fontSize: 12, color: "#cbd5e1" }}>
                            MW je Land-Symbol:{" "}
                            <select value={mwPerUnit} onChange={(e) => setMwPerUnit(Number(e.target.value))} style={SEL}>
                                <option value={1000}>1.000 MW (dicht)</option>
                                <option value={2500}>2.500 MW (ideal)</option>
                                <option value={5000}>5.000 MW (übersichtlich)</option>
                            </select>
                        </label>
                        {(manualPlants.length > 0 || deletedIds.size > 0) && (
                            <button type="button" onClick={() => { setManualPlants([]); setDeletedIds(new Set()); }} style={BTN}>
                                Änderungen zurücksetzen ({manualPlants.length})
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {SCENARIOS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => { setScenarioId(s.id); setDeletedIds(new Set()); setMenu(null); }}
                            style={{ ...BTN, background: scenarioId === s.id ? "#2563eb" : "#1e293b", borderColor: scenarioId === s.id ? "#60a5fa" : "#334155", fontWeight: scenarioId === s.id ? 700 : 500 }}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1.65fr) minmax(290px, 1fr)", gap: 16 }}>
                    <div
                        ref={wrapRef}
                        onClick={() => setMenu(null)}
                        style={{ position: "relative", minHeight: 560, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}
                    >
                        <canvas
                            ref={canvasRef}
                            onContextMenu={onContextMenu}
                            onMouseMove={onMouseMove}
                            style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
                        />

                        {hoverText && !menu && (
                            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(15,23,42,0.92)", padding: "6px 10px", borderRadius: 8, border: "1px solid #334155", fontSize: 12, pointerEvents: "none" }}>
                                {hoverText}
                            </div>
                        )}

                        {menu && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ position: "absolute", left: menu.x, top: menu.y, width: 220, background: "#0f172a", border: "1px solid #475569", borderRadius: 10, padding: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.65)", display: "flex", flexDirection: "column", gap: 6, zIndex: 20 }}
                            >
                                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
                                    Ort: <strong style={{ color: "#f8fafc" }}>{menu.region}</strong>
                                </div>
                                <label style={{ fontSize: 11.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    Leistung:
                                    <select value={addMw} onChange={(e) => setAddMw(Number(e.target.value))} style={SEL}>
                                        <option value={250}>250 MW</option>
                                        <option value={500}>500 MW</option>
                                        <option value={1000}>1.000 MW</option>
                                        <option value={2500}>2.500 MW</option>
                                    </select>
                                </label>
                                {(Object.keys(META) as PlantType[]).map((t) => (
                                    <button key={t} type="button" onClick={() => addManualPlant(t)} style={{ ...BTN, textAlign: "left", borderLeft: `4px solid ${META[t].color}` }}>
                                        + {META[t].label} ({addMw} MW)
                                    </button>
                                ))}
                                {menu.hitId && (
                                    <button type="button" onClick={() => removePlant(menu.hitId!)} style={{ ...BTN, background: "#dc2626", borderColor: "#ef4444" }}>
                                        🗑 Anlage entfernen
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ ...CARD, borderColor: stats.eePct >= 79.95 ? "#10b981" : "#f97316" }}>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>Nutzbarer EE-Anteil ({scenario.demandTwh} TWh Bedarf)</div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: stats.eePct >= 79.95 ? "#34d399" : "#fb923c" }}>
                                {fmt1.format(stats.eePct)} %
                            </div>
                            <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                                Brutto-EE-Erzeugung: {fmt1.format(stats.genTwh)} TWh/a {stats.eePct >= 79.95 ? "· ✓ Ziel erreicht" : "· ✕ unter 80 %"}
                            </div>
                        </div>

                        <div style={CARD}>
                            <strong style={{ fontSize: 13, color: "#7dd3fc" }}>🌊 Offshore-Wind: Nordsee vs. Ostsee</strong>
                            <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.65 }}>
                                <div>• <strong>Nordsee:</strong> {fmt1.format(stats.nsGw)} GW ({stats.nsCnt} Cluster ≈ {Math.round((stats.nsGw * 1000) / 15)} WEA à 15 MW)</div>
                                <div>• <strong>Ostsee:</strong> {fmt1.format(stats.bsGw)} GW ({stats.bsCnt} Cluster ≈ {Math.round((stats.bsGw * 1000) / 15)} WEA à 15 MW)</div>
                            </div>
                        </div>

                        <div style={CARD}>
                            <strong style={{ fontSize: 13, color: "#cbd5e1" }}>🇩🇪 Bundesländer Gesamt (Festland)</strong>
                            <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.65 }}>
                                <div>• Wind Onshore: <strong>{fmt1.format(stats.onGw)} GW</strong> (≈ {Math.round((stats.onGw * 1000) / 5.5).toLocaleString("de-DE")} WEA)</div>
                                <div>• Photovoltaik: <strong>{fmt1.format(stats.pvGw)} GW</strong></div>
                                <div>• Großspeicher: <strong>{fmt1.format(stats.batGw)} GW</strong> · Elektrolyse: <strong>{fmt1.format(stats.h2Gw)} GW</strong></div>
                            </div>
                        </div>

                                                <div style={CARD}>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                                Ebenen auf der Karte ein-/ausblenden:
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {(Object.keys(META) as PlantType[]).map((t) => {
                                    const on = layers.has(t);
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() =>
                                                setLayers((prev) => {
                                                    const n = new Set(prev);
                                                    if (n.has(t)) n.delete(t);
                                                    else n.add(t);
                                                    return n;
                                                })
                                            }
                                            style={{
                                                ...BTN,
                                                opacity: on ? 1 : 0.45,
                                                borderColor: on ? META[t].color : "#334155",
                                            }}
                                        >
                                            <span style={{ color: META[t].color }}>●</span> {META[t].label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div
                            style={{
                                ...CARD,
                                borderLeft: "4px solid #eab308",
                                fontSize: 12,
                                color: "#e2e8f0",
                                lineHeight: 1.45,
                            }}
                        >
                            {scenario.info}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const BTN: CSSProperties = {
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 7,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f8fafc",
    cursor: "pointer",
};

const SEL: CSSProperties = {
    padding: "4px 7px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 6,
    border: "1px solid #475569",
    background: "#1e293b",
    color: "#f8fafc",
};

const CARD: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    background: "#1e293b",
    border: "1px solid #334155",
};
