import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
} from "react";
import * as d3 from "d3";

type NetzlastModuleProps = {
    netzlastCsvUrl?: string;
};

type PresetKey = "2025" | "min" | "mittel" | "max" | "custom";

type UnitMode = "powerGw" | "energyMwh";

type ViewTab = "timeseries" | "comparison";

type CsvMetadata = {
    baseYearTwh: number;
    minTwh: number;
    mittelTwh: number;
    maxTwh: number;
    sfMin: number;
    sfMittel: number;
    sfMax: number;
};

type ParsedNetzlastData = {
    count: number;
    starts: Float64Array;
    ends: Float64Array;
    load2025Mwh: Float64Array;
    csvMin2030Mwh: Float64Array | null;
    csvMittel2030Mwh: Float64Array | null;
    csvMax2030Mwh: Float64Array | null;
    sumLoaded2025Twh: number;
    peakIdx: number;
    meta: CsvMetadata;
};

type ScenarioSetting = {
    preset: PresetKey;
    targetTwh: number;
};

type EvaluatedScenario = {
    label: string;
    targetTwh: number;
    sf: number;
    seriesMwh: Float64Array;
    sumLoadedTwh: number;
    peakMwh: number;
    peakGw: number;
    minMwh: number;
    minGw: number;
    deltaVs2025Twh: number;
    deltaVs2025Pct: number;
};

type TooltipRow = {
    label: string;
    value: string;
    color?: string;
};

type TooltipData = {
    x: number;
    y: number;
    wrapWidth: number;
    title: string;
    subtitle?: string;
    rows: TooltipRow[];
};

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const CHART_MARGIN = { left: 76, right: 28, top: 34, bottom: 50 };

const EXPECTED_YEAR_INTERVALS = 35_040;

const parseDeDateTime = d3.utcParse("%d.%m.%Y %H:%M");
const parseDeDateTimeSec = d3.utcParse("%d.%m.%Y %H:%M:%S");
const parseIsoDateTime = d3.utcParse("%Y-%m-%d %H:%M");
const formatDate = d3.utcFormat("%d.%m.%Y %H:%M");
const formatShortDate = d3.utcFormat("%d.%m. %H:%M");

const fmt1 = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
const fmt2 = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const fmt4 = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
});

function parseTimestamp(raw: string | undefined): Date | null {
    const t = raw?.trim();
    if (!t) return null;
    return (
        parseDeDateTime(t) ??
        parseDeDateTimeSec(t) ??
        parseIsoDateTime(t) ??
        (Number.isFinite(Date.parse(t)) ? new Date(t) : null)
    );
}

function parseDeFloat(raw: string | undefined): number | null {
    const t = raw?.trim();
    if (!t || t === "-" || t === "–" || t === "—") return null;
    const normalized = t.includes(",")
        ? t.replace(/\./g, "").replace(",", ".")
        : t;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function findColumn(
    columns: string[],
    candidates: string[]
): string | undefined {
    const norm = (s: string) =>
        s.trim().toLowerCase().replace(/\s+/g, " ");
    const exactMap = new Map(columns.map((c) => [norm(c), c]));

    for (const cand of candidates) {
        const hit = exactMap.get(norm(cand));
        if (hit !== undefined) return hit;
    }

    for (const cand of candidates) {
        const nc = norm(cand);
        const found = columns.find((c) => norm(c).startsWith(nc));
        if (found !== undefined) return found;
    }
    return undefined;
}

function parseNetzlastCsv(text: string): ParsedNetzlastData {
    const rows = d3.dsvFormat(";").parse(text.replace(/^\uFEFF/, ""));
    const cols = rows.columns;

    const tsCol = findColumn(cols, ["Datum von", "Zeitstempel"]);
    const baseCol = findColumn(cols, [
        "Netzlast [MWh]",
        "Netzlast_2025 [MWh]",
        "Netzlast_2025",
    ]);
    const min2030Col = findColumn(cols, [
        "Netzlast_2030_Min[MWh]",
        "Netzlast_2030_Min [MWh]",
        "Netzlast_2030_Min",
    ]);
    const mittel2030Col = findColumn(cols, [
        "Netzlast_2030_Mittelwert [MWh]",
        "Netzlast_2030_Mittelwert[MWh]",
        "Netzlast_2030_Mittel [MWh]",
        "Netzlast_2030_Mittel",
    ]);
    const max2030Col = findColumn(cols, [
        "Netzlast_2030_Max[MWh]",
        "Netzlast_2030_Max [MWh]",
        "Netzlast_2030_Max",
    ]);

    const metaBaseTwhCol = findColumn(cols, [
        "GesamtJahresverbrauch 2025 Smard_Daten[TWh]",
        "Netzlast_2025_TWh",
    ]);
    const metaMinTwhCol = findColumn(cols, [
        "Min_Nettoverbrauch[TWh]",
        "Min_Nettoverbrauch [TWh]",
    ]);
    const metaMittelTwhCol = findColumn(cols, [
        "Mittelwert_Nettoverbrauch",
        "Mittelwert_Nettoverbrauch [TWh]",
    ]);
    const metaMaxTwhCol = findColumn(cols, [
        "Max_ Nettoverbrauch [TWh]",
        "Max_Nettoverbrauch [TWh]",
        "Max_Nettoverbrauch[TWh]",
    ]);
    const metaSfMinCol = findColumn(cols, ["Skalierungsfaktor_min"]);
    const metaSfMittelCol = findColumn(cols, ["Skalierungsfaktor_Mittelwert"]);
    const metaSfMaxCol = findColumn(cols, ["Skalierungsfaktor_max"]);

    if (!tsCol || !baseCol) {
        throw new Error(
            "Pflichtspalten nicht gefunden (erwartet: 'Datum von' bzw. 'Zeitstempel' sowie 'Netzlast [MWh]' bzw. 'Netzlast_2025')."
        );
    }

    type RawEntry = {
        startMs: number;
        baseMwh: number;
        minMwh: number | null;
        mittelMwh: number | null;
        maxMwh: number | null;
    };

    const entries: RawEntry[] = [];
    let rawBaseYearTwh: number | null = null;
    let rawMinTwh: number | null = null;
    let rawMittelTwh: number | null = null;
    let rawMaxTwh: number | null = null;
    let rawSfMin: number | null = null;
    let rawSfMittel: number | null = null;
    let rawSfMax: number | null = null;

    for (const r of rows) {
        if (rawBaseYearTwh === null && metaBaseTwhCol) {
            rawBaseYearTwh = parseDeFloat(r[metaBaseTwhCol]);
        }
        if (rawMinTwh === null && metaMinTwhCol) {
            rawMinTwh = parseDeFloat(r[metaMinTwhCol]);
        }
        if (rawMittelTwh === null && metaMittelTwhCol) {
            rawMittelTwh = parseDeFloat(r[metaMittelTwhCol]);
        }
        if (rawMaxTwh === null && metaMaxTwhCol) {
            rawMaxTwh = parseDeFloat(r[metaMaxTwhCol]);
        }
        if (rawSfMin === null && metaSfMinCol) {
            rawSfMin = parseDeFloat(r[metaSfMinCol]);
        }
        if (rawSfMittel === null && metaSfMittelCol) {
            rawSfMittel = parseDeFloat(r[metaSfMittelCol]);
        }
        if (rawSfMax === null && metaSfMaxCol) {
            rawSfMax = parseDeFloat(r[metaSfMaxCol]);
        }

        const dt = parseTimestamp(r[tsCol]);
        const baseMwh = parseDeFloat(r[baseCol]);
        if (!dt || baseMwh === null) continue;

        entries.push({
            startMs: dt.getTime(),
            baseMwh,
            minMwh: min2030Col ? parseDeFloat(r[min2030Col]) : null,
            mittelMwh: mittel2030Col ? parseDeFloat(r[mittel2030Col]) : null,
            maxMwh: max2030Col ? parseDeFloat(r[max2030Col]) : null,
        });
    }

    if (entries.length === 0) {
        throw new Error(
            "Keine gültigen 15-Minuten-Zeilen in 01_Netzlast.csv erkannt."
        );
    }

    entries.sort((a, b) => a.startMs - b.startMs);

    const n = entries.length;
    const quarterMs = 15 * 60 * 1000;
    const starts = new Float64Array(n);
    const ends = new Float64Array(n);
    const load2025Mwh = new Float64Array(n);

    const hasAllMin = entries.every((e) => e.minMwh !== null);
    const hasAllMittel = entries.every((e) => e.mittelMwh !== null);
    const hasAllMax = entries.every((e) => e.maxMwh !== null);

    const csvMin2030Mwh = hasAllMin ? new Float64Array(n) : null;
    const csvMittel2030Mwh = hasAllMittel ? new Float64Array(n) : null;
    const csvMax2030Mwh = hasAllMax ? new Float64Array(n) : null;

    let sumBaseMwh = 0;
    let sumMinMwh = 0;
    let sumMittelMwh = 0;
    let sumMaxMwh = 0;
    let peakIdx = 0;
    let peakVal = -Infinity;

    for (let i = 0; i < n; i += 1) {
        const item = entries[i];
        starts[i] = item.startMs;
        ends[i] = item.startMs + quarterMs;
        load2025Mwh[i] = item.baseMwh;
        sumBaseMwh += item.baseMwh;

        if (item.baseMwh > peakVal) {
            peakVal = item.baseMwh;
            peakIdx = i;
        }
        if (csvMin2030Mwh && item.minMwh !== null) {
            csvMin2030Mwh[i] = item.minMwh;
            sumMinMwh += item.minMwh;
        }
        if (csvMittel2030Mwh && item.mittelMwh !== null) {
            csvMittel2030Mwh[i] = item.mittelMwh;
            sumMittelMwh += item.mittelMwh;
        }
        if (csvMax2030Mwh && item.maxMwh !== null) {
            csvMax2030Mwh[i] = item.maxMwh;
            sumMaxMwh += item.maxMwh;
        }
    }

    const sumLoaded2025Twh = sumBaseMwh / 1_000_000;

    // Exakte Referenz E_2025 für SF = E_2030 / E_2025 bestimmen:
    // Bei vollständigem Jahr aus der 15-Minuten-Summe, bei Teil-Auszug aus den CSV-Kennwerten.
    const impliedBaseFromSf =
        rawMittelTwh !== null && rawSfMittel !== null && rawSfMittel > 0
            ? rawMittelTwh / rawSfMittel
            : null;

    const baseYearTwh =
        n >= 34_000
            ? sumLoaded2025Twh
            : impliedBaseFromSf ?? rawBaseYearTwh ?? sumLoaded2025Twh;

    const safeBase = Math.max(1e-9, baseYearTwh);

    const minTwh =
        rawMinTwh ??
        (csvMin2030Mwh && n >= 34_000 ? sumMinMwh / 1_000_000 : 516);
    const mittelTwh =
        rawMittelTwh ??
        (csvMittel2030Mwh && n >= 34_000 ? sumMittelMwh / 1_000_000 : 609);
    const maxTwh =
        rawMaxTwh ??
        (csvMax2030Mwh && n >= 34_000 ? sumMaxMwh / 1_000_000 : 722);

    const sfMin = rawSfMin ?? minTwh / safeBase;
    const sfMittel = rawSfMittel ?? mittelTwh / safeBase;
    const sfMax = rawSfMax ?? maxTwh / safeBase;

    return {
        count: n,
        starts,
        ends,
        load2025Mwh,
        csvMin2030Mwh,
        csvMittel2030Mwh,
        csvMax2030Mwh,
        sumLoaded2025Twh,
        peakIdx,
        meta: {
            baseYearTwh,
            minTwh,
            mittelTwh,
            maxTwh,
            sfMin,
            sfMittel,
            sfMax,
        },
    };
}

function evaluateScenario(
    data: ParsedNetzlastData,
    setting: ScenarioSetting,
    labelPrefix: string
): EvaluatedScenario {
    const { count, load2025Mwh, meta } = data;
    const safeBase = Math.max(1e-9, meta.baseYearTwh);

    let sf: number;
    let sourceArr: Float64Array | null = null;
    let presetName: string;

    if (setting.preset === "2025") {
        sf = 1;
        sourceArr = load2025Mwh;
        presetName = "Basis 2025";
    } else if (setting.preset === "min") {
        sf = meta.sfMin;
        sourceArr = data.csvMin2030Mwh;
        presetName = "2030 Minimum";
    } else if (setting.preset === "mittel") {
        sf = meta.sfMittel;
        sourceArr = data.csvMittel2030Mwh;
        presetName = "2030 Mittelwert";
    } else if (setting.preset === "max") {
        sf = meta.sfMax;
        sourceArr = data.csvMax2030Mwh;
        presetName = "2030 Maximum";
    } else {
        // Formel: SF = E_2030 / E_2025
        sf = setting.targetTwh / safeBase;
        presetName = "Eigener Wert";
    }

    const seriesMwh = new Float64Array(count);
    let sumMwh = 0;
    let peakMwh = -Infinity;
    let minMwh = Infinity;

    for (let i = 0; i < count; i += 1) {
        // Formel: P_2030(t) = P_2025(t) * SF  bzw.  E_2030,i = E_2025,i * SF
        const val = sourceArr ? sourceArr[i] : load2025Mwh[i] * sf;
        seriesMwh[i] = val;
        sumMwh += val;
        if (val > peakMwh) peakMwh = val;
        if (val < minMwh) minMwh = val;
    }

    const deltaVs2025Twh = setting.targetTwh - meta.baseYearTwh;
    const deltaVs2025Pct = (deltaVs2025Twh / safeBase) * 100;

    return {
        label: `${labelPrefix}: ${presetName}`,
        targetTwh: setting.targetTwh,
        sf,
        seriesMwh,
        sumLoadedTwh: sumMwh / 1_000_000,
        peakMwh,
        peakGw: (peakMwh * 4) / 1000,
        minMwh,
        minGw: (minMwh * 4) / 1000,
        deltaVs2025Twh,
        deltaVs2025Pct,
    };
}

/**
 * Zeichnet eine Zeitreihe verlustfrei (bei hohen Punktzahlen per Pixel-Min/Max-Einhüllende,
 * sodass 15-Minuten-Spitzen auch in der Jahresansicht exakt erhalten bleiben).
 */
function strokeTimeSeries(
    ctx: CanvasRenderingContext2D,
    values: Float64Array,
    unitFactor: number,
    start: number,
    winLen: number,
    pw: number,
    xPos: (idx: number) => number,
    yPos: (val: number) => number
) {
    const end = start + winLen;
    ctx.beginPath();

    if (winLen <= pw * 2) {
        for (let i = start; i < end; i += 1) {
            const px = xPos(i);
            const py = yPos(values[i] * unitFactor);
            if (i === start) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
    } else {
        const cols = Math.max(1, Math.floor(pw));
        for (let c = 0; c < cols; c += 1) {
            const i0 = start + Math.floor((c / cols) * winLen);
            const i1 = Math.min(
                end,
                Math.max(i0 + 1, start + Math.floor(((c + 1) / cols) * winLen))
            );
            let vMin = Infinity;
            let vMax = -Infinity;
            for (let i = i0; i < i1; i += 1) {
                const v = values[i] * unitFactor;
                if (v < vMin) vMin = v;
                if (v > vMax) vMax = v;
            }
            const px = xPos(i0);
            const pyMin = yPos(vMin);
            const pyMax = yPos(vMax);
            if (c === 0) ctx.moveTo(px, pyMax);
            else ctx.lineTo(px, pyMax);
            if (Math.abs(pyMin - pyMax) > 0.5) {
                ctx.lineTo(px, pyMin);
            }
        }
    }

    ctx.stroke();
}

export default function NetzlastModule({
    netzlastCsvUrl = `${import.meta.env.BASE_URL}01_Netzlast.csv`,
}: NetzlastModuleProps) {
    const [data, setData] = useState<ParsedNetzlastData | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    // Einstellung A (Hauptszenario) & Einstellung B (Vergleichsszenario)
    const [settingA, setSettingA] = useState<ScenarioSetting>({
        preset: "mittel",
        targetTwh: 609,
    });
    const [settingB, setSettingB] = useState<ScenarioSetting>({
        preset: "max",
        targetTwh: 722,
    });

    const [unitMode, setUnitMode] = useState<UnitMode>("powerGw");
    const [activeTab, setActiveTab] = useState<ViewTab>("timeseries");
    const [windowQuarters, setWindowQuarters] = useState<number>(672); // 7 Tage = 672 Viertelstunden
    const [tsWindowStart, setTsWindowStart] = useState<number>(0);

    const [hoverPoint, setHoverPoint] = useState<{
        x: number;
        y: number;
        wrapWidth: number;
        wrapHeight: number;
    } | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartWrapRef = useRef<HTMLDivElement>(null);

    const applyLoadedData = (parsed: ParsedNetzlastData) => {
        setData(parsed);
        setSettingA({
            preset: "mittel",
            targetTwh: parsed.meta.mittelTwh,
        });
        setSettingB({
            preset: "max",
            targetTwh: parsed.meta.maxTwh,
        });
        const initialWin = Math.min(parsed.count, 672);
        const centeredStart = Math.max(
            0,
            Math.min(
                parsed.count - initialWin,
                parsed.peakIdx - Math.floor(initialWin / 2)
            )
        );
        setTsWindowStart(centeredStart);
        setStatusMsg(null);
    };

    useEffect(() => {
        const ctrl = new AbortController();

        async function loadInitialCsv() {
            setLoading(true);
            setStatusMsg(null);
            try {
                const res = await fetch(netzlastCsvUrl, {
                    signal: ctrl.signal,
                    cache: "no-store",
                });
                if (!res.ok) {
                    throw new Error(
                        `01_Netzlast.csv (${netzlastCsvUrl}) nicht gefunden – bitte oben per Datei-Auswahl laden.`
                    );
                }
                const text = await res.text();
                if (ctrl.signal.aborted) return;
                applyLoadedData(parseNetzlastCsv(text));
            } catch (err) {
                if (!ctrl.signal.aborted) {
                    setStatusMsg(
                        err instanceof Error
                            ? err.message
                            : "Fehler beim Laden von 01_Netzlast.csv."
                    );
                }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        }

        void loadInitialCsv();
        return () => ctrl.abort();
    }, [netzlastCsvUrl]);

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = parseNetzlastCsv(String(reader.result ?? ""));
                applyLoadedData(parsed);
            } catch (err) {
                setStatusMsg(
                    err instanceof Error ? err.message : "CSV-Formatfehler"
                );
            }
        };
        reader.readAsText(file, "utf-8");
    };

    const selectPreset = (which: "A" | "B", preset: Exclude<PresetKey, "custom">) => {
        if (!data) return;
        const targetTwh =
            preset === "2025"
                ? data.meta.baseYearTwh
                : preset === "min"
                ? data.meta.minTwh
                : preset === "mittel"
                ? data.meta.mittelTwh
                : data.meta.maxTwh;

        const next: ScenarioSetting = { preset, targetTwh };
        if (which === "A") setSettingA(next);
        else setSettingB(next);
    };

    const updateTargetTwh = (which: "A" | "B", val: number) => {
        if (!Number.isFinite(val)) return;
        const clamped = Math.max(100, Math.min(1500, val));
        const next: ScenarioSetting = { preset: "custom", targetTwh: clamped };
        if (which === "A") setSettingA(next);
        else setSettingB(next);
    };

    const evalBase2025 = useMemo(
        () =>
            data
                ? evaluateScenario(
                      data,
                      { preset: "2025", targetTwh: data.meta.baseYearTwh },
                      "Referenz"
                  )
                : null,
        [data]
    );

    const evalA = useMemo(
        () => (data ? evaluateScenario(data, settingA, "Einstellung A") : null),
        [data, settingA]
    );

    const evalB = useMemo(
        () => (data ? evaluateScenario(data, settingB, "Einstellung B") : null),
        [data, settingB]
    );

    const comparisonBars = useMemo(() => {
        if (!data || !evalBase2025 || !evalA || !evalB) return [];
        return [
            {
                shortLabel: "Basis 2025",
                color: "#94a3b8",
                ev: evalBase2025,
            },
            {
                shortLabel: "2030 Min",
                color: "#34d399",
                ev: evaluateScenario(
                    data,
                    { preset: "min", targetTwh: data.meta.minTwh },
                    "Studienwert"
                ),
            },
            {
                shortLabel: "2030 Mittel",
                color: "#60a5fa",
                ev: evaluateScenario(
                    data,
                    { preset: "mittel", targetTwh: data.meta.mittelTwh },
                    "Studienwert"
                ),
            },
            {
                shortLabel: "2030 Max",
                color: "#c084fc",
                ev: evaluateScenario(
                    data,
                    { preset: "max", targetTwh: data.meta.maxTwh },
                    "Studienwert"
                ),
            },
            {
                shortLabel: "Einstellung A",
                color: "#38bdf8",
                ev: evalA,
            },
            {
                shortLabel: "Einstellung B",
                color: "#fb923c",
                ev: evalB,
            },
        ];
    }, [data, evalBase2025, evalA, evalB]);

    useEffect(() => {
        setHoverPoint(null);
    }, [activeTab, unitMode]);

    const handleChartMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
        const wrap = chartWrapRef.current;
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        setHoverPoint({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            wrapWidth: rect.width,
            wrapHeight: rect.height,
        });
    };

    const handleChartMouseLeave = () => {
        setHoverPoint(null);
    };

    const effectiveWinLen = data
        ? Math.min(data.count, windowQuarters)
        : 0;
    const clampedStart = data
        ? Math.max(0, Math.min(tsWindowStart, data.count - effectiveWinLen))
        : 0;

    // Faktor zur Umrechnung von MWh pro 15 Min. in die gewählte Diagramm-Einheit:
    // Leistung [GW] = MWh * 4 / 1000 ; Energie [MWh / 15 Min.] = MWh * 1
    const unitFactor = unitMode === "powerGw" ? 4 / 1000 : 1;
    const unitShort = unitMode === "powerGw" ? "GW" : "MWh / 15 Min.";

    const tooltipData = useMemo<TooltipData | null>(() => {
        if (!hoverPoint || !data || !evalBase2025 || !evalA || !evalB) {
            return null;
        }

        const { left: mL, right: mR, top: mT, bottom: mB } = CHART_MARGIN;
        const pw = Math.max(10, hoverPoint.wrapWidth - mL - mR);
        const ph = Math.max(10, hoverPoint.wrapHeight - mT - mB);

        if (
            hoverPoint.x < mL ||
            hoverPoint.x > mL + pw ||
            hoverPoint.y < mT ||
            hoverPoint.y > mT + ph
        ) {
            return null;
        }

        const relX = (hoverPoint.x - mL) / pw;

        if (activeTab === "timeseries" && effectiveWinLen > 0) {
            const idx = Math.max(
                clampedStart,
                Math.min(
                    clampedStart + effectiveWinLen - 1,
                    clampedStart +
                        Math.round(relX * Math.max(1, effectiveWinLen - 1))
                )
            );

            const mwh25 = evalBase2025.seriesMwh[idx];
            const mwhA = evalA.seriesMwh[idx];
            const mwhB = evalB.seriesMwh[idx];
            const diffMwh = mwhA - mwhB;

            const gw25 = (mwh25 * 4) / 1000;
            const gwA = (mwhA * 4) / 1000;
            const gwB = (mwhB * 4) / 1000;
            const diffGw = gwA - gwB;

            return {
                x: hoverPoint.x,
                y: hoverPoint.y,
                wrapWidth: hoverPoint.wrapWidth,
                title: `${formatDate(new Date(data.starts[idx]))} – ${formatDate(
                    new Date(data.ends[idx])
                ).slice(11)} Uhr`,
                subtitle: `15-Min.-Intervall #${(idx + 1).toLocaleString(
                    "de-DE"
                )} · Leistung P = 4 · E`,
                rows: [
                    {
                        label: "Basis 2025",
                        value: `${fmt2.format(gw25)} GW (${fmt1.format(mwh25)} MWh)`,
                        color: "#cbd5e1",
                    },
                    {
                        label: `Einstellung A (SF ${fmt4.format(evalA.sf)})`,
                        value: `${fmt2.format(gwA)} GW (${fmt1.format(mwhA)} MWh)`,
                        color: "#38bdf8",
                    },
                    {
                        label: `Einstellung B (SF ${fmt4.format(evalB.sf)})`,
                        value: `${fmt2.format(gwB)} GW (${fmt1.format(mwhB)} MWh)`,
                        color: "#fb923c",
                    },
                    {
                        label: "Differenz (A − B)",
                        value: `${diffGw >= 0 ? "+" : ""}${fmt2.format(
                            diffGw
                        )} GW (${diffMwh >= 0 ? "+" : ""}${fmt1.format(
                            diffMwh
                        )} MWh)`,
                        color: diffGw >= 0 ? "#34d399" : "#facc15",
                    },
                ],
            };
        }

        if (activeTab === "comparison" && comparisonBars.length > 0) {
            const idx = Math.max(
                0,
                Math.min(
                    comparisonBars.length - 1,
                    Math.floor(relX * comparisonBars.length)
                )
            );
            const item = comparisonBars[idx];
            const ev = item.ev;
            return {
                x: hoverPoint.x,
                y: hoverPoint.y,
                wrapWidth: hoverPoint.wrapWidth,
                title: ev.label,
                subtitle: `Skalierungsfaktor SF = ${fmt4.format(ev.sf)}`,
                rows: [
                    {
                        label: "Nettostromverbrauch (Jahr)",
                        value: `${fmt2.format(ev.targetTwh)} TWh`,
                        color: item.color,
                    },
                    {
                        label: "Veränderung ggü. 2025",
                        value: `${ev.deltaVs2025Twh >= 0 ? "+" : ""}${fmt2.format(
                            ev.deltaVs2025Twh
                        )} TWh (${
                            ev.deltaVs2025Pct >= 0 ? "+" : ""
                        }${fmt1.format(ev.deltaVs2025Pct)} %)`,
                        color: "#f8fafc",
                    },
                    {
                        label: "Spitzenlast (Leistung)",
                        value: `${fmt2.format(ev.peakGw)} GW`,
                        color: "#38bdf8",
                    },
                    {
                        label: "Spitzenwert (15-Min.-Energie)",
                        value: `${fmt1.format(ev.peakMwh)} MWh / 15 Min.`,
                        color: "#cbd5e1",
                    },
                ],
            };
        }

        return null;
    }, [
        hoverPoint,
        data,
        evalBase2025,
        evalA,
        evalB,
        activeTab,
        effectiveWinLen,
        clampedStart,
        comparisonBars,
    ]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = chartWrapRef.current;
        if (!canvas || !wrap || !data || !evalBase2025 || !evalA || !evalB) {
            return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const draw = () => {
            const rect = wrap.getBoundingClientRect();
            const w = Math.max(300, rect.width);
            const h = Math.max(320, rect.height);
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

            const { left: mL, right: mR, top: mT, bottom: mB } = CHART_MARGIN;
            const pw = Math.max(10, w - mL - mR);
            const ph = Math.max(10, h - mT - mB);

            const isHoverInPlot =
                hoverPoint !== null &&
                hoverPoint.x >= mL &&
                hoverPoint.x <= mL + pw &&
                hoverPoint.y >= mT &&
                hoverPoint.y <= mT + ph;

            if (activeTab === "timeseries" && effectiveWinLen > 0) {
                const start = clampedStart;
                const end = start + effectiveWinLen;

                let maxVal = 1;
                for (let i = start; i < end; i += 1) {
                    maxVal = Math.max(
                        maxVal,
                        evalBase2025.seriesMwh[i] * unitFactor,
                        evalA.seriesMwh[i] * unitFactor,
                        evalB.seriesMwh[i] * unitFactor
                    );
                }
                maxVal *= 1.1;

                const xPos = (i: number) =>
                    effectiveWinLen <= 1
                        ? mL + pw / 2
                        : mL + ((i - start) / (effectiveWinLen - 1)) * pw;
                const yPos = (val: number) =>
                    mT + ((maxVal - val) / maxVal) * ph;

                // Gitterlinien & Y-Achse
                const yScale = d3.scaleLinear().domain([0, maxVal]).nice();
                ctx.strokeStyle = "#1e293b";
                ctx.lineWidth = 1;
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
                    ctx.fillText(
                        `${tk.toLocaleString("de-DE")} ${
                            unitMode === "powerGw" ? "GW" : "MWh"
                        }`,
                        mL - 8,
                        py
                    );
                }

                // 1. Basis 2025 (gestrichelt, grau)
                ctx.save();
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = "#94a3b8";
                ctx.lineWidth = 1.6;
                strokeTimeSeries(
                    ctx,
                    evalBase2025.seriesMwh,
                    unitFactor,
                    start,
                    effectiveWinLen,
                    pw,
                    xPos,
                    yPos
                );
                ctx.restore();

                // 2. Einstellung B (orange)
                ctx.strokeStyle = "#fb923c";
                ctx.lineWidth = 2;
                strokeTimeSeries(
                    ctx,
                    evalB.seriesMwh,
                    unitFactor,
                    start,
                    effectiveWinLen,
                    pw,
                    xPos,
                    yPos
                );

                // 3. Einstellung A (hellblau, Hauptkurve)
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 2.3;
                strokeTimeSeries(
                    ctx,
                    evalA.seriesMwh,
                    unitFactor,
                    start,
                    effectiveWinLen,
                    pw,
                    xPos,
                    yPos
                );

                // Hover-Fadenkreuz & Datenpunkte
                if (isHoverInPlot && hoverPoint) {
                    const relX = (hoverPoint.x - mL) / pw;
                    const hIdx = Math.max(
                        start,
                        Math.min(
                            end - 1,
                            start +
                                Math.round(
                                    relX * Math.max(1, effectiveWinLen - 1)
                                )
                        )
                    );
                    const hx = xPos(hIdx);

                    ctx.save();
                    ctx.setLineDash([4, 3]);
                    ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(hx, mT);
                    ctx.lineTo(hx, mT + ph);
                    ctx.stroke();
                    ctx.restore();

                    const drawDot = (py: number, fill: string) => {
                        ctx.beginPath();
                        ctx.arc(hx, py, 4.8, 0, Math.PI * 2);
                        ctx.fillStyle = fill;
                        ctx.fill();
                        ctx.strokeStyle = "#020617";
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    };

                    drawDot(
                        yPos(evalBase2025.seriesMwh[hIdx] * unitFactor),
                        "#cbd5e1"
                    );
                    drawDot(
                        yPos(evalB.seriesMwh[hIdx] * unitFactor),
                        "#fb923c"
                    );
                    drawDot(
                        yPos(evalA.seriesMwh[hIdx] * unitFactor),
                        "#38bdf8"
                    );
                }

                // Zeitstempel-Ticks
                const tickCount = Math.min(7, effectiveWinLen);
                const tickStep = Math.max(
                    1,
                    Math.floor(effectiveWinLen / Math.max(1, tickCount))
                );
                ctx.fillStyle = "#94a3b8";
                ctx.font = `11px ${FONT}`;
                ctx.textAlign = "center";
                for (let i = start; i < end; i += tickStep) {
                    ctx.fillText(
                        formatShortDate(new Date(data.starts[i])),
                        xPos(i),
                        mT + ph + 24
                    );
                }

                // Legende
                ctx.font = `11.5px ${FONT}`;
                ctx.textAlign = "left";
                ctx.fillStyle = "#94a3b8";
                ctx.fillText(
                    `- - Basis 2025 (${fmt1.format(data.meta.baseYearTwh)} TWh)`,
                    mL + 8,
                    mT + 14
                );
                ctx.fillStyle = "#38bdf8";
                ctx.fillText(
                    `— Einstellung A (${fmt1.format(evalA.targetTwh)} TWh · SF ${fmt2.format(evalA.sf)})`,
                    mL + 205,
                    mT + 14
                );
                ctx.fillStyle = "#fb923c";
                ctx.fillText(
                    `— Einstellung B (${fmt1.format(evalB.targetTwh)} TWh · SF ${fmt2.format(evalB.sf)})`,
                    mL + 470,
                    mT + 14
                );
            } else if (
                activeTab === "comparison" &&
                comparisonBars.length > 0
            ) {
                const items = comparisonBars;
                const maxTwh =
                    Math.max(...items.map((it) => it.ev.targetTwh), 100) * 1.15;
                const barSlot = pw / items.length;
                const barW = Math.min(72, barSlot * 0.58);
                const yPos = (twh: number) =>
                    mT + ((maxTwh - twh) / maxTwh) * ph;

                const hoveredIdx =
                    isHoverInPlot && hoverPoint
                        ? Math.max(
                              0,
                              Math.min(
                                  items.length - 1,
                                  Math.floor(
                                      ((hoverPoint.x - mL) / pw) * items.length
                                  )
                              )
                          )
                        : -1;

                const yScale = d3.scaleLinear().domain([0, maxTwh]).nice();
                for (const tk of yScale.ticks(6)) {
                    const py = yPos(tk);
                    if (py < mT || py > mT + ph) continue;
                    ctx.strokeStyle = "#1e293b";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(mL, py);
                    ctx.lineTo(mL + pw, py);
                    ctx.stroke();

                    ctx.fillStyle = "#94a3b8";
                    ctx.font = `11px ${FONT}`;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "middle";
                    ctx.fillText(`${tk} TWh`, mL - 8, py);
                }

                items.forEach((it, idx) => {
                    const val = it.ev.targetTwh;
                    const cx = mL + (idx + 0.5) * barSlot;
                    const topY = yPos(val);
                    const baseY = yPos(0);
                    const isHovered = idx === hoveredIdx;

                    if (isHovered) {
                        ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
                        ctx.fillRect(
                            mL + idx * barSlot + 4,
                            mT,
                            barSlot - 8,
                            ph
                        );
                    }

                    ctx.fillStyle = it.color;
                    ctx.fillRect(cx - barW / 2, topY, barW, baseY - topY);

                    if (isHovered) {
                        ctx.strokeStyle = "#f8fafc";
                        ctx.lineWidth = 2;
                        ctx.strokeRect(
                            cx - barW / 2,
                            topY,
                            barW,
                            baseY - topY
                        );
                    }

                    ctx.fillStyle = "#f8fafc";
                    ctx.font = `700 12px ${FONT}`;
                    ctx.textAlign = "center";
                    ctx.fillText(`${fmt1.format(val)} TWh`, cx, topY - 10);

                    ctx.fillStyle = isHovered ? "#f8fafc" : "#cbd5e1";
                    ctx.font = `${isHovered ? "700 " : ""}11.5px ${FONT}`;
                    ctx.fillText(it.shortLabel, cx, mT + ph + 18);

                    ctx.fillStyle = "#94a3b8";
                    ctx.font = `11px ${FONT}`;
                    ctx.fillText(
                        `SF ${fmt2.format(it.ev.sf)} · Peak ${fmt1.format(
                            it.ev.peakGw
                        )} GW`,
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
    }, [
        activeTab,
        data,
        evalBase2025,
        evalA,
        evalB,
        effectiveWinLen,
        clampedStart,
        unitFactor,
        unitMode,
        comparisonBars,
        hoverPoint,
    ]);

    const diffTwhAB = evalA && evalB ? evalA.targetTwh - evalB.targetTwh : 0;
    const diffPctAB =
        evalA && evalB && evalB.targetTwh > 0
            ? (diffTwhAB / evalB.targetTwh) * 100
            : 0;
    const diffPeakGwAB = evalA && evalB ? evalA.peakGw - evalB.peakGw : 0;
    const diffPeakMwhAB = evalA && evalB ? evalA.peakMwh - evalB.peakMwh : 0;

    return (
        <div
            className="content-body"
            style={{ fontFamily: FONT, color: "#f8fafc" }}
        >
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
                {/* Kopfzeile & CSV-Upload */}
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
                        <h2
                            style={{
                                margin: 0,
                                color: "#f8fafc",
                                fontSize: 20,
                            }}
                        >
                            Netzlast & Nettostromverbrauch (01_Netzlast.csv)
                        </h2>
                        <div
                            style={{
                                fontSize: 12,
                                color: "#94a3b8",
                                marginTop: 4,
                            }}
                        >
                            Viertelstundenscharfe Auswertung (Δt = 0,25 h) ·
                            Skalierung P₂₀₃₀(t) = P₂₀₂₅(t) · (E₂₀₃₀ / E₂₀₂₅)
                        </div>
                    </div>

                    <label style={BTN_ACCENT_STYLE}>
                        📂 01_Netzlast.csv laden
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            style={{ display: "none" }}
                        />
                    </label>
                </div>

                {/* Eindeutige Einheiten- und Bedeutungsangabe (Leistung vs. Energie) */}
                <div
                    style={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: 10,
                        padding: "10px 14px",
                        fontSize: 12,
                        color: "#cbd5e1",
                        lineHeight: 1.5,
                    }}
                >
                    <strong style={{ color: "#38bdf8" }}>
                        Einheit & Bedeutung (Energie vs. Leistung):
                    </strong>{" "}
                    Die CSV-Spalten <code>Netzlast [MWh]</code> enthalten die{" "}
                    <strong>Energiemenge Eᵢ in MWh je Viertelstunde</strong>{" "}
                    (Jahressumme E_Jahr = Σ Eᵢ über {EXPECTED_YEAR_INTERVALS.toLocaleString("de-DE")}{" "}
                    Intervalle; 1 TWh = 1.000.000 MWh). Die mittlere{" "}
                    <strong>elektrische Leistung P(t)</strong> im 15-Minuten-Takt
                    beträgt{" "}
                    <strong>
                        P = Eᵢ / 0,25 h = 4 · Eᵢ [MW] = (4 · Eᵢ) / 1.000 [GW]
                    </strong>
                    .
                </div>

                {/* Status-Badges zur geladenen CSV */}
                {data && (
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            fontSize: 12,
                        }}
                    >
                        <span style={BADGE_BLUE}>
                            ✓ {data.count.toLocaleString("de-DE")} Viertelstunden
                            geladen ({formatDate(new Date(data.starts[0]))} –{" "}
                            {formatDate(new Date(data.ends[data.count - 1]))})
                        </span>
                        <span
                            style={
                                data.count >= EXPECTED_YEAR_INTERVALS
                                    ? BADGE_GREEN
                                    : BADGE_WARN
                            }
                        >
                            {data.count >= EXPECTED_YEAR_INTERVALS
                                ? `Vollständiges Jahr (Σ Eᵢ = ${fmt2.format(
                                      data.sumLoaded2025Twh
                                  )} TWh)`
                                : `Teil-Datensatz (${data.count.toLocaleString(
                                      "de-DE"
                                  )} / ${EXPECTED_YEAR_INTERVALS.toLocaleString(
                                      "de-DE"
                                  )} Zeilen · Σ Ausschnitt = ${fmt4.format(
                                      data.sumLoaded2025Twh
                                  )} TWh · Jahresreferenz E₂₀₂₅ = ${fmt2.format(
                                      data.meta.baseYearTwh
                                  )} TWh)`}
                        </span>
                    </div>
                )}

                {loading && <p>01_Netzlast.csv wird geladen …</p>}
                {statusMsg && <div style={BADGE_WARN}>{statusMsg}</div>}

                {data && evalBase2025 && evalA && evalB && (
                    <>
                        {/* Steuerung: Einstellung A & Einstellung B zum direkten Szenariovergleich */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(310px, 1fr))",
                                gap: 14,
                            }}
                        >
                            {/* Einstellung A */}
                            <ScenarioControlCard
                                title="Einstellung A (Hauptszenario 2030)"
                                accentColor="#38bdf8"
                                setting={settingA}
                                sf={evalA.sf}
                                meta={data.meta}
                                include2025Preset={false}
                                onSelectPreset={(p) => selectPreset("A", p)}
                                onChangeTwh={(v) => updateTargetTwh("A", v)}
                            />

                            {/* Einstellung B */}
                            <ScenarioControlCard
                                title="Einstellung B (Vergleichsszenario)"
                                accentColor="#fb923c"
                                setting={settingB}
                                sf={evalB.sf}
                                meta={data.meta}
                                include2025Preset={true}
                                onSelectPreset={(p) => selectPreset("B", p)}
                                onChangeTwh={(v) => updateTargetTwh("B", v)}
                            />
                        </div>

                        {/* Ergebnis- & Auswirkungs-KPIs */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(205px, 1fr))",
                                gap: 10,
                            }}
                        >
                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>
                                    Basisjahr 2025 (Referenz)
                                </div>
                                <div style={KPI_VAL}>
                                    {fmt2.format(data.meta.baseYearTwh)} TWh
                                </div>
                                <div style={KPI_SUB}>
                                    Spitzenlast:{" "}
                                    {fmt2.format(evalBase2025.peakGw)} GW (
                                    {fmt1.format(evalBase2025.peakMwh)} MWh / 15m)
                                </div>
                            </div>

                            <div
                                style={{
                                    ...KPI_CARD,
                                    borderColor: "#0284c7",
                                }}
                            >
                                <div style={KPI_LABEL}>{evalA.label}</div>
                                <div style={{ ...KPI_VAL, color: "#38bdf8" }}>
                                    {fmt2.format(evalA.targetTwh)} TWh
                                </div>
                                <div style={KPI_SUB}>
                                    SF = {fmt4.format(evalA.sf)} · ggü. 2025:{" "}
                                    {evalA.deltaVs2025Twh >= 0 ? "+" : ""}
                                    {fmt1.format(evalA.deltaVs2025Twh)} TWh (
                                    {evalA.deltaVs2025Pct >= 0 ? "+" : ""}
                                    {fmt1.format(evalA.deltaVs2025Pct)} %)
                                </div>
                                <div style={KPI_SUB}>
                                    Spitzenlast: {fmt2.format(evalA.peakGw)} GW (
                                    {fmt1.format(evalA.peakMwh)} MWh / 15m)
                                </div>
                            </div>

                            <div
                                style={{
                                    ...KPI_CARD,
                                    borderColor: "#ea580c",
                                }}
                            >
                                <div style={KPI_LABEL}>{evalB.label}</div>
                                <div style={{ ...KPI_VAL, color: "#fb923c" }}>
                                    {fmt2.format(evalB.targetTwh)} TWh
                                </div>
                                <div style={KPI_SUB}>
                                    SF = {fmt4.format(evalB.sf)} · ggü. 2025:{" "}
                                    {evalB.deltaVs2025Twh >= 0 ? "+" : ""}
                                    {fmt1.format(evalB.deltaVs2025Twh)} TWh (
                                    {evalB.deltaVs2025Pct >= 0 ? "+" : ""}
                                    {fmt1.format(evalB.deltaVs2025Pct)} %)
                                </div>
                                <div style={KPI_SUB}>
                                    Spitzenlast: {fmt2.format(evalB.peakGw)} GW (
                                    {fmt1.format(evalB.peakMwh)} MWh / 15m)
                                </div>
                            </div>

                            <div style={KPI_CARD}>
                                <div style={KPI_LABEL}>
                                    Vergleich (Einstellung A − B)
                                </div>
                                <div
                                    style={{
                                        ...KPI_VAL,
                                        color:
                                            diffTwhAB >= 0
                                                ? "#34d399"
                                                : "#facc15",
                                    }}
                                >
                                    {diffTwhAB >= 0 ? "+" : ""}
                                    {fmt2.format(diffTwhAB)} TWh
                                </div>
                                <div style={KPI_SUB}>
                                    Relativ: {diffPctAB >= 0 ? "+" : ""}
                                    {fmt1.format(diffPctAB)} % · ΔSF:{" "}
                                    {evalA.sf - evalB.sf >= 0 ? "+" : ""}
                                    {fmt4.format(evalA.sf - evalB.sf)}
                                </div>
                                <div style={KPI_SUB}>
                                    ΔSpitzenlast:{" "}
                                    {diffPeakGwAB >= 0 ? "+" : ""}
                                    {fmt2.format(diffPeakGwAB)} GW (
                                    {diffPeakMwhAB >= 0 ? "+" : ""}
                                    {fmt1.format(diffPeakMwhAB)} MWh / 15m)
                                </div>
                            </div>
                        </div>

                        {/* Diagramm-Leiste & Einheiten-Umschalter */}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 8,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 6,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveTab("timeseries")
                                        }
                                        style={
                                            activeTab === "timeseries"
                                                ? TAB_ACTIVE
                                                : BTN_STYLE
                                        }
                                    >
                                        🔍 Netzlast im 15-Minuten-Takt (
                                        {unitShort})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveTab("comparison")
                                        }
                                        style={
                                            activeTab === "comparison"
                                                ? TAB_ACTIVE
                                                : BTN_STYLE
                                        }
                                    >
                                        📊 Szenariovergleich (TWh & Peak-GW)
                                    </button>
                                </div>

                                {activeTab === "timeseries" && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 6,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setUnitMode("powerGw")
                                            }
                                            style={
                                                unitMode === "powerGw"
                                                    ? TAB_ACTIVE
                                                    : BTN_STYLE
                                            }
                                        >
                                            Leistung P(t) [GW]
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setUnitMode("energyMwh")
                                            }
                                            style={
                                                unitMode === "energyMwh"
                                                    ? TAB_ACTIVE
                                                    : BTN_STYLE
                                            }
                                        >
                                            Energie Eᵢ [MWh / 15 Min.]
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Zeitfenster-Navigation im 15-Minuten-Plot */}
                            {activeTab === "timeseries" && (
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    {[
                                        { label: "1 Tag (96)", q: 96 },
                                        { label: "7 Tage (672)", q: 672 },
                                        { label: "30 Tage (2.880)", q: 2880 },
                                        {
                                            label: "Gesamtzeitraum",
                                            q: data.count,
                                        },
                                    ].map((opt) => (
                                        <button
                                            key={opt.label}
                                            type="button"
                                            onClick={() =>
                                                setWindowQuarters(opt.q)
                                            }
                                            style={
                                                windowQuarters === opt.q
                                                    ? TAB_ACTIVE
                                                    : BTN_STYLE
                                            }
                                        >
                                            {opt.label}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setTsWindowStart(
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        data.count -
                                                            effectiveWinLen,
                                                        data.peakIdx -
                                                            Math.floor(
                                                                effectiveWinLen /
                                                                    2
                                                            )
                                                    )
                                                )
                                            )
                                        }
                                        style={BTN_STYLE}
                                    >
                                        ⚡ Zur Spitzenlast springen
                                    </button>

                                    {data.count > effectiveWinLen && (
                                        <input
                                            type="range"
                                            min={0}
                                            max={Math.max(
                                                0,
                                                data.count - effectiveWinLen
                                            )}
                                            value={clampedStart}
                                            onChange={(e) =>
                                                setTsWindowStart(
                                                    Number(e.target.value)
                                                )
                                            }
                                            style={{
                                                flex: 1,
                                                minWidth: 160,
                                                accentColor: "#38bdf8",
                                                cursor: "pointer",
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Canvas-Diagramm mit Hover-Tooltip */}
                            <div
                                ref={chartWrapRef}
                                onMouseMove={handleChartMouseMove}
                                onMouseLeave={handleChartMouseLeave}
                                style={{
                                    width: "100%",
                                    height: 440,
                                    background: "#020617",
                                    borderRadius: 12,
                                    border: "1px solid #1e293b",
                                    position: "relative",
                                    cursor: "crosshair",
                                    overflow: "hidden",
                                }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                    }}
                                />

                                {tooltipData && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: Math.max(
                                                12,
                                                Math.min(
                                                    tooltipData.y - 16,
                                                    260
                                                )
                                            ),
                                            left:
                                                tooltipData.x >
                                                tooltipData.wrapWidth * 0.56
                                                    ? Math.max(
                                                          12,
                                                          tooltipData.x - 310
                                                      )
                                                    : tooltipData.x + 16,
                                            width: 294,
                                            background:
                                                "rgba(15, 23, 42, 0.95)",
                                            border: "1px solid #475569",
                                            borderRadius: 10,
                                            padding: "10px 12px",
                                            boxShadow:
                                                "0 10px 25px rgba(0, 0, 0, 0.55)",
                                            pointerEvents: "none",
                                            zIndex: 10,
                                            backdropFilter: "blur(6px)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 12.5,
                                                fontWeight: 700,
                                                color: "#f8fafc",
                                                marginBottom: 2,
                                            }}
                                        >
                                            {tooltipData.title}
                                        </div>
                                        {tooltipData.subtitle && (
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: "#94a3b8",
                                                    borderBottom:
                                                        "1px solid #334155",
                                                    paddingBottom: 6,
                                                    marginBottom: 6,
                                                }}
                                            >
                                                {tooltipData.subtitle}
                                            </div>
                                        )}
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 4,
                                            }}
                                        >
                                            {tooltipData.rows.map((r) => (
                                                <div
                                                    key={r.label}
                                                    style={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        gap: 8,
                                                        fontSize: 11.5,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            color: "#cbd5e1",
                                                        }}
                                                    >
                                                        {r.label}
                                                    </span>
                                                    <strong
                                                        style={{
                                                            color:
                                                                r.color ??
                                                                "#f8fafc",
                                                            textAlign: "right",
                                                        }}
                                                    >
                                                        {r.value}
                                                    </strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ScenarioControlCard({
    title,
    accentColor,
    setting,
    sf,
    meta,
    include2025Preset,
    onSelectPreset,
    onChangeTwh,
}: {
    title: string;
    accentColor: string;
    setting: ScenarioSetting;
    sf: number;
    meta: CsvMetadata;
    include2025Preset: boolean;
    onSelectPreset: (p: Exclude<PresetKey, "custom">) => void;
    onChangeTwh: (v: number) => void;
}) {
    const presets: { key: Exclude<PresetKey, "custom">; label: string }[] = [
        ...(include2025Preset
            ? [
                  {
                      key: "2025" as const,
                      label: `2025 (${fmt1.format(meta.baseYearTwh)} TWh)`,
                  },
              ]
            : []),
        {
            key: "min",
            label: `Minimum (${fmt0Or1(meta.minTwh)} TWh)`,
        },
        {
            key: "mittel",
            label: `Mittelwert (${fmt0Or1(meta.mittelTwh)} TWh)`,
        },
        {
            key: "max",
            label: `Maximum (${fmt0Or1(meta.maxTwh)} TWh)`,
        },
    ];

    return (
        <div style={{ ...PARAM_CARD_STYLE, borderColor: "#334155" }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <strong style={{ fontSize: 13.5, color: accentColor }}>
                    {title}
                </strong>
                <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
                    SF = <strong>{fmt4.format(sf)}</strong>
                </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map((p) => {
                    const active = setting.preset === p.key;
                    return (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => onSelectPreset(p.key)}
                            style={{
                                ...BTN_STYLE,
                                background: active ? "#2563eb" : "#0f172a",
                                borderColor: active ? "#60a5fa" : "#334155",
                                fontWeight: active ? 700 : 500,
                            }}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        color: "#cbd5e1",
                    }}
                >
                    <span>Nettostromverbrauch selbst anpassen:</span>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <input
                            type="number"
                            min={200}
                            max={1200}
                            step={1}
                            value={Math.round(setting.targetTwh * 10) / 10}
                            onChange={(e) =>
                                onChangeTwh(Number(e.target.value))
                            }
                            style={{
                                width: 78,
                                padding: "3px 6px",
                                borderRadius: 6,
                                border: "1px solid #475569",
                                background: "#0f172a",
                                color: "#f8fafc",
                                fontSize: 12,
                                fontFamily: FONT,
                                textAlign: "right",
                            }}
                        />
                        <strong>TWh</strong>
                    </div>
                </div>
                <input
                    type="range"
                    min={350}
                    max={1000}
                    step={1}
                    value={setting.targetTwh}
                    onChange={(e) => onChangeTwh(Number(e.target.value))}
                    style={{
                        width: "100%",
                        accentColor,
                        cursor: "pointer",
                    }}
                />
            </div>
        </div>
    );
}

function fmt0Or1(n: number): string {
    return Number.isInteger(Math.round(n * 10) / 10) &&
        Math.abs(n - Math.round(n)) < 0.05
        ? Math.round(n).toLocaleString("de-DE")
        : fmt1.format(n);
}

const PARAM_CARD_STYLE: CSSProperties = {
    background: "#1e293b",
    borderRadius: 12,
    border: "1px solid #334155",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
};

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
    display: "flex",
    flexDirection: "column",
    gap: 2,
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
