import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
} from "react";
import * as d3 from "d3";

type DecisionEngineProps = {
    generationCsvUrl?: string;
    consumptionCsvUrl?: string;
};

type ScenarioParams = {
    id: string;
    year: number;
    name: string;
    category: "2030-Ziel" | "Langfristpfad";
    demandTwh: number;
    sectorCouplingSharePct: number; // Anteil WP + E-Auto + flexible Industrie am Verbrauch
    pvGw: number;
    windOnGw: number;
    windOffGw: number;
    biomassGw: number;
    hydroGw: number;
    batteryPowerGw: number;
    batteryCapGwh: number;
    dsmSharePct: number; // Verschiebbarer Anteil der Sektorkopplungslast innerhalb 24h
    electrolyzerGw: number;
    justification: string;
};

type GenSlot = {
    startMs: number;
    endMs: number;
    slotKey: string; // "MM-DD HH:mm"
    year: number;
    pv: number;
    windOn: number;
    windOff: number;
    hydro: number;
    bio: number;
    otherEe: number;
};

type LoadSlot = {
    startMs: number;
    slotKey: string;
    year: number;
    netzlast: number;
};

type AlignedSeries = {
    count: number;
    genYear: number;
    loadYear: number;
    matchedMode: "exact-timestamp" | "calendar-slot" | "gen-proxy";
    starts: Float64Array;
    ends: Float64Array;
    pv: Float64Array;
    windOn: Float64Array;
    windOff: Float64Array;
    hydro: Float64Array;
    bio: Float64Array;
    otherEe: Float64Array;
    baseLoad: Float64Array;
};

type SimulationResult = {
    count: number;
    scaleToFullYear: number;
    demandArr: Float64Array;
    eeRawArr: Float64Array;
    resBeforeFlex: Float64Array;
    resAfterFlex: Float64Array;
    batterySocPct: Float64Array;
    totalDemandTwh: number;
    grossEeTwh: number;
    curtailedTwh: number;
    curtailedPct: number;
    batteryDischargedTwh: number;
    h2ProducedTwh: number;
    h2ReconvertedTwh: number;
    fossilBackupTwh: number;
    usableEeSharePct: number;
    peakBackupGw: number;
    peakSurplusGw: number;
    co2MioTons: number;
    dunkelflauteStartIdx: number;
    surplusWeekStartIdx: number;
};

type ViewTab = "rldc" | "timeseries" | "comparison" | "architecture";

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const parseDate = d3.utcParse("%d.%m.%Y %H:%M");
const formatDate = d3.utcFormat("%d.%m.%Y %H:%M");
const formatSlotKey = d3.utcFormat("%m-%d %H:%M");
const formatShortDate = d3.utcFormat("%d.%m. %H:%M");

const fmt1 = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
const fmt0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

// Historische installierte Leistungen in Deutschland [GW] zur Normierung des SMARD-Basisjahres.
const HISTORICAL_GW: Record<
    number,
    { pv: number; windOn: number; windOff: number; bio: number; hydro: number }
> = {
    2019: { pv: 49.0, windOn: 53.9, windOff: 7.5, bio: 8.6, hydro: 5.6 },
    2020: { pv: 53.7, windOn: 54.4, windOff: 7.7, bio: 8.7, hydro: 5.6 },
    2021: { pv: 59.3, windOn: 56.1, windOff: 7.8, bio: 8.8, hydro: 5.6 },
    2022: { pv: 67.5, windOn: 58.1, windOff: 8.1, bio: 8.9, hydro: 5.6 },
    2023: { pv: 82.2, windOn: 61.0, windOff: 8.5, bio: 9.0, hydro: 5.6 },
    2024: { pv: 99.0, windOn: 63.5, windOff: 9.2, bio: 9.0, hydro: 5.6 },
    2025: { pv: 114.0, windOn: 67.0, windOff: 10.5, bio: 9.0, hydro: 5.6 },
};

// Wissenschaftlich begründete Szenarien aus Agora 2024 (Klimaneutrales Deutschland, S. 26–31 & Tab. A1 S. 80) + EEG 2023.
const PRESET_SCENARIOS: readonly ScenarioParams[] = [
    {
        id: "agora-2030-ref",
        year: 2030,
        name: "2030 Agora-Referenz (KND-Pfad)",
        category: "2030-Ziel",
        demandTwh: 727,
        sectorCouplingSharePct: 24,
        pvGw: 215,
        windOnGw: 98,
        windOffGw: 26,
        biomassGw: 8.4,
        hydroGw: 5.6,
        batteryPowerGw: 60,
        batteryCapGwh: 120,
        dsmSharePct: 25,
        electrolyzerGw: 6,
        justification:
            "Agora 2024 (S. 26 & Tab. A1, S. 80): 727 TWh Bruttostromverbrauch (6 Mio. WP, 12,6 Mio. BEV). PV erreicht das EEG-Ziel (215 GW), aber Wind Onshore (98 statt 115 GW) und Offshore (26 statt 30 GW) hinken hinterher – dadurch werden ~76 % EE erreicht und das 80-%-Ziel knapp verfehlt.",
    },
    {
        id: "eeg-2030-ausbau",
        year: 2030,
        name: "2030 EEG-Ausbauoffensive (≥80 % via EE)",
        category: "2030-Ziel",
        demandTwh: 727,
        sectorCouplingSharePct: 24,
        pvGw: 225,
        windOnGw: 115,
        windOffGw: 30,
        biomassGw: 8.4,
        hydroGw: 5.6,
        batteryPowerGw: 65,
        batteryCapGwh: 135,
        dsmSharePct: 30,
        electrolyzerGw: 8,
        justification:
            "Schließt die in Agora 2024 identifizierte Wind-Ausbaulücke auf die gesetzlichen Ziele des § 4 EEG 2023 (115 GW Wind Onshore, 30 GW Wind Offshore, 225 GW PV) bei unverändertem Sektorkopplungs-Verbrauch (727 TWh).",
    },
    {
        id: "effizienz-2030",
        year: 2030,
        name: "2030 Effizienz & Suffizienz (≥80 % via Verbrauch)",
        category: "2030-Ziel",
        demandTwh: 655,
        sectorCouplingSharePct: 21,
        pvGw: 215,
        windOnGw: 98,
        windOffGw: 26,
        biomassGw: 8.4,
        hydroGw: 5.6,
        batteryPowerGw: 60,
        batteryCapGwh: 120,
        dsmSharePct: 30,
        electrolyzerGw: 6,
        justification:
            "Beibehaltung des realistischen Agora-EE-Ausbaus (215/98/26 GW), aber Senkung des Bruttostromverbrauchs auf 655 TWh durch stärkere Gebäudesanierung, industrielle Abwärmenutzung und Stromeffizienz. Reduziert den Nenner und hebt den EE-Anteil über 80 %.",
    },
    {
        id: "flex-2030-turbo",
        year: 2030,
        name: "2030 Flexibilitäts- & Speicher-Turbo (≥80 % via Flex)",
        category: "2030-Ziel",
        demandTwh: 727,
        sectorCouplingSharePct: 26,
        pvGw: 240,
        windOnGw: 103,
        windOffGw: 27,
        biomassGw: 8.4,
        hydroGw: 5.6,
        batteryPowerGw: 95,
        batteryCapGwh: 240,
        dsmSharePct: 65,
        electrolyzerGw: 14,
        justification:
            "Kompensiert moderateren Windausbau durch PV-Zubau (240 GW) + massive Flexibilisierung: 95 GW Batterien inkl. bidirektionalem Laden (V2G), 65 % intelligente Lastverschiebung (HEMS/§ 14a EnWG) und 14 GW Elektrolyse verhindern Abregelung von Mittagsspitzen.",
    },
    {
        id: "agora-2035",
        year: 2035,
        name: "2035 Stützjahr: Weitgehend THG-neutraler Strom",
        category: "Langfristpfad",
        demandTwh: 860,
        sectorCouplingSharePct: 34,
        pvGw: 310,
        windOnGw: 135,
        windOffGw: 45,
        biomassGw: 7.5,
        hydroGw: 5.6,
        batteryPowerGw: 95,
        batteryCapGwh: 250,
        dsmSharePct: 50,
        electrolyzerGw: 22,
        justification:
            "Agora 2024 (Kap. 3.1, S. 28): Kohleverstromung ist beendet; zusätzlich 15 GW H₂-fähige Gaskraftwerke sichern Dunkelflauten ab, während ~10 Mio. Wärmepumpen und ~22 Mio. E-Pkw den Strombedarf auf ~860 TWh steigern.",
    },
    {
        id: "agora-2040",
        year: 2040,
        name: "2040 Agora-Pfad (~95 % EE, 13 g CO₂/kWh)",
        category: "Langfristpfad",
        demandTwh: 1000,
        sectorCouplingSharePct: 42,
        pvGw: 400,
        windOnGw: 160,
        windOffGw: 67,
        biomassGw: 6.5,
        hydroGw: 5.6,
        batteryPowerGw: 125,
        batteryCapGwh: 340,
        dsmSharePct: 60,
        electrolyzerGw: 38,
        justification:
            "Agora 2024 (Abb. 11 & S. 29): Der Stromverbrauch erreicht rund 1.000 TWh, Offshore-Wind steigt auf 67 GW und die spezifischen Emissionen sinken durch H₂-Kraftwerke auf 13 g CO₂/kWh.",
    },
    {
        id: "agora-2045",
        year: 2045,
        name: "2045 Klimaneutralität Deutschland (100 % Zielbild)",
        category: "Langfristpfad",
        demandTwh: 1267,
        sectorCouplingSharePct: 50,
        pvGw: 469,
        windOnGw: 180,
        windOffGw: 73,
        biomassGw: 5.5,
        hydroGw: 5.6,
        batteryPowerGw: 155,
        batteryCapGwh: 460,
        dsmSharePct: 70,
        electrolyzerGw: 55,
        justification:
            "Agora 2024 (Tab. A1, S. 80 & Abb. 12): 1.267 TWh Bruttostromverbrauch (15,7 Mio. WP, 37,8 Mio. E-Pkw, 448 TWh Industrie, 84 TWh Inlands-H₂). 469 GW PV, 180 GW Wind Onshore, 73 GW Offshore, 102 GW Großspeicher/V2G + Heimspeicher sowie 72 GW H₂-/Synfuel-Backups.",
    },
];

function parseDeFloat(raw: string | undefined): number | null {
    const t = raw?.trim();
    if (!t || t === "-" || t === "–" || t === "—") return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseGenerationCsv(text: string): GenSlot[] {
    const rows = d3.dsvFormat(";").parse(text.replace(/^\uFEFF/, ""));
    const out: GenSlot[] = [];

    for (const r of rows) {
        const s = parseDate(r["Datum von"]?.trim() ?? "");
        const e = parseDate(r["Datum bis"]?.trim() ?? "");
        if (!s || !e || e.getTime() <= s.getTime()) continue;

        const pv = parseDeFloat(r["Photovoltaik [MWh] Originalauflösungen"]);
        const windOn = parseDeFloat(r["Wind Onshore [MWh] Originalauflösungen"]);
        const windOff = parseDeFloat(r["Wind Offshore [MWh] Originalauflösungen"]);
        const hydro = parseDeFloat(r["Wasserkraft [MWh] Originalauflösungen"]);
        const bio = parseDeFloat(r["Biomasse [MWh] Originalauflösungen"]);
        const otherEe =
            parseDeFloat(r["Sonstige Erneuerbare [MWh] Originalauflösungen"]) ?? 0;

        if (
            pv === null ||
            windOn === null ||
            windOff === null ||
            hydro === null ||
            bio === null
        ) {
            continue;
        }

        out.push({
            startMs: s.getTime(),
            endMs: e.getTime(),
            slotKey: formatSlotKey(s),
            year: s.getUTCFullYear(),
            pv,
            windOn,
            windOff,
            hydro,
            bio,
            otherEe,
        });
    }

    out.sort((a, b) => a.startMs - b.startMs);
    return out;
}

function parseConsumptionCsv(text: string): LoadSlot[] {
    const rows = d3.dsvFormat(";").parse(text.replace(/^\uFEFF/, ""));
    const loadCol =
        rows.columns.find((c) =>
            c.startsWith("Netzlast [MWh]")
        ) ??
        rows.columns.find((c) =>
            c.includes("Gesamt (Netzlast) [MWh]")
        ) ??
        "Netzlast [MWh] Originalauflösungen";

    const out: LoadSlot[] = [];

    for (const r of rows) {
        const s = parseDate(r["Datum von"]?.trim() ?? "");
        if (!s) continue;
        const load = parseDeFloat(r[loadCol]);
        if (load === null || load <= 0) continue;

        out.push({
            startMs: s.getTime(),
            slotKey: formatSlotKey(s),
            year: s.getUTCFullYear(),
            netzlast: load,
        });
    }

    out.sort((a, b) => a.startMs - b.startMs);
    return out;
}

function alignSeries(
    genSlots: GenSlot[],
    loadSlots: LoadSlot[] | null
): AlignedSeries | null {
    if (genSlots.length === 0) return null;

    // 1. Falls keine Verbrauchs-CSV vorliegt: Übergangs-Lastprofil aus geglätteter Erzeugung.
    if (!loadSlots || loadSlots.length === 0) {
        const n = genSlots.length;
        const avgEe =
            genSlots.reduce(
                (s, g) =>
                    s + g.pv + g.windOn + g.windOff + g.hydro + g.bio + g.otherEe,
                0
            ) / n;
        const proxyMean = Math.max(12_500, avgEe * 1.9);

        return {
            count: n,
            genYear: genSlots[0].year,
            loadYear: genSlots[0].year,
            matchedMode: "gen-proxy",
            starts: Float64Array.from(genSlots, (g) => g.startMs),
            ends: Float64Array.from(genSlots, (g) => g.endMs),
            pv: Float64Array.from(genSlots, (g) => g.pv),
            windOn: Float64Array.from(genSlots, (g) => g.windOn),
            windOff: Float64Array.from(genSlots, (g) => g.windOff),
            hydro: Float64Array.from(genSlots, (g) => g.hydro),
            bio: Float64Array.from(genSlots, (g) => g.bio),
            otherEe: Float64Array.from(genSlots, (g) => g.otherEe),
            baseLoad: Float64Array.from(genSlots, (g) => {
                const d = new Date(g.startMs);
                const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
                const dayShape =
                    0.88 + 0.2 * Math.sin(((hr - 6) / 16) * Math.PI);
                return proxyMean * dayShape;
            }),
        };
    }

    // 2. Exakter Zeitstempel-Abgleich (gleiches Jahr).
    const exactMap = new Map<number, number>();
    for (const l of loadSlots) exactMap.set(l.startMs, l.netzlast);

    const exactPairs: { g: GenSlot; load: number }[] = [];
    for (const g of genSlots) {
        const lVal = exactMap.get(g.startMs);
        if (lVal !== undefined) exactPairs.push({ g, load: lVal });
    }

    if (exactPairs.length >= Math.min(genSlots.length, loadSlots.length) * 0.5) {
        return {
            count: exactPairs.length,
            genYear: exactPairs[0].g.year,
            loadYear: exactPairs[0].g.year,
            matchedMode: "exact-timestamp",
            starts: Float64Array.from(exactPairs, (p) => p.g.startMs),
            ends: Float64Array.from(exactPairs, (p) => p.g.endMs),
            pv: Float64Array.from(exactPairs, (p) => p.g.pv),
            windOn: Float64Array.from(exactPairs, (p) => p.g.windOn),
            windOff: Float64Array.from(exactPairs, (p) => p.g.windOff),
            hydro: Float64Array.from(exactPairs, (p) => p.g.hydro),
            bio: Float64Array.from(exactPairs, (p) => p.g.bio),
            otherEe: Float64Array.from(exactPairs, (p) => p.g.otherEe),
            baseLoad: Float64Array.from(exactPairs, (p) => p.load),
        };
    }

    // 3. Unterschiedliche Jahre (z. B. Verbrauch 2020 & Erzeugung 2021): Kopplung über Kalendertag + Uhrzeit ("MM-DD HH:mm").
    const slotMap = new Map<string, number>();
    for (const l of loadSlots) {
        if (!slotMap.has(l.slotKey)) slotMap.set(l.slotKey, l.netzlast);
    }

    const slotPairs: { g: GenSlot; load: number }[] = [];
    for (const g of genSlots) {
        const lVal = slotMap.get(g.slotKey);
        if (lVal !== undefined) slotPairs.push({ g, load: lVal });
    }

    if (slotPairs.length === 0) return null;

    return {
        count: slotPairs.length,
        genYear: slotPairs[0].g.year,
        loadYear: loadSlots[0].year,
        matchedMode: "calendar-slot",
        starts: Float64Array.from(slotPairs, (p) => p.g.startMs),
        ends: Float64Array.from(slotPairs, (p) => p.g.endMs),
        pv: Float64Array.from(slotPairs, (p) => p.g.pv),
        windOn: Float64Array.from(slotPairs, (p) => p.g.windOn),
        windOff: Float64Array.from(slotPairs, (p) => p.g.windOff),
        hydro: Float64Array.from(slotPairs, (p) => p.g.hydro),
        bio: Float64Array.from(slotPairs, (p) => p.g.bio),
        otherEe: Float64Array.from(slotPairs, (p) => p.g.otherEe),
        baseLoad: Float64Array.from(slotPairs, (p) => p.load),
    };
}

/**
 * Viertelstundenscharfe Simulation (Delta t = 0,25 h) über alle Intervalle.
 */
function runQuarterHourSimulation(
    aligned: AlignedSeries,
    params: ScenarioParams
): SimulationResult {
    const n = aligned.count;
    const fullYearQuarters = 35_040; // 8.760 h * 4
    const scaleToFullYear = fullYearQuarters / Math.max(1, n);

    const refGw = HISTORICAL_GW[aligned.genYear] ?? HISTORICAL_GW[2023];
    const fPv = params.pvGw / refGw.pv;
    const fWOn = params.windOnGw / refGw.windOn;
    const fWOff = params.windOffGw / refGw.windOff;
    const fBio = params.biomassGw / refGw.bio;
    const fHyd = params.hydroGw / refGw.hydro;

    const eeRawArr = new Float64Array(n);
    let rawLoadSumMwh = 0;

    for (let i = 0; i < n; i += 1) {
        eeRawArr[i] =
            aligned.pv[i] * fPv +
            aligned.windOn[i] * fWOn +
            aligned.windOff[i] * fWOff +
            aligned.bio[i] * fBio +
            aligned.hydro[i] * fHyd +
            aligned.otherEe[i];
        rawLoadSumMwh += aligned.baseLoad[i];
    }

    // Ziel-Verbrauch (MWh) anteilig auf die Zeitreihenlänge normieren.
    const targetSliceMwh =
        (params.demandTwh * 1_000_000) / scaleToFullYear;
    const secShare = Math.max(0, Math.min(0.65, params.sectorCouplingSharePct / 100));
    const classicTargetMwh = targetSliceMwh * (1 - secShare);
    const sectorTargetMwh = targetSliceMwh * secShare;

    const classicScale =
        rawLoadSumMwh > 0 ? classicTargetMwh / rawLoadSumMwh : 1;

    // Unverschobenes Sektorkopplungs-Profil (Wärmepumpen im Winter höher + Abend-Ladespitze ohne DSM).
    const secWeights = new Float64Array(n);
    let secWeightSum = 0;

    for (let i = 0; i < n; i += 1) {
        const d = new Date(aligned.starts[i]);
        const month = d.getUTCMonth(); // 0=Jan .. 11=Dez
        const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
        const winterWeight =
            1.0 + 0.55 * Math.cos(((month - 0.5) / 12) * Math.PI * 2);
        const eveningPeak =
            1.0 + 0.45 * Math.exp(-Math.pow((hr - 18.5) / 2.8, 2));
        const w = winterWeight * eveningPeak;
        secWeights[i] = w;
        secWeightSum += w;
    }

    const demandBeforeDsm = new Float64Array(n);
    const flexPoolArr = new Float64Array(n);
    const dsmFrac = Math.max(0, Math.min(0.9, params.dsmSharePct / 100));

    for (let i = 0; i < n; i += 1) {
        const classic = aligned.baseLoad[i] * classicScale;
        const sec =
            secWeightSum > 0
                ? (secWeights[i] / secWeightSum) * sectorTargetMwh
                : 0;
        demandBeforeDsm[i] = classic + sec * (1 - dsmFrac);
        flexPoolArr[i] = sec * dsmFrac;
    }

    // 1. Tagesweises DSM (96 Viertelstunden = 24h): Verschiebt flexible WP-/E-Auto-Last in Stunden kleinster Residuallast.
    const demandArr = new Float64Array(n);
    const resBeforeFlex = new Float64Array(n);
    const dayBlock = 96;

    for (let start = 0; start < n; start += dayBlock) {
        const end = Math.min(n, start + dayBlock);
        const len = end - start;
        let dayFlexEnergy = 0;

        for (let i = start; i < end; i += 1) {
            const fullUnshiftedLoad = demandBeforeDsm[i] + flexPoolArr[i];
            resBeforeFlex[i] = fullUnshiftedLoad - eeRawArr[i];
            demandArr[i] = demandBeforeDsm[i];
            dayFlexEnergy += flexPoolArr[i];
        }

        if (dayFlexEnergy > 0 && len > 0) {
            // Attraktivitätsgewicht je Viertelstunde: hoch bei EE-Überschuss / niedriger Residuallast.
            let minR = Infinity;
            let maxR = -Infinity;
            for (let i = start; i < end; i += 1) {
                const r = demandBeforeDsm[i] - eeRawArr[i];
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
            }
            const span = Math.max(1, maxR - minR);
            let attrSum = 0;
            const attr = new Float64Array(len);

            for (let k = 0; k < len; k += 1) {
                const r = demandBeforeDsm[start + k] - eeRawArr[start + k];
                const score = Math.pow(1.05 - (r - minR) / span, 2.6);
                attr[k] = score;
                attrSum += score;
            }

            for (let k = 0; k < len; k += 1) {
                demandArr[start + k] +=
                    attrSum > 0
                        ? (attr[k] / attrSum) * dayFlexEnergy
                        : dayFlexEnergy / len;
            }
        }
    }

    // 2. Chronologischer Batterie- & Elektrolyse-/H2-Dispatch (Delta t = 0,25 h).
    const batMaxMwh = params.batteryCapGwh * 1000;
    const batStepMaxMwh = params.batteryPowerGw * 1000 * 0.25;
    const etaOneWay = Math.sqrt(0.92);

    const elecStepMaxMwh = params.electrolyzerGw * 1000 * 0.25;
    const etaPtg = 0.68;
    const etaGtp = 0.56;

    let batSocMwh = batMaxMwh * 0.5;
    let h2StorageMwh = 0;

    const resAfterFlex = new Float64Array(n);
    const batterySocPct = new Float64Array(n);

    let grossEeMwh = 0;
    let curtailedMwh = 0;
    let batDischargedMwh = 0;
    let h2ProducedMwh = 0;
    let h2ReconvertedMwh = 0;
    let fossilBackupMwh = 0;
    let peakBackupMw = 0;
    let peakSurplusMw = 0;

    for (let i = 0; i < n; i += 1) {
        grossEeMwh += eeRawArr[i];
        let residual = demandArr[i] - eeRawArr[i]; // >0 Defizit, <0 Überschuss

        if (residual < 0) {
            let surplus = -residual;

            // Zuerst Batteriespeicher laden.
            if (batMaxMwh > 0 && batStepMaxMwh > 0) {
                const roomInBat = (batMaxMwh - batSocMwh) / etaOneWay;
                const chargeIn = Math.min(surplus, batStepMaxMwh, roomInBat);
                batSocMwh += chargeIn * etaOneWay;
                surplus -= chargeIn;
            }

            // Danach Elektrolyseur für grünen Wasserstoff nutzen.
            if (elecStepMaxMwh > 0 && surplus > 0) {
                const toElec = Math.min(surplus, elecStepMaxMwh);
                const h2Gain = toElec * etaPtg;
                h2StorageMwh += h2Gain;
                h2ProducedMwh += h2Gain;
                surplus -= toElec;
            }

            curtailedMwh += surplus;
            resAfterFlex[i] = -surplus;
            const surplusMw = surplus * 4;
            if (surplusMw > peakSurplusMw) peakSurplusMw = surplusMw;
        } else if (residual > 0) {
            let deficit = residual;

            // Zuerst Batteriespeicher entladen.
            if (batMaxMwh > 0 && batStepMaxMwh > 0 && batSocMwh > 0) {
                const maxDeliverable = batSocMwh * etaOneWay;
                const dischargeOut = Math.min(
                    deficit,
                    batStepMaxMwh,
                    maxDeliverable
                );
                batSocMwh -= dischargeOut / etaOneWay;
                batDischargedMwh += dischargeOut;
                deficit -= dischargeOut;
            }

            // Danach gespeicherten grünen Wasserstoff rückverstromen.
            if (deficit > 0 && h2StorageMwh > 0) {
                const maxH2Elec = h2StorageMwh * etaGtp;
                const fromH2 = Math.min(deficit, maxH2Elec);
                h2StorageMwh -= fromH2 / etaGtp;
                h2ReconvertedMwh += fromH2;
                deficit -= fromH2;
            }

            fossilBackupMwh += deficit;
            resAfterFlex[i] = deficit;

            // Backup-Leistung umfasst H2-Turbinen + verbleibendes Residuallast-Backup in dieser Viertelstunde.
            const totalBackupMw = (residual - (residual - deficit - 0)) * 4;
            const dispatchBackupMw =
                (deficit + (residual - deficit < 0 ? 0 : 0)) * 4;
            const actualTurbineMw =
                Math.max(deficit, 0) * 4;
            void totalBackupMw;
            void dispatchBackupMw;
            if (actualTurbineMw > peakBackupMw) {
                peakBackupMw = actualTurbineMw;
            }
        } else {
            resAfterFlex[i] = 0;
        }

        batterySocPct[i] =
            batMaxMwh > 0 ? (batSocMwh / batMaxMwh) * 100 : 0;
    }

    // Kritischstes 7-Tage-Dunkelflautenfenster (672 Viertelstunden) & Überschussfenster finden.
    const winLen = Math.min(n, 672);
    let winSum = 0;
    for (let i = 0; i < winLen; i += 1) winSum += resAfterFlex[i];
    let maxWinSum = winSum;
    let minWinSum = winSum;
    let dunkelflauteStartIdx = 0;
    let surplusWeekStartIdx = 0;

    for (let i = winLen; i < n; i += 1) {
        winSum += resAfterFlex[i] - resAfterFlex[i - winLen];
        if (winSum > maxWinSum) {
            maxWinSum = winSum;
            dunkelflauteStartIdx = i - winLen + 1;
        }
        if (winSum < minWinSum) {
            minWinSum = winSum;
            surplusWeekStartIdx = i - winLen + 1;
        }
    }

    const totalDemandMwh = demandArr.reduce((s, v) => s + v, 0);
    const usableEeMwh = Math.max(0, totalDemandMwh - fossilBackupMwh);
    const usableEeSharePct =
        totalDemandMwh > 0 ? (usableEeMwh / totalDemandMwh) * 100 : 0;

    // Emissionsfaktor des verbleibenden Residuallast-Backups (sinkt von Erdgas ~380 g/kWh 2030 Richtung H2-Import 2045).
    const backupEmissionGramPerKwh =
        params.year >= 2045
            ? 0
            : params.year >= 2040
              ? 120
              : params.year >= 2035
                ? 260
                : 380;

    const fossilBackupTwh =
        (fossilBackupMwh * scaleToFullYear) / 1_000_000;
    const co2MioTons =
        (fossilBackupTwh * backupEmissionGramPerKwh) / 1000;

    // Maximale Backup-Kraftwerksleistung inkl. H2-Gasturbinen:
    let maxTotalBackupMw = 0;
    for (let i = 0; i < n; i += 1) {
        if (resBeforeFlex[i] > 0) {
            // Nach Batterie verbleibende Turbinenlast = fossil + H2
            const turbineMw = Math.max(0, resAfterFlex[i]) * 4;
            if (turbineMw > maxTotalBackupMw) maxTotalBackupMw = turbineMw;
        }
    }

    return {
        count: n,
        scaleToFullYear,
        demandArr,
        eeRawArr,
        resBeforeFlex,
        resAfterFlex,
        batterySocPct,
        totalDemandTwh: (totalDemandMwh * scaleToFullYear) / 1_000_000,
        grossEeTwh: (grossEeMwh * scaleToFullYear) / 1_000_000,
        curtailedTwh: (curtailedMwh * scaleToFullYear) / 1_000_000,
        curtailedPct:
            grossEeMwh > 0 ? (curtailedMwh / grossEeMwh) * 100 : 0,
        batteryDischargedTwh:
            (batDischargedMwh * scaleToFullYear) / 1_000_000,
        h2ProducedTwh: (h2ProducedMwh * scaleToFullYear) / 1_000_000,
        h2ReconvertedTwh:
            (h2ReconvertedMwh * scaleToFullYear) / 1_000_000,
        fossilBackupTwh,
        usableEeSharePct,
        peakBackupGw: Math.max(peakBackupMw, maxTotalBackupMw) / 1000,
        peakSurplusGw: peakSurplusMw / 1000,
        co2MioTons,
        dunkelflauteStartIdx,
        surplusWeekStartIdx,
    };
}

export default function DecisionEngine({
    generationCsvUrl = `${import.meta.env.BASE_URL}SMARD_Erzeugung_2020_2026.csv`,
    consumptionCsvUrl = `${import.meta.env.BASE_URL}SMARD_Verbrauch_2020_2026.csv`,
}: DecisionEngineProps) {
    const [genSlots, setGenSlots] = useState<GenSlot[] | null>(null);
    const [loadSlots, setLoadSlots] = useState<LoadSlot[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    const [activePresetId, setActivePresetId] =
        useState<string>("agora-2030-ref");
    const [params, setParams] = useState<ScenarioParams>(
        PRESET_SCENARIOS[0]
    );
    const [activeTab, setActiveTab] = useState<ViewTab>("rldc");
    const [tsWindowStart, setTsWindowStart] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctrl = new AbortController();

        async function loadInitialCsvs() {
            setLoading(true);
            setStatusMsg(null);
            try {
                const genRes = await fetch(generationCsvUrl, {
                    signal: ctrl.signal,
                    cache: "no-store",
                });
                if (!genRes.ok) {
                    throw new Error(
                        `Erzeugungs-CSV (${generationCsvUrl}) nicht gefunden – bitte oben per Datei-Auswahl laden.`
                    );
                }
                const genText = await genRes.text();
                if (ctrl.signal.aborted) return;
                setGenSlots(parseGenerationCsv(genText));

                try {
                    const loadRes = await fetch(consumptionCsvUrl, {
                        signal: ctrl.signal,
                        cache: "no-store",
                    });
                    if (loadRes.ok) {
                        const loadText = await loadRes.text();
                        if (!ctrl.signal.aborted) {
                            const parsedLoad = parseConsumptionCsv(loadText);
                            if (parsedLoad.length > 0) setLoadSlots(parsedLoad);
                        }
                    }
                } catch {
                    // Verbrauchs-CSV kann jederzeit manuell hochgeladen werden.
                }
            } catch (err) {
                if (!ctrl.signal.aborted) {
                    setStatusMsg(
                        err instanceof Error
                            ? err.message
                            : "Fehler beim Laden der CSV-Daten."
                    );
                }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        }

        void loadInitialCsvs();
        return () => ctrl.abort();
    }, [generationCsvUrl, consumptionCsvUrl]);

    const handleFileUpload = (
        e: ChangeEvent<HTMLInputElement>,
        kind: "gen" | "load"
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result ?? "");
            try {
                if (kind === "gen") {
                    const parsed = parseGenerationCsv(text);
                    if (parsed.length === 0) {
                        throw new Error("Keine gültigen Erzeugungszeilen erkannt.");
                    }
                    setGenSlots(parsed);
                    setStatusMsg(null);
                } else {
                    const parsed = parseConsumptionCsv(text);
                    if (parsed.length === 0) {
                        throw new Error("Keine gültigen Netzlast-Zeilen erkannt.");
                    }
                    setLoadSlots(parsed);
                    setStatusMsg(null);
                }
            } catch (err) {
                setStatusMsg(
                    err instanceof Error ? err.message : "CSV-Fehler"
                );
            }
        };
        reader.readAsText(file, "utf-8");
    };

    const aligned = useMemo(
        () => (genSlots ? alignSeries(genSlots, loadSlots) : null),
        [genSlots, loadSlots]
    );

    const sim = useMemo(
        () =>
            aligned ? runQuarterHourSimulation(aligned, params) : null,
        [aligned, params]
    );

    // Alle 7 Referenzszenarien parallel für den Szenariovergleich berechnen.
    const allPresetRuns = useMemo(() => {
        if (!aligned) return [];
        return PRESET_SCENARIOS.map((sc) => ({
            scenario: sc,
            result: runQuarterHourSimulation(aligned, sc),
        }));
    }, [aligned]);

    useEffect(() => {
        if (sim) setTsWindowStart(sim.dunkelflauteStartIdx);
    }, [sim?.dunkelflauteStartIdx]);

    const selectPreset = (sc: ScenarioParams) => {
        setActivePresetId(sc.id);
        setParams({ ...sc });
    };

    const updateParam = <K extends keyof ScenarioParams>(
        key: K,
        value: ScenarioParams[K]
    ) => {
        setActivePresetId("custom");
        setParams((prev) => ({ ...prev, [key]: value }));
    };

    // Canvas-Zeichnung für Tab "rldc", "timeseries" und "comparison".
    useEffect(() => {
        if (activeTab === "architecture") return;
        const canvas = canvasRef.current;
        const wrap = chartWrapRef.current;
        if (!canvas || !wrap || !sim || !aligned) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const draw = () => {
            const rect = wrap.getBoundingClientRect();
            const w = Math.max(300, rect.width);
            const h = Math.max(280, rect.height);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            if (
                canvas.width !== Math.round(w * dpr) ||
                canvas.height !== Math.round(h * dpr)
            ) {
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const mL = 64;
            const mR = 24;
            const mT = 28;
            const mB = 46;
            const pw = Math.max(10, w - mL - mR);
            const ph = Math.max(10, h - mT - mB);

            if (activeTab === "rldc") {
                // Geordnete Jahresdauerlinie in GW (MWh * 4 / 1000).
                const n = sim.count;
                const sortedBefore = Float64Array.from(
                    sim.resBeforeFlex,
                    (v) => (v * 4) / 1000
                ).sort((a, b) => b - a);
                const sortedAfter = Float64Array.from(
                    sim.resAfterFlex,
                    (v) => (v * 4) / 1000
                ).sort((a, b) => b - a);

                const yMax = Math.max(
                    20,
                    sortedBefore[0] * 1.08,
                    sortedAfter[0] * 1.08
                );
                const yMin = Math.min(
                    -20,
                    sortedBefore[n - 1] * 1.08,
                    sortedAfter[n - 1] * 1.08
                );

                const xPos = (idx: number) =>
                    mL + (idx / Math.max(1, n - 1)) * pw;
                const yPos = (gw: number) =>
                    mT + ((yMax - gw) / Math.max(1, yMax - yMin)) * ph;
                const zeroY = yPos(0);

                // Gitterlinien
                ctx.strokeStyle = "#1e293b";
                ctx.lineWidth = 1;
                const yScale = d3.scaleLinear().domain([yMin, yMax]).nice();
                for (const tk of yScale.ticks(6)) {
                    const py = yPos(tk);
                    if (py < mT || py > mT + ph) continue;
                    ctx.beginPath();
                    ctx.moveTo(mL, py);
                    ctx.lineTo(mL + pw, py);
                    ctx.stroke();

                    ctx.fillStyle = "#94a3b8";
                    ctx.font = `11px ${FONT}`;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "middle";
                    ctx.fillText(`${tk} GW`, mL - 8, py);
                }

                // Nulllinie
                ctx.strokeStyle = "#64748b";
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(mL, zeroY);
                ctx.lineTo(mL + pw, zeroY);
                ctx.stroke();

                // Fläche Nach Flexibilisierung (Defizit = rot/orange, Abregelung = gelb)
                const step = Math.max(1, Math.floor(n / 600));
                ctx.beginPath();
                ctx.moveTo(xPos(0), zeroY);
                for (let i = 0; i < n; i += step) {
                    ctx.lineTo(xPos(i), yPos(Math.max(0, sortedAfter[i])));
                }
                ctx.lineTo(xPos(n - 1), zeroY);
                ctx.closePath();
                ctx.fillStyle = "rgba(249, 115, 22, 0.32)";
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(xPos(0), zeroY);
                for (let i = 0; i < n; i += step) {
                    ctx.lineTo(xPos(i), yPos(Math.min(0, sortedAfter[i])));
                }
                ctx.lineTo(xPos(n - 1), zeroY);
                ctx.closePath();
                ctx.fillStyle = "rgba(234, 179, 8, 0.28)";
                ctx.fill();

                // Vor Flexibilisierung (gestrichelt)
                ctx.save();
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = "#94a3b8";
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                for (let i = 0; i < n; i += step) {
                    const px = xPos(i);
                    const py = yPos(sortedBefore[i]);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.restore();

                // Nach Flexibilisierung (Hauptkurve)
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                for (let i = 0; i < n; i += step) {
                    const px = xPos(i);
                    const py = yPos(sortedAfter[i]);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                // X-Achse (Prozent der Jahresviertelstunden)
                for (const pct of [0, 20, 40, 60, 80, 100]) {
                    const px = mL + (pct / 100) * pw;
                    ctx.fillStyle = "#94a3b8";
                    ctx.font = `11px ${FONT}`;
                    ctx.textAlign = "center";
                    ctx.fillText(`${pct} % der Zeit`, px, mT + ph + 22);
                }

                // Legende
                ctx.font = `11.5px ${FONT}`;
                ctx.textAlign = "left";
                ctx.fillStyle = "#94a3b8";
                ctx.fillText(
                    "- - Residuallast VOR Flexibilisierung",
                    mL + 12,
                    mT + 14
                );
                ctx.fillStyle = "#38bdf8";
                ctx.fillText(
                    "— Residuallast NACH Batterie, DSM & H₂  (oben: Backup-Bedarf | unten: Abregelung)",
                    mL + 245,
                    mT + 14
                );
            } else if (activeTab === "timeseries") {
                // 7-Tage-Viertelstunden-Ausschnitt (bis zu 672 Punkte)
                const winLen = Math.min(sim.count, 672);
                const start = Math.max(
                    0,
                    Math.min(tsWindowStart, sim.count - winLen)
                );
                const end = start + winLen;

                let maxGw = 20;
                for (let i = start; i < end; i += 1) {
                    maxGw = Math.max(
                        maxGw,
                        (sim.demandArr[i] * 4) / 1000,
                        (sim.eeRawArr[i] * 4) / 1000
                    );
                }
                maxGw *= 1.1;

                const xPos = (i: number) =>
                    mL + ((i - start) / Math.max(1, winLen - 1)) * pw;
                const yPos = (gw: number) =>
                    mT + ((maxGw - gw) / maxGw) * ph;

                const yScale = d3.scaleLinear().domain([0, maxGw]).nice();
                ctx.strokeStyle = "#1e293b";
                for (const tk of yScale.ticks(5)) {
                    const py = yPos(tk);
                    ctx.beginPath();
                    ctx.moveTo(mL, py);
                    ctx.lineTo(mL + pw, py);
                    ctx.stroke();
                    ctx.fillStyle = "#94a3b8";
                    ctx.font = `11px ${FONT}`;
                    ctx.textAlign = "right";
                    ctx.fillText(`${tk} GW`, mL - 8, py);
                }

                // EE-Erzeugung (grüne Fläche)
                ctx.beginPath();
                ctx.moveTo(xPos(start), yPos(0));
                for (let i = start; i < end; i += 1) {
                    ctx.lineTo(xPos(i), yPos((sim.eeRawArr[i] * 4) / 1000));
                }
                ctx.lineTo(xPos(end - 1), yPos(0));
                ctx.closePath();
                ctx.fillStyle = "rgba(16, 185, 129, 0.28)";
                ctx.fill();

                ctx.strokeStyle = "#10b981";
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                for (let i = start; i < end; i += 1) {
                    const px = xPos(i);
                    const py = yPos((sim.eeRawArr[i] * 4) / 1000);
                    if (i === start) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                // Last nach DSM (weiße/hellblaue Linie)
                ctx.strokeStyle = "#f8fafc";
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = start; i < end; i += 1) {
                    const px = xPos(i);
                    const py = yPos((sim.demandArr[i] * 4) / 1000);
                    if (i === start) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                // Verbleibendes Backup-Defizit nach Speichern (orange Linie)
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                for (let i = start; i < end; i += 1) {
                    const gw = Math.max(0, (sim.resAfterFlex[i] * 4) / 1000);
                    const px = xPos(i);
                    const py = yPos(gw);
                    if (i === start) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                // Zeitstempel-Ticks
                const tickStep = Math.max(1, Math.floor(winLen / 6));
                ctx.fillStyle = "#94a3b8";
                ctx.font = `11px ${FONT}`;
                ctx.textAlign = "center";
                for (let i = start; i < end; i += tickStep) {
                    ctx.fillText(
                        formatShortDate(new Date(aligned.starts[i])),
                        xPos(i),
                        mT + ph + 22
                    );
                }

                ctx.textAlign = "left";
                ctx.fillStyle = "#10b981";
                ctx.fillText("■ EE-Einspeisung (GW)", mL + 10, mT + 14);
                ctx.fillStyle = "#f8fafc";
                ctx.fillText("— Skalierte Last inkl. DSM", mL + 165, mT + 14);
                ctx.fillStyle = "#f97316";
                ctx.fillText(
                    "— Ungedecktes Backup nach Speichern",
                    mL + 350,
                    mT + 14
                );
            } else if (activeTab === "comparison") {
                // Balkenvergleich aller 7 Szenarien gegen die 80-%-Ziellinie
                const items = allPresetRuns;
                const barSlot = pw / Math.max(1, items.length);
                const barW = Math.min(58, barSlot * 0.62);
                const yPos = (pct: number) => mT + ((105 - pct) / 105) * ph;

                for (const pct of [0, 20, 40, 60, 80, 100]) {
                    const py = yPos(pct);
                    ctx.strokeStyle = pct === 80 ? "#eab308" : "#1e293b";
                    ctx.lineWidth = pct === 80 ? 2 : 1;
                    ctx.beginPath();
                    ctx.moveTo(mL, py);
                    ctx.lineTo(mL + pw, py);
                    ctx.stroke();

                    ctx.fillStyle = pct === 80 ? "#eab308" : "#94a3b8";
                    ctx.font = `${pct === 80 ? "700 " : ""}11px ${FONT}`;
                    ctx.textAlign = "right";
                    ctx.fillText(`${pct} %`, mL - 8, py + 3);
                }

                items.forEach((it, idx) => {
                    const val = Math.min(100, it.result.usableEeSharePct);
                    const cx = mL + (idx + 0.5) * barSlot;
                    const topY = yPos(val);
                    const baseY = yPos(0);

                    ctx.fillStyle =
                        val >= 79.95 ? "#10b981" : "#f97316";
                    ctx.fillRect(cx - barW / 2, topY, barW, baseY - topY);

                    ctx.fillStyle = "#f8fafc";
                    ctx.font = `700 11.5px ${FONT}`;
                    ctx.textAlign = "center";
                    ctx.fillText(`${fmt1.format(val)} %`, cx, topY - 7);

                    const shortLbl = it.scenario.id
                        .replace("agora-", "Agora ")
                        .replace("-ref", "")
                        .replace("eeg-2030-ausbau", "2030 EEG+")
                        .replace("effizienz-2030", "2030 Effiz.")
                        .replace("flex-2030-turbo", "2030 Flex+");
                    ctx.fillStyle = "#cbd5e1";
                    ctx.font = `11px ${FONT}`;
                    ctx.fillText(shortLbl, cx, mT + ph + 20);
                    ctx.fillStyle = "#94a3b8";
                    ctx.fillText(
                        `${it.scenario.demandTwh} TWh`,
                        cx,
                        mT + ph + 35
                    );
                });
            }
        };

        const ro = new ResizeObserver(draw);
        ro.observe(wrap);
        draw();
        return () => ro.disconnect();
    }, [activeTab, sim, aligned, tsWindowStart, allPresetRuns]);

    const exportScenarioCsv = () => {
        if (allPresetRuns.length === 0) return;
        const currentRuns =
            activePresetId === "custom" && sim
                ? [...allPresetRuns, { scenario: params, result: sim }]
                : allPresetRuns;

        const header = [
            "Szenario",
            "Zieljahr",
            "Verbrauch [TWh]",
            "PV [GW]",
            "Wind Onshore [GW]",
            "Wind Offshore [GW]",
            "Batterie [GW / GWh]",
            "DSM [%]",
            "Elektrolyse [GW]",
            "Nutzbarer EE-Anteil [%]",
            "Abregelung [TWh]",
            "Max. Backup-Leistung [GW]",
            "Residuallast-Backup [TWh]",
            "CO2-Emissionen [Mio. t]",
        ].join(";");

        const lines = currentRuns.map(({ scenario: s, result: r }) =>
            [
                s.name,
                s.year,
                s.demandTwh,
                s.pvGw,
                s.windOnGw,
                s.windOffGw,
                `${s.batteryPowerGw} / ${s.batteryCapGwh}`,
                s.dsmSharePct,
                s.electrolyzerGw,
                fmt1.format(r.usableEeSharePct),
                fmt1.format(r.curtailedTwh),
                fmt1.format(r.peakBackupGw),
                fmt1.format(r.fossilBackupTwh),
                fmt1.format(r.co2MioTons),
            ].join(";")
        );

        const blob = new Blob([`\uFEFF${[header, ...lines].join("\r\n")}`], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "DecisionEngine_Szenariovergleich_2030_2045.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const goalReached = (sim?.usableEeSharePct ?? 0) >= 79.95;

    return (
        <div className="content-body" style={{ fontFamily: FONT, color: "#f8fafc" }}>
            <div
                style={{
                    background: "#0f172a",
                    borderRadius: 16,
                    border: "1px solid #334155",
                    padding: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                {/* Kopfzeile & CSV-Datenquellen */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 12,
                        borderBottom: "1px solid #1e293b",
                        paddingBottom: 12,
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20 }}>
                            DecisionEngine: Viertelstundenscharfe Szenariosimulation (2030–2045)
                        </h2>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                            Datenbasis: SMARD 15-Min.-Zeitreihen × Agora-Studie „Klimaneutrales Deutschland“ & EEG 2023
                        </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <label style={BTN_STYLE}>
                            📂 Erzeugungs-CSV
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileUpload(e, "gen")}
                                style={{ display: "none" }}
                            />
                        </label>
                        <label style={BTN_STYLE}>
                            📂 Verbrauchs-CSV (Netzlast)
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileUpload(e, "load")}
                                style={{ display: "none" }}
                            />
                        </label>
                        <button type="button" onClick={exportScenarioCsv} style={BTN_ACCENT_STYLE}>
                            ⬇ Szenarien als CSV
                        </button>
                    </div>
                </div>

                {/* Status-Badges zur SMARD-Datenkopplung */}
                {aligned && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                        <span style={BADGE_BLUE}>
                            ✓ {aligned.count.toLocaleString("de-DE")} Viertelstunden simuliert (
                            {formatDate(new Date(aligned.starts[0]))} –{" "}
                            {formatDate(new Date(aligned.ends[aligned.count - 1]))})
                        </span>
                        <span
                            style={
                                aligned.matchedMode === "gen-proxy"
                                    ? BADGE_WARN
                                    : BADGE_GREEN
                            }
                        >
                            {aligned.matchedMode === "exact-timestamp" &&
                                `Exakte Zeitstempel-Kopplung (${aligned.genYear})`}
                            {aligned.matchedMode === "calendar-slot" &&
                                `Kalenderslot-Kopplung: Erzeugung ${aligned.genYear} × Netzlast ${aligned.loadYear}`}
                            {aligned.matchedMode === "gen-proxy" &&
                                "Hinweis: Noch keine Verbrauchs-CSV geladen (Synthetisches Lastprofil aktiv – oben Verbrauchs-CSV wählen)"}
                        </span>
                    </div>
                )}

                {loading && <p>SMARD-Zeitreihen werden geladen …</p>}
                {statusMsg && <div style={BADGE_WARN}>{statusMsg}</div>}

                {/* Szenario-Auswahlleiste (2030 Varianten + Folgejahre bis 2045) */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PRESET_SCENARIOS.map((sc) => {
                        const active = activePresetId === sc.id;
                        return (
                            <button
                                key={sc.id}
                                type="button"
                                onClick={() => selectPreset(sc)}
                                style={{
                                    ...BTN_STYLE,
                                    background: active ? "#2563eb" : "#1e293b",
                                    borderColor: active ? "#60a5fa" : "#334155",
                                    fontWeight: active ? 700 : 500,
                                }}
                            >
                                {sc.name}
                            </button>
                        );
                    })}
                </div>

                {sim && (
                    <>
                        {/* Zielgrößen-Cockpit (KPIs) */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    ...KPI_CARD,
                                    borderColor: goalReached ? "#10b981" : "#f97316",
                                    background: goalReached
                                        ? "rgba(16, 185, 129, 0.12)"
                                        : "rgba(249, 115, 22, 0.12)",
                                }}
                            >
                                <div style={KPI_LABEL}>Nutzbarer EE-Anteil am Verbrauch</div>
                                <div
                                    style={{
                                        fontSize: 24,
                                        fontWeight: 800,
                                        color: goalReached ? "#34d399" : "#fb923c",
                                    }}
                                >
                                    {fmt1.format(sim.usableEeSharePct)} %
                                </div>
                                <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                                    {goalReached
                                        ? "✓ ≥ 80-%-Ziel erreicht"
                                        : `✕ ${fmt1.format(80 - sim.usableEeSharePct)} %-Punkte unter 80 %`}
                                </div>
                            </div>

                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>Bruttostromverbrauch</div>
                                <div style={KPI_VAL}>{fmt0.format(sim.totalDemandTwh)} TWh</div>
                                <div style={KPI_SUB}>
                                    Brutto-EE-Potenzial: {fmt0.format(sim.grossEeTwh)} TWh
                                </div>
                            </div>

                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>Abregelung (Curtailment)</div>
                                <div style={{ ...KPI_VAL, color: "#facc15" }}>
                                    {fmt1.format(sim.curtailedTwh)} TWh
                                </div>
                                <div style={KPI_SUB}>
                                    {fmt1.format(sim.curtailedPct)} % der EE-Erzeugung
                                </div>
                            </div>

                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>Speicher- & H₂-Beitrag</div>
                                <div style={{ ...KPI_VAL, color: "#38bdf8" }}>
                                    {fmt1.format(
                                        sim.batteryDischargedTwh + sim.h2ReconvertedTwh
                                    )}{" "}
                                    TWh
                                </div>
                                <div style={KPI_SUB}>
                                    Batterie: {fmt1.format(sim.batteryDischargedTwh)} TWh · H₂:{" "}
                                    {fmt1.format(sim.h2ReconvertedTwh)} TWh
                                </div>
                            </div>

                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>Benötigte Backup-Kraftwerke</div>
                                <div style={{ ...KPI_VAL, color: "#fb923c" }}>
                                    {fmt1.format(sim.peakBackupGw)} GW
                                </div>
                                <div style={KPI_SUB}>
                                    Residuallast: {fmt1.format(sim.fossilBackupTwh)} TWh ·{" "}
                                    {fmt1.format(sim.co2MioTons)} Mio. t CO₂
                                </div>
                            </div>
                        </div>

                        {/* Haupt-Grid: Links Interaktive Parameter-Regler, Rechts Diagramme */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(290px, 1fr) minmax(360px, 1.85fr)",
                                gap: 16,
                            }}
                        >
                            {/* Parameter-Konfigurator (Verbrauch, EE-Ausbau, Flexibilisierung) */}
                            <div
                                style={{
                                    background: "#1e293b",
                                    borderRadius: 12,
                                    padding: 14,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 10,
                                }}
                            >
                                <strong style={{ fontSize: 13.5, color: "#e2e8f0" }}>
                                    1. Verbrauch & Sektorkopplung
                                </strong>
                                <SliderRow
                                    label="Bruttostromverbrauch"
                                    value={params.demandTwh}
                                    min={500}
                                    max={1400}
                                    step={5}
                                    unit="TWh"
                                    onChange={(v) => updateParam("demandTwh", v)}
                                />
                                <SliderRow
                                    label="Anteil WP / E-Autos / Flex"
                                    value={params.sectorCouplingSharePct}
                                    min={5}
                                    max={60}
                                    step={1}
                                    unit="%"
                                    onChange={(v) => updateParam("sectorCouplingSharePct", v)}
                                />

                                <strong style={{ fontSize: 13.5, color: "#e2e8f0", marginTop: 4 }}>
                                    2. Ausbau Erneuerbare Energien
                                </strong>
                                <SliderRow
                                    label="Photovoltaik"
                                    value={params.pvGw}
                                    min={80}
                                    max={520}
                                    step={5}
                                    unit="GW"
                                    onChange={(v) => updateParam("pvGw", v)}
                                />
                                <SliderRow
                                    label="Wind Onshore"
                                    value={params.windOnGw}
                                    min={60}
                                    max={210}
                                    step={2}
                                    unit="GW"
                                    onChange={(v) => updateParam("windOnGw", v)}
                                />
                                <SliderRow
                                    label="Wind Offshore"
                                    value={params.windOffGw}
                                    min={8}
                                    max={85}
                                    step={1}
                                    unit="GW"
                                    onChange={(v) => updateParam("windOffGw", v)}
                                />

                                <strong style={{ fontSize: 13.5, color: "#e2e8f0", marginTop: 4 }}>
                                    3. Flexibilisierung & Speicher
                                </strong>
                                <SliderRow
                                    label="Batterieleistung (inkl. V2G)"
                                    value={params.batteryPowerGw}
                                    min={0}
                                    max={180}
                                    step={5}
                                    unit="GW"
                                    onChange={(v) => updateParam("batteryPowerGw", v)}
                                />
                                <SliderRow
                                    label="Batteriekapazität"
                                    value={params.batteryCapGwh}
                                    min={0}
                                    max={550}
                                    step={10}
                                    unit="GWh"
                                    onChange={(v) => updateParam("batteryCapGwh", v)}
                                />
                                <SliderRow
                                    label="DSM Lastverschiebung (24h)"
                                    value={params.dsmSharePct}
                                    min={0}
                                    max={85}
                                    step={5}
                                    unit="%"
                                    onChange={(v) => updateParam("dsmSharePct", v)}
                                />
                                <SliderRow
                                    label="Elektrolyse-Leistung (H₂)"
                                    value={params.electrolyzerGw}
                                    min={0}
                                    max={80}
                                    step={2}
                                    unit="GW"
                                    onChange={(v) => updateParam("electrolyzerGw", v)}
                                />
                            </div>

                            {/* Rechte Spalte: Visualisierungs-Tabs + Agora-Begründung */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("rldc")}
                                        style={activeTab === "rldc" ? TAB_ACTIVE : BTN_STYLE}
                                    >
                                        📈 Geordnete Jahresdauerlinie (RLDC)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("timeseries")}
                                        style={activeTab === "timeseries" ? TAB_ACTIVE : BTN_STYLE}
                                    >
                                        🔍 15-Min.-Zeitreihe & Dunkelflaute
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("comparison")}
                                        style={activeTab === "comparison" ? TAB_ACTIVE : BTN_STYLE}
                                    >
                                        📊 Szenariovergleich (2030–2045)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("architecture")}
                                        style={activeTab === "architecture" ? TAB_ACTIVE : BTN_STYLE}
                                    >
                                        🧭 Systemfluss-Diagramm
                                    </button>
                                </div>

                                {activeTab === "timeseries" && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setTsWindowStart(sim.dunkelflauteStartIdx)
                                            }
                                            style={BTN_STYLE}
                                        >
                                            ⚠️ Kritischste Dunkelflaute (7 Tage) zeigen
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setTsWindowStart(sim.surplusWeekStartIdx)
                                            }
                                            style={BTN_STYLE}
                                        >
                                            ☀️ Stärkste EE-Überschusswoche zeigen
                                        </button>
                                        <input
                                            type="range"
                                            min={0}
                                            max={Math.max(0, sim.count - 672)}
                                            value={tsWindowStart}
                                            onChange={(e) =>
                                                setTsWindowStart(Number(e.target.value))
                                            }
                                            style={{ flex: 1, minWidth: 130, accentColor: "#38bdf8" }}
                                        />
                                    </div>
                                )}

                                {activeTab !== "architecture" ? (
                                    <div
                                        ref={chartWrapRef}
                                        style={{
                                            width: "100%",
                                            height: 360,
                                            background: "#020617",
                                            borderRadius: 12,
                                            border: "1px solid #1e293b",
                                            position: "relative",
                                        }}
                                    >
                                        <canvas
                                            ref={canvasRef}
                                            style={{ width: "100%", height: "100%", display: "block" }}
                                        />
                                    </div>
                                ) : (
                                    /* Eingebettetes Systemfluss-Diagramm mit Live-Zahlen des aktuellen Szenarios */
                                    <div
                                        style={{
                                            background: "#020617",
                                            borderRadius: 12,
                                            border: "1px solid #1e293b",
                                            padding: 16,
                                        }}
                                    >
                                        <svg
                                            viewBox="0 0 760 290"
                                            style={{ width: "100%", height: "auto", display: "block" }}
                                        >
                                            <defs>
                                                <marker
                                                    id="arrow"
                                                    viewBox="0 0 10 10"
                                                    refX="8"
                                                    refY="5"
                                                    markerWidth="6"
                                                    markerHeight="6"
                                                    orient="auto-start-reverse"
                                                >
                                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                                                </marker>
                                            </defs>

                                            {/* Verbindungspfeile */}
                                            <path d="M 205 65 L 275 110" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arrow)" />
                                            <path d="M 205 145 L 275 145" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arrow)" />
                                            <path d="M 205 225 L 275 180" stroke="#eab308" strokeWidth="2" markerEnd="url(#arrow)" />
                                            <path d="M 495 145 L 555 85" stroke="#10b981" strokeWidth="2.2" markerEnd="url(#arrow)" />
                                            <path d="M 495 145 L 555 165" stroke="#facc15" strokeWidth="2" markerEnd="url(#arrow)" />
                                            <path d="M 495 145 L 555 235" stroke="#f97316" strokeWidth="2" markerEnd="url(#arrow)" />

                                            {/* Spalte 1: Datenbasis */}
                                            <rect x="15" y="35" width="190" height="55" rx="8" fill="#1e293b" stroke="#38bdf8" />
                                            <text x="27" y="58" fill="#f8fafc" fontSize="12" fontWeight="700">SMARD Erzeugungs-CSV</text>
                                            <text x="27" y="76" fill="#94a3b8" fontSize="11">PV {params.pvGw} GW · Wind {params.windOnGw + params.windOffGw} GW</text>

                                            <rect x="15" y="115" width="190" height="55" rx="8" fill="#1e293b" stroke="#38bdf8" />
                                            <text x="27" y="138" fill="#f8fafc" fontSize="12" fontWeight="700">SMARD Verbrauchs-CSV</text>
                                            <text x="27" y="156" fill="#94a3b8" fontSize="11">Ziel-Last: {params.demandTwh} TWh/a (15 Min.)</text>

                                            <rect x="15" y="195" width="190" height="55" rx="8" fill="#1e293b" stroke="#eab308" />
                                            <text x="27" y="218" fill="#f8fafc" fontSize="12" fontWeight="700">Agora 2024 & EEG-Ziele</text>
                                            <text x="27" y="236" fill="#94a3b8" fontSize="11">Szenariojahr {params.year} · Sektor {params.sectorCouplingSharePct} %</text>

                                            {/* Spalte 2: 15-Min.-Dispatch-Engine */}
                                            <rect x="280" y="75" width="215" height="140" rx="10" fill="#0f172a" stroke="#8b5cf6" strokeWidth="2" />
                                            <text x="296" y="102" fill="#e2e8f0" fontSize="13" fontWeight="700">15-Min.-DecisionEngine</text>
                                            <text x="296" y="124" fill="#cbd5e1" fontSize="11">1. Tages-DSM ({params.dsmSharePct} % flexibel)</text>
                                            <text x="296" y="146" fill="#cbd5e1" fontSize="11">2. Batterie ({params.batteryPowerGw} GW / {params.batteryCapGwh} GWh)</text>
                                            <text x="296" y="168" fill="#cbd5e1" fontSize="11">3. Elektrolyse ({params.electrolyzerGw} GW → {fmt1.format(sim.h2ProducedTwh)} TWh H₂)</text>
                                            <text x="296" y="192" fill="#38bdf8" fontSize="11" fontWeight="600">Δt = 0,25 h · {aligned?.count.toLocaleString("de-DE")} Schritte</text>

                                            {/* Spalte 3: Zielgrößen */}
                                            <rect x="560" y="45" width="185" height="62" rx="8" fill="#064e3b" stroke="#10b981" />
                                            <text x="572" y="68" fill="#ecfdf5" fontSize="12" fontWeight="700">Nutzbarer EE-Anteil</text>
                                            <text x="572" y="92" fill="#34d399" fontSize="16" fontWeight="800">{fmt1.format(sim.usableEeSharePct)} % am Verbrauch</text>

                                            <rect x="560" y="130" width="185" height="58" rx="8" fill="#1e293b" stroke="#facc15" />
                                            <text x="572" y="153" fill="#f8fafc" fontSize="12" fontWeight="700">Abregelung (Überschuss)</text>
                                            <text x="572" y="174" fill="#facc15" fontSize="13" fontWeight="700">{fmt1.format(sim.curtailedTwh)} TWh ({fmt1.format(sim.curtailedPct)} %)</text>

                                            <rect x="560" y="208" width="185" height="62" rx="8" fill="#1e293b" stroke="#f97316" />
                                            <text x="572" y="230" fill="#f8fafc" fontSize="12" fontWeight="700">Dunkelflauten-Backup</text>
                                            <text x="572" y="252" fill="#fb923c" fontSize="13" fontWeight="700">{fmt1.format(sim.peakBackupGw)} GW · {fmt1.format(sim.fossilBackupTwh)} TWh</text>
                                        </svg>
                                    </div>
                                )}

                                {/* Wissenschaftliche Parameter-Begründung (Aufgabe 1 & 2) */}
                                <div
                                    style={{
                                        background: "#1e293b",
                                        borderLeft: "4px solid #eab308",
                                        borderRadius: 10,
                                        padding: "12px 14px",
                                        fontSize: 12.5,
                                        lineHeight: 1.5,
                                        color: "#e2e8f0",
                                    }}
                                >
                                    <div style={{ fontWeight: 700, color: "#facc15", marginBottom: 4 }}>
                                        Wissenschaftliche Begründung ({params.name} · Zieljahr {params.year}):
                                    </div>
                                    {activePresetId === "custom"
                                        ? "Benutzerdefinierte Parameter-Sensitivität auf Basis des gewählten Stützjahres zur Untersuchung von Verbrauch, EE-Ausbau und Flexibilisierung."
                                        : params.justification}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function SliderRow({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onChange: (v: number) => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: "#cbd5e1",
                }}
            >
                <span>{label}</span>
                <strong>
                    {value.toLocaleString("de-DE")} {unit}
                </strong>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#38bdf8", cursor: "pointer" }}
            />
        </div>
    );
}

const BTN_STYLE: CSSProperties = {
    padding: "6px 11px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 7,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f8fafc",
    cursor: "pointer",
};

const BTN_ACCENT_STYLE: CSSProperties = {
    ...BTN_STYLE,
    background: "#eab308",
    borderColor: "#facc15",
    color: "#0f172a",
    fontWeight: 700,
};

const TAB_ACTIVE: CSSProperties = {
    ...BTN_STYLE,
    background: "#0284c7",
    borderColor: "#38bdf8",
    fontWeight: 700,
};

const KPI_CARD: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    background: "#1e293b",
    border: "1px solid #334155",
};

const KPI_LABEL: CSSProperties = { fontSize: 11, color: "#94a3b8" };
const KPI_VAL: CSSProperties = {
    fontSize: 21,
    fontWeight: 800,
    margin: "2px 0",
};
const KPI_SUB: CSSProperties = { fontSize: 11, color: "#cbd5e1" };

const BADGE_BLUE: CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(56, 189, 248, 0.15)",
    color: "#7dd3fc",
};
const BADGE_GREEN: CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(16, 185, 129, 0.15)",
    color: "#6ee7b7",
};
const BADGE_WARN: CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(234, 179, 8, 0.18)",
    color: "#fde047",
};
