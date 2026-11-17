import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from "react";
import * as d3 from "d3";

type SMARD_ErzeugungProps = {
    csvUrl?: string;
    applyGermanNuclearZeroRule?: boolean;
    width?: number;
    height?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
};

type AggregationLevel = "raw" | "hour" | "day" | "week" | "month";
type SmoothingWindow = "none" | "6h" | "24h" | "7d" | "30d";
type ChartViewMode = "line" | "stacked";

type RenewableCarrierId =
    | "biomass"
    | "hydro"
    | "otherRenewable"
    | "windOffshore"
    | "windOnshore"
    | "pv";

type RenewableCarrierMeta = {
    id: RenewableCarrierId;
    index: number;
    column: string;
    label: string;
    color: string;
};

// Reihenfolge für gestapelte Darstellung: Grundlast unten, volatile Erzeuger oben.
const RENEWABLE_CARRIERS: readonly RenewableCarrierMeta[] = [
    {
        id: "biomass",
        index: 0,
        column: "Biomasse [MWh] Originalauflösungen",
        label: "Biomasse",
        color: "#16a34a",
    },
    {
        id: "hydro",
        index: 1,
        column: "Wasserkraft [MWh] Originalauflösungen",
        label: "Wasserkraft",
        color: "#0891b2",
    },
    {
        id: "otherRenewable",
        index: 2,
        column: "Sonstige Erneuerbare [MWh] Originalauflösungen",
        label: "Sonstige Erneuerbare",
        color: "#0d9488",
    },
    {
        id: "windOffshore",
        index: 3,
        column: "Wind Offshore [MWh] Originalauflösungen",
        label: "Wind Offshore",
        color: "#1d4ed8",
    },
    {
        id: "windOnshore",
        index: 4,
        column: "Wind Onshore [MWh] Originalauflösungen",
        label: "Wind Onshore",
        color: "#3b82f6",
    },
    {
        id: "pv",
        index: 5,
        column: "Photovoltaik [MWh] Originalauflösungen",
        label: "Photovoltaik",
        color: "#eab308",
    },
] as const;

const OTHER_COLUMNS = [
    "Kernenergie [MWh] Originalauflösungen",
    "Braunkohle [MWh] Originalauflösungen",
    "Steinkohle [MWh] Originalauflösungen",
    "Erdgas [MWh] Originalauflösungen",
    "Pumpspeicher [MWh] Originalauflösungen",
    "Sonstige Konventionelle [MWh] Originalauflösungen",
] as const;

const RENEWABLE_COLUMNS = RENEWABLE_CARRIERS.map((c) => c.column);

const ALL_ENERGY_COLUMNS = [
    ...RENEWABLE_COLUMNS,
    ...OTHER_COLUMNS,
];

const NUCLEAR_COLUMN = "Kernenergie [MWh] Originalauflösungen";

const AGGREGATION_OPTIONS: readonly {
    value: AggregationLevel;
    label: string;
}[] = [
    { value: "raw", label: "Original" },
    { value: "hour", label: "Stunde" },
    { value: "day", label: "Tag" },
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
];

const SMOOTHING_OPTIONS: readonly {
    value: SmoothingWindow;
    label: string;
    ms: number;
}[] = [
    { value: "none", label: "Keine Glättung", ms: 0 },
    { value: "6h", label: "Ø 6 Std.", ms: 6 * 3_600_000 },
    { value: "24h", label: "Ø 24 Std.", ms: 24 * 3_600_000 },
    { value: "7d", label: "Ø 7 Tage", ms: 7 * 86_400_000 },
    { value: "30d", label: "Ø 30 Tage", ms: 30 * 86_400_000 },
];

// Übernommene, datenquellenspezifische Annahme.
// Der Zeitpunkt beschreibt die beobachtete Änderung des CSV-Formats,
// nicht das Datum des deutschen Atomausstiegs.
const NUCLEAR_MISSING_FROM = Date.UTC(2024, 0, 30, 12, 30);

// Darstellung der CSV-Uhrzeiten ohne Sommer-/Winterzeitkorrektur.
// Keine Umrechnung tatsächlicher Messzeitpunkte nach UTC.
const parseDate = d3.utcParse("%d.%m.%Y %H:%M");
const formatDate = d3.utcFormat("%d.%m.%Y %H:%M");
const formatTime = d3.utcFormat("%H:%M");
const formatTickDate = d3.utcFormat("%d.%m.%y");
const formatInputDateTime = d3.utcFormat("%Y-%m-%dT%H:%M");
const formatFileDate = d3.utcFormat("%Y-%m-%d");
const parseInputDateTime = d3.utcParse("%Y-%m-%dT%H:%M");
const parseInputDateTimeSec = d3.utcParse("%Y-%m-%dT%H:%M:%S");

const formatNumber = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
});

const formatPercent = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
});

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

type ParsedCsvData = {
    count: number;
    starts: Float64Array;
    ends: Float64Array;
    renewableCarriers: Float64Array[]; // Länge 6, analog RENEWABLE_CARRIERS
    allRenewable: Float64Array;
    totals: Float64Array;
    nuclearFilled: Uint8Array;
    skippedRows: number;
    filledNuclearRows: number;
    availableYears: number[];
};

type AggregatedSeries = {
    count: number;
    times: Float64Array;
    ends: Float64Array;
    coverageEnds: Float64Array;
    segmentIds: Uint32Array;
    isolated: Uint8Array;
    renewableCarriers: Float64Array[];
    allRenewable: Float64Array;
    totals: Float64Array;
    nuclearFilled: Uint8Array;
    prefixTotal: Float64Array;
    prefixAllRenewable: Float64Array;
    prefixCarriers: Float64Array[];
};

type ChartModel = {
    series: AggregatedSeries;
    shares: Float64Array;
    selectedRenewable: Float64Array;
    smoothedShares: Float64Array | null;
    activeCarrierIndices: number[];

    // Segmentbaum für schnelle Min-/Max-Abfragen.
    treeSize: number;
    minTree: Int32Array;
    maxTree: Int32Array;
};

type Extremes = {
    min: number;
    max: number;
};

type ViewportSummary = {
    visibleMin: number;
    visibleMax: number;
    visibleStart: number;
    visibleEnd: number;
    zoomFactor: number;
    isZoomed: boolean;
    pointCount: number;
    weightedShare: number;
    selectedRenewableMwh: number;
    allRenewableMwh: number;
    totalMwh: number;
    minShare: number | null;
    minTime: number | null;
    maxShare: number | null;
    maxTime: number | null;
    carrierMwh: number[];
    carrierShareOfTotal: number[];
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatEnergyAuto(mwh: number): string {
    const abs = Math.abs(mwh);

    if (abs >= 1_000_000) {
        return `${formatNumber.format(mwh / 1_000_000)} TWh`;
    }

    if (abs >= 10_000) {
        return `${formatNumber.format(mwh / 1_000)} GWh`;
    }

    return `${formatNumber.format(mwh)} MWh`;
}

function formatCsvDecimal(value: number): string {
    return value.toFixed(2).replace(".", ",");
}

function isMissingValue(value: string | undefined): boolean {
    const trimmed = value?.trim();

    return (
        !trimmed ||
        trimmed === "-" ||
        trimmed === "–" ||
        trimmed === "—"
    );
}

function parseGermanNumber(
    rawValue: string | undefined,
    column: string,
    rowNumber: number
): number {
    const value = rawValue?.trim();

    if (!value) {
        throw new Error(
            `CSV-Zeile ${rowNumber}: Wert in "${column}" fehlt.`
        );
    }

    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(value)) {
        throw new Error(
            `CSV-Zeile ${rowNumber}: Ungültige Zahl "${value}" ` +
                `in "${column}".`
        );
    }

    const number = Number(
        value.replace(/\./g, "").replace(",", ".")
    );

    if (!Number.isFinite(number) || number < 0) {
        throw new Error(
            `CSV-Zeile ${rowNumber}: Ungültiger Erzeugungswert ` +
                `"${value}" in "${column}".`
        );
    }

    return number;
}

/**
 * Erster Index mit times[index] >= target.
 */
function lowerBound(
    times: Float64Array,
    target: number,
    lo = 0,
    hi = times.length
): number {
    while (lo < hi) {
        const mid = lo + Math.floor((hi - lo) / 2);

        if (times[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

/**
 * Erster Index mit times[index] > target.
 */
function upperBound(
    times: Float64Array,
    target: number,
    lo = 0,
    hi = times.length
): number {
    while (lo < hi) {
        const mid = lo + Math.floor((hi - lo) / 2);

        if (times[mid] <= target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

function parseCsvToRawData(
    text: string,
    applyGermanNuclearZeroRule: boolean
): ParsedCsvData {
    const rows = d3.dsvFormat(";").parse(
        text.replace(/^\uFEFF/, "")
    );

    const requiredColumns = [
        "Datum von",
        "Datum bis",
        ...ALL_ENERGY_COLUMNS,
    ];

    const missingColumns = requiredColumns.filter(
        (column) => !rows.columns.includes(column)
    );

    if (missingColumns.length > 0) {
        throw new Error(
            `CSV-Spalten fehlen: ${missingColumns.join(", ")}`
        );
    }

    type RawRow = {
        startMs: number;
        endMs: number;
        carriers: [number, number, number, number, number, number];
        allRenewable: number;
        total: number;
        nuclearWasFilled: boolean;
    };

    const parsedRows: RawRow[] = [];
    let skippedRows = 0;
    let filledNuclearRows = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;

        if (Object.values(row).every((value) => !value?.trim())) {
            continue;
        }

        const startText = row["Datum von"]?.trim() ?? "";
        const endText = row["Datum bis"]?.trim() ?? "";

        const start = parseDate(startText);
        const end = parseDate(endText);

        if (
            !start ||
            !end ||
            formatDate(start) !== startText ||
            formatDate(end) !== endText
        ) {
            throw new Error(
                `CSV-Zeile ${rowNumber}: Ungültiges Datumsformat. ` +
                    `Datum von="${startText}", Datum bis="${endText}". ` +
                    `Erwartet: TT.MM.JJJJ HH:mm.`
            );
        }

        const startMs = start.getTime();
        const endMs = end.getTime();

        if (endMs <= startMs) {
            throw new Error(
                `CSV-Zeile ${rowNumber}: Ungültiger Zeitraum. ` +
                    `Das Ende liegt nicht nach dem Beginn. ` +
                    `Bei einer Winterzeitumstellung muss die Zeitzone ` +
                    `anhand der Datenquelle gesondert behandelt werden.`
            );
        }

        const nuclearWasFilled =
            applyGermanNuclearZeroRule &&
            startMs >= NUCLEAR_MISSING_FROM &&
            row[NUCLEAR_COLUMN]?.trim() === "-";

        let hasMissingValue = false;

        for (const column of ALL_ENERGY_COLUMNS) {
            if (column === NUCLEAR_COLUMN && nuclearWasFilled) {
                continue;
            }

            if (isMissingValue(row[column])) {
                hasMissingValue = true;
                break;
            }
        }

        if (hasMissingValue) {
            skippedRows += 1;
            continue;
        }

        const carriers: [number, number, number, number, number, number] = [
            0, 0, 0, 0, 0, 0,
        ];

        let renewable = 0;

        for (let c = 0; c < RENEWABLE_CARRIERS.length; c += 1) {
            const val = parseGermanNumber(
                row[RENEWABLE_CARRIERS[c].column],
                RENEWABLE_CARRIERS[c].column,
                rowNumber
            );
            carriers[c] = val;
            renewable += val;
        }

        let other = 0;

        for (const column of OTHER_COLUMNS) {
            if (column === NUCLEAR_COLUMN && nuclearWasFilled) {
                continue;
            }

            other += parseGermanNumber(
                row[column],
                column,
                rowNumber
            );
        }

        const total = renewable + other;

        if (!Number.isFinite(total) || total <= 0) {
            throw new Error(
                `CSV-Zeile ${rowNumber}: Die Gesamtstromerzeugung ` +
                    `muss eine endliche Zahl größer als 0 sein.`
            );
        }

        parsedRows.push({
            startMs,
            endMs,
            carriers,
            allRenewable: renewable,
            total,
            nuclearWasFilled,
        });

        if (nuclearWasFilled) {
            filledNuclearRows += 1;
        }
    }

    if (parsedRows.length === 0) {
        throw new Error(
            `Keine auswertbaren Messwerte vorhanden. ` +
                `${skippedRows} Zeilen enthalten fehlende Erzeugungswerte.`
        );
    }

    parsedRows.sort((a, b) => a.startMs - b.startMs);

    const count = parsedRows.length;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count);
    const renewableCarriers = RENEWABLE_CARRIERS.map(
        () => new Float64Array(count)
    );
    const allRenewable = new Float64Array(count);
    const totals = new Float64Array(count);
    const nuclearFilled = new Uint8Array(count);
    const yearsSet = new Set<number>();

    let lastYearCheckDay = Number.NaN;

    for (let i = 0; i < count; i += 1) {
        const item = parsedRows[i];
        starts[i] = item.startMs;
        ends[i] = item.endMs;
        allRenewable[i] = item.allRenewable;
        totals[i] = item.total;
        nuclearFilled[i] = item.nuclearWasFilled ? 1 : 0;

        for (let c = 0; c < 6; c += 1) {
            renewableCarriers[c][i] = item.carriers[c];
        }

        const dayBucket = Math.floor(item.startMs / 86_400_000);
        if (dayBucket !== lastYearCheckDay) {
            lastYearCheckDay = dayBucket;
            yearsSet.add(new Date(item.startMs).getUTCFullYear());
        }
    }

    const availableYears = Array.from(yearsSet).sort((a, b) => a - b);

    return {
        count,
        starts,
        ends,
        renewableCarriers,
        allRenewable,
        totals,
        nuclearFilled,
        skippedRows,
        filledNuclearRows,
        availableYears,
    };
}

function getBucketBounds(
    timestamp: number,
    level: Exclude<AggregationLevel, "raw">
): [number, number] {
    if (level === "hour") {
        const start = Math.floor(timestamp / 3_600_000) * 3_600_000;
        return [start, start + 3_600_000];
    }

    if (level === "day") {
        const start = Math.floor(timestamp / 86_400_000) * 86_400_000;
        return [start, start + 86_400_000];
    }

    if (level === "week") {
        // Kalenderwoche ab Montag 00:00 (1970-01-01 war ein Donnerstag -> Offset +3).
        const dayIndex = Math.floor(timestamp / 86_400_000);
        const weekdayOffset = (((dayIndex + 3) % 7) + 7) % 7;
        const start = (dayIndex - weekdayOffset) * 86_400_000;
        return [start, start + 7 * 86_400_000];
    }

    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();

    return [
        Date.UTC(year, month, 1),
        Date.UTC(year, month + 1, 1),
    ];
}

function buildPrefixSums(values: Float64Array): Float64Array {
    const prefix = new Float64Array(values.length + 1);

    for (let i = 0; i < values.length; i += 1) {
        prefix[i + 1] = prefix[i] + values[i];
    }

    return prefix;
}

function aggregateSeries(
    raw: ParsedCsvData,
    level: AggregationLevel
): AggregatedSeries {
    if (level === "raw") {
        const { count } = raw;
        const segmentIds = new Uint32Array(count);
        const isolated = new Uint8Array(count);

        let segmentId = 0;

        for (let i = 0; i < count; i += 1) {
            if (i > 0 && raw.starts[i] > raw.ends[i - 1]) {
                segmentId += 1;
            }
            segmentIds[i] = segmentId;
        }

        for (let i = 0; i < count; i += 1) {
            const hasPrev =
                i > 0 && segmentIds[i - 1] === segmentIds[i];
            const hasNext =
                i + 1 < count && segmentIds[i + 1] === segmentIds[i];
            isolated[i] = !hasPrev && !hasNext ? 1 : 0;
        }

        return {
            count,
            times: raw.starts,
            ends: raw.ends,
            coverageEnds: raw.ends,
            segmentIds,
            isolated,
            renewableCarriers: raw.renewableCarriers,
            allRenewable: raw.allRenewable,
            totals: raw.totals,
            nuclearFilled: raw.nuclearFilled,
            prefixTotal: buildPrefixSums(raw.totals),
            prefixAllRenewable: buildPrefixSums(raw.allRenewable),
            prefixCarriers: raw.renewableCarriers.map(buildPrefixSums),
        };
    }

    const bTimes: number[] = [];
    const bEnds: number[] = [];
    const bPeriodStarts: number[] = [];
    const bPeriodEnds: number[] = [];
    const bCarriers: number[][] = RENEWABLE_CARRIERS.map(() => []);
    const bAllRen: number[] = [];
    const bTotals: number[] = [];
    const bNuc: number[] = [];

    let index = 0;
    const rawCount = raw.count;

    while (index < rawCount) {
        const [periodStart, periodEnd] = getBucketBounds(
            raw.starts[index],
            level
        );

        const actualStart = raw.starts[index];
        let actualEnd = raw.ends[index];
        let sumAllRen = 0;
        let sumTot = 0;
        let nucFlag = 0;
        const carrierSums = [0, 0, 0, 0, 0, 0];

        while (index < rawCount && raw.starts[index] < periodEnd) {
            actualEnd = raw.ends[index];
            sumAllRen += raw.allRenewable[index];
            sumTot += raw.totals[index];

            if (raw.nuclearFilled[index] === 1) {
                nucFlag = 1;
            }

            for (let c = 0; c < 6; c += 1) {
                carrierSums[c] += raw.renewableCarriers[c][index];
            }

            index += 1;
        }

        bTimes.push(actualStart);
        bEnds.push(actualEnd);
        bPeriodStarts.push(periodStart);
        bPeriodEnds.push(Math.min(periodEnd, raw.ends[rawCount - 1]));
        bAllRen.push(sumAllRen);
        bTotals.push(sumTot);
        bNuc.push(nucFlag);

        for (let c = 0; c < 6; c += 1) {
            bCarriers[c].push(carrierSums[c]);
        }
    }

    const count = bTimes.length;
    const times = Float64Array.from(bTimes);
    const ends = Float64Array.from(bEnds);
    const coverageEnds = Float64Array.from(bPeriodEnds);
    const allRenewable = Float64Array.from(bAllRen);
    const totals = Float64Array.from(bTotals);
    const nuclearFilled = Uint8Array.from(bNuc);
    const renewableCarriers = bCarriers.map((arr) =>
        Float64Array.from(arr)
    );

    const segmentIds = new Uint32Array(count);
    const isolated = new Uint8Array(count);

    let segmentId = 0;

    for (let i = 0; i < count; i += 1) {
        if (i > 0 && bPeriodStarts[i] > bPeriodEnds[i - 1]) {
            segmentId += 1;
        }
        segmentIds[i] = segmentId;
    }

    for (let i = 0; i < count; i += 1) {
        const hasPrev =
            i > 0 && segmentIds[i - 1] === segmentIds[i];
        const hasNext =
            i + 1 < count && segmentIds[i + 1] === segmentIds[i];
        isolated[i] = !hasPrev && !hasNext ? 1 : 0;
    }

    return {
        count,
        times,
        ends,
        coverageEnds,
        segmentIds,
        isolated,
        renewableCarriers,
        allRenewable,
        totals,
        nuclearFilled,
        prefixTotal: buildPrefixSums(totals),
        prefixAllRenewable: buildPrefixSums(allRenewable),
        prefixCarriers: renewableCarriers.map(buildPrefixSums),
    };
}

function computeCenteredSmoothing(
    times: Float64Array,
    selectedRenewable: Float64Array,
    totals: Float64Array,
    fallbackShares: Float64Array,
    windowMs: number
): Float64Array {
    const count = times.length;
    const smoothed = new Float64Array(count);
    const halfWin = windowMs / 2;

    let lo = 0;
    let hi = 0;
    let sumRen = 0;
    let sumTot = 0;

    for (let i = 0; i < count; i += 1) {
        const maxT = times[i] + halfWin;
        const minT = times[i] - halfWin;

        while (hi < count && times[hi] <= maxT) {
            sumRen += selectedRenewable[hi];
            sumTot += totals[hi];
            hi += 1;
        }

        while (lo < hi && times[lo] < minT) {
            sumRen -= selectedRenewable[lo];
            sumTot -= totals[lo];
            lo += 1;
        }

        smoothed[i] =
            sumTot > 0 ? (sumRen / sumTot) * 100 : fallbackShares[i];
    }

    return smoothed;
}

function buildChartModel(
    series: AggregatedSeries,
    selectedIds: ReadonlySet<RenewableCarrierId>,
    smoothing: SmoothingWindow
): ChartModel {
    const { count, totals, renewableCarriers, times } = series;

    const activeCarrierIndices = RENEWABLE_CARRIERS.filter((c) =>
        selectedIds.has(c.id)
    ).map((c) => c.index);

    const selectedRenewable = new Float64Array(count);
    const shares = new Float64Array(count);

    for (const cIdx of activeCarrierIndices) {
        const arr = renewableCarriers[cIdx];
        for (let i = 0; i < count; i += 1) {
            selectedRenewable[i] += arr[i];
        }
    }

    for (let i = 0; i < count; i += 1) {
        shares[i] =
            totals[i] > 0
                ? (selectedRenewable[i] / totals[i]) * 100
                : 0;
    }

    const smoothingMeta = SMOOTHING_OPTIONS.find(
        (opt) => opt.value === smoothing
    );

    const smoothedShares =
        smoothingMeta && smoothingMeta.ms > 0
            ? computeCenteredSmoothing(
                  times,
                  selectedRenewable,
                  totals,
                  shares,
                  smoothingMeta.ms
              )
            : null;

    let treeSize = 1;

    while (treeSize < count) {
        treeSize *= 2;
    }

    const minTree = new Int32Array(treeSize * 2);
    const maxTree = new Int32Array(treeSize * 2);

    minTree.fill(-1);
    maxTree.fill(-1);

    for (let i = 0; i < count; i += 1) {
        minTree[treeSize + i] = i;
        maxTree[treeSize + i] = i;
    }

    for (let node = treeSize - 1; node > 0; node -= 1) {
        const left = node * 2;
        const right = left + 1;

        const minLeft = minTree[left];
        const minRight = minTree[right];
        const maxLeft = maxTree[left];
        const maxRight = maxTree[right];

        minTree[node] =
            minLeft < 0
                ? minRight
                : minRight < 0
                  ? minLeft
                  : shares[minLeft] <= shares[minRight]
                    ? minLeft
                    : minRight;

        maxTree[node] =
            maxLeft < 0
                ? maxRight
                : maxRight < 0
                  ? maxLeft
                  : shares[maxLeft] >= shares[maxRight]
                    ? maxLeft
                    : maxRight;
    }

    return {
        series,
        shares,
        selectedRenewable,
        smoothedShares,
        activeCarrierIndices,
        treeSize,
        minTree,
        maxTree,
    };
}

/**
 * Exakte Extremwerte im Indexbereich [from, to).
 * Das Ergebnisobjekt wird wiederverwendet.
 */
function queryExtremes(
    model: ChartModel,
    from: number,
    to: number,
    out: Extremes
): void {
    const { shares, minTree, maxTree, treeSize } = model;

    let left = from + treeSize;
    let right = to + treeSize;

    let minIndex = -1;
    let maxIndex = -1;

    while (left < right) {
        if (left % 2 === 1) {
            const candidateMin = minTree[left];
            const candidateMax = maxTree[left];

            if (
                candidateMin >= 0 &&
                (minIndex < 0 ||
                    shares[candidateMin] < shares[minIndex])
            ) {
                minIndex = candidateMin;
            }

            if (
                candidateMax >= 0 &&
                (maxIndex < 0 ||
                    shares[candidateMax] > shares[maxIndex])
            ) {
                maxIndex = candidateMax;
            }

            left += 1;
        }

        if (right % 2 === 1) {
            right -= 1;

            const candidateMin = minTree[right];
            const candidateMax = maxTree[right];

            if (
                candidateMin >= 0 &&
                (minIndex < 0 ||
                    shares[candidateMin] < shares[minIndex])
            ) {
                minIndex = candidateMin;
            }

            if (
                candidateMax >= 0 &&
                (maxIndex < 0 ||
                    shares[candidateMax] > shares[maxIndex])
            ) {
                maxIndex = candidateMax;
            }
        }

        left = Math.floor(left / 2);
        right = Math.floor(right / 2);
    }

    out.min = minIndex;
    out.max = maxIndex;
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    radius: number
) {
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
}

function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

const BUTTON_BASE_STYLE: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#1e293b",
    cursor: "pointer",
    lineHeight: 1.3,
};

const SELECT_STYLE: React.CSSProperties = {
    padding: "5px 8px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#1e293b",
};

const INPUT_STYLE: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#1e293b",
};

export default function SMARD_Erzeugung({
    csvUrl = `${import.meta.env.BASE_URL}SMARD_Erzeugung_2020_2026.csv`,
    applyGermanNuclearZeroRule = true,
    width = 900,
    height = 450,
    marginTop = 30,
    marginRight = 30,
    marginBottom = 60,
    marginLeft = 65,
}: SMARD_ErzeugungProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const resetZoomRef = useRef<(() => void) | null>(null);
    const zoomToRangeRef = useRef<
        ((fromMs: number, toMs: number) => void) | null
    >(null);
    const savedViewportRef = useRef<{
        min: number;
        max: number;
        isZoomed: boolean;
    } | null>(null);

    const [rawCsvText, setRawCsvText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [nuclearRuleEnabled, setNuclearRuleEnabled] = useState(
        applyGermanNuclearZeroRule
    );
    const [aggregation, setAggregation] =
        useState<AggregationLevel>("raw");
    const [smoothing, setSmoothing] =
        useState<SmoothingWindow>("none");
    const [viewMode, setViewMode] = useState<ChartViewMode>("line");
    const [selectedCarriers, setSelectedCarriers] = useState<
        Set<RenewableCarrierId>
    >(() => new Set(RENEWABLE_CARRIERS.map((c) => c.id)));

    const [rangeFromInput, setRangeFromInput] = useState("");
    const [rangeToInput, setRangeToInput] = useState("");
    const [rangeInputError, setRangeInputError] = useState<
        string | null
    >(null);

    const [viewportSummary, setViewportSummary] =
        useState<ViewportSummary | null>(null);

    useEffect(() => {
        setNuclearRuleEnabled(applyGermanNuclearZeroRule);
    }, [applyGermanNuclearZeroRule]);

    useEffect(() => {
        const controller = new AbortController();
        savedViewportRef.current = null;

        async function loadCsvText() {
            setLoading(true);
            setFetchError(null);
            setRawCsvText(null);
            setViewportSummary(null);

            try {
                const response = await fetch(csvUrl, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(
                        `CSV konnte nicht geladen werden: ` +
                            `HTTP ${response.status}`
                    );
                }

                const text = await response.text();

                if (!controller.signal.aborted) {
                    setRawCsvText(text);
                }
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setFetchError(
                        cause instanceof Error
                            ? cause.message
                            : "Unbekannter Fehler beim Laden der CSV."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        void loadCsvText();

        return () => controller.abort();
    }, [csvUrl]);

    const { rawData, parseError } = useMemo<{
        rawData: ParsedCsvData | null;
        parseError: string | null;
    }>(() => {
        if (rawCsvText === null) {
            return { rawData: null, parseError: null };
        }

        try {
            return {
                rawData: parseCsvToRawData(
                    rawCsvText,
                    nuclearRuleEnabled
                ),
                parseError: null,
            };
        } catch (cause) {
            return {
                rawData: null,
                parseError:
                    cause instanceof Error
                        ? cause.message
                        : "Unbekannter Fehler beim Verarbeiten der CSV.",
            };
        }
    }, [rawCsvText, nuclearRuleEnabled]);

    const aggregatedSeries = useMemo(() => {
        if (!rawData) return null;
        return aggregateSeries(rawData, aggregation);
    }, [rawData, aggregation]);

    const model = useMemo(() => {
        if (!aggregatedSeries) return null;
        return buildChartModel(
            aggregatedSeries,
            selectedCarriers,
            smoothing
        );
    }, [aggregatedSeries, selectedCarriers, smoothing]);

    const error = fetchError ?? parseError;

    const computeSummary = useCallback(
        (
            currentModel: ChartModel,
            visibleMin: number,
            visibleMax: number,
            zoomFactor: number
        ): ViewportSummary => {
            const { series, activeCarrierIndices } = currentModel;
            const {
                times,
                coverageEnds,
                prefixTotal,
                prefixAllRenewable,
                prefixCarriers,
            } = series;

            let visibleStart = lowerBound(times, visibleMin);
            const visibleEnd = upperBound(times, visibleMax);

            // Falls der sichtbare Bereich mitten in einem Intervall startet, Intervall einschließen.
            if (
                visibleStart > 0 &&
                coverageEnds[visibleStart - 1] > visibleMin
            ) {
                visibleStart -= 1;
            }

            const pointCount = Math.max(0, visibleEnd - visibleStart);
            const totalMwh =
                pointCount > 0
                    ? prefixTotal[visibleEnd] -
                      prefixTotal[visibleStart]
                    : 0;
            const allRenewableMwh =
                pointCount > 0
                    ? prefixAllRenewable[visibleEnd] -
                      prefixAllRenewable[visibleStart]
                    : 0;

            const carrierMwh = RENEWABLE_CARRIERS.map((_, cIdx) =>
                pointCount > 0
                    ? prefixCarriers[cIdx][visibleEnd] -
                      prefixCarriers[cIdx][visibleStart]
                    : 0
            );

            let selectedRenewableMwh = 0;
            for (const cIdx of activeCarrierIndices) {
                selectedRenewableMwh += carrierMwh[cIdx];
            }

            const weightedShare =
                totalMwh > 0
                    ? (selectedRenewableMwh / totalMwh) * 100
                    : 0;

            const carrierShareOfTotal = carrierMwh.map((val) =>
                totalMwh > 0 ? (val / totalMwh) * 100 : 0
            );

            let minShare: number | null = null;
            let minTime: number | null = null;
            let maxShare: number | null = null;
            let maxTime: number | null = null;

            if (pointCount > 0) {
                const ext: Extremes = { min: -1, max: -1 };
                queryExtremes(
                    currentModel,
                    visibleStart,
                    visibleEnd,
                    ext
                );

                if (ext.min >= 0) {
                    minShare = currentModel.shares[ext.min];
                    minTime = times[ext.min];
                }

                if (ext.max >= 0) {
                    maxShare = currentModel.shares[ext.max];
                    maxTime = times[ext.max];
                }
            }

            return {
                visibleMin,
                visibleMax,
                visibleStart,
                visibleEnd,
                zoomFactor,
                isZoomed: zoomFactor > 1.001,
                pointCount,
                weightedShare,
                selectedRenewableMwh,
                allRenewableMwh,
                totalMwh,
                minShare,
                minTime,
                maxShare,
                maxTime,
                carrierMwh,
                carrierShareOfTotal,
            };
        },
        []
    );

    useEffect(() => {
        const container = containerRef.current;
        const chartCanvas = chartCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;

        if (!model || !container || !chartCanvas || !overlayCanvas) {
            return;
        }

        const chartContext = chartCanvas.getContext("2d");
        const overlayContext = overlayCanvas.getContext("2d");

        if (!chartContext || !overlayContext) return;

        const {
            series,
            shares,
            selectedRenewable,
            smoothedShares,
            activeCarrierIndices,
        } = model;

        const {
            times,
            ends,
            coverageEnds,
            segmentIds,
            isolated,
            totals,
            renewableCarriers,
            nuclearFilled,
            count,
        } = series;

        let cssWidth = 1;
        let cssHeight = 1;

        let left = 0;
        let right = 1;
        let top = 0;
        let bottom = 1;
        let plotWidth = 1;
        let plotHeight = 1;

        let rasterScaleX = 1;
        let rasterScaleY = 1;

        let transform = d3.zoomIdentity;
        let disposed = false;
        let interacting = false;
        let initializedViewport = false;

        let animationFrame = 0;
        let summaryTimeout = 0;
        let lastSummaryTime = 0;
        let chartDirty = true;
        let overlayDirty = true;

        let mouse: { x: number; y: number } | null = null;

        let previousHoverIndex = -1;
        let previousHoverTransform = transform;

        const extrema: Extremes = { min: -1, max: -1 };
        const selectedIndices = [0, 0, 0, 0];
        const markerIndices: number[] = [];

        let domainMin = times[0];
        let domainMax = Math.max(
            times[count - 1],
            ends[count - 1]
        );

        if (domainMin === domainMax) {
            const padding = Math.max(
                (ends[0] - domainMin) / 2,
                30_000
            );
            domainMin -= padding;
            domainMax += padding;
        }

        const domainSpan = Math.max(1, domainMax - domainMin);
        const minZoomWindowMs = Math.min(
            domainSpan,
            2 * 3_600_000
        );
        const maxZoomFactor = Math.max(
            40,
            Math.ceil(domainSpan / Math.max(1, minZoomWindowMs))
        );

        const baseX = d3
            .scaleUtc()
            .domain([new Date(domainMin), new Date(domainMax)]);

        let x = baseX.copy();

        let visibleMin = domainMin;
        let visibleMax = domainMax;
        let pixelsPerMillisecond = 1;

        function xPosition(timestamp: number): number {
            return (
                left +
                (timestamp - visibleMin) * pixelsPerMillisecond
            );
        }

        function yPosition(share: number): number {
            return bottom - (clamp(share, 0, 100) / 100) * plotHeight;
        }

        function timeAtPixel(pixel: number): number {
            return (
                visibleMin + (pixel - left) / pixelsPerMillisecond
            );
        }

        function syncInputsToVisible() {
            setRangeFromInput(
                formatInputDateTime(
                    new Date(clamp(visibleMin, domainMin, domainMax))
                )
            );
            setRangeToInput(
                formatInputDateTime(
                    new Date(clamp(visibleMax, domainMin, domainMax))
                )
            );
            setRangeInputError(null);
        }

        function emitViewportSummary(syncDateInputs: boolean) {
            if (disposed) return;

            savedViewportRef.current = {
                min: visibleMin,
                max: visibleMax,
                isZoomed: transform.k > 1.001,
            };

            const nextSummary = computeSummary(
                model!,
                visibleMin,
                visibleMax,
                transform.k
            );
            setViewportSummary(nextSummary);

            if (syncDateInputs) {
                syncInputsToVisible();
            }
        }

        function scheduleSummaryUpdate(immediate: boolean) {
            if (disposed) return;

            if (summaryTimeout !== 0) {
                window.clearTimeout(summaryTimeout);
                summaryTimeout = 0;
            }

            const now = performance.now();

            if (immediate || now - lastSummaryTime >= 90) {
                lastSummaryTime = now;
                emitViewportSummary(immediate);
            } else {
                summaryTimeout = window.setTimeout(() => {
                    summaryTimeout = 0;
                    lastSummaryTime = performance.now();
                    emitViewportSummary(false);
                }, 90);
            }
        }

        function updateVisibleScale() {
            x = transform.rescaleX(baseX);
            const domain = x.domain();

            visibleMin = domain[0].getTime();
            visibleMax = domain[1].getTime();

            pixelsPerMillisecond =
                plotWidth / Math.max(1, visibleMax - visibleMin);
        }

        function prepareContext(
            context: CanvasRenderingContext2D,
            canvas: HTMLCanvasElement
        ) {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);

            context.setTransform(
                rasterScaleX,
                0,
                0,
                rasterScaleY,
                0,
                0
            );
        }

        function drawAxes() {
            const ctx = chartContext!;

            ctx.save();

            ctx.lineWidth = 1;
            ctx.strokeStyle = "#e5e7eb";
            ctx.beginPath();

            for (let value = 0; value <= 100; value += 20) {
                const py = yPosition(value);
                ctx.moveTo(left, py);
                ctx.lineTo(right, py);
            }

            ctx.stroke();

            ctx.strokeStyle = "#6b7280";
            ctx.beginPath();
            ctx.moveTo(left, top);
            ctx.lineTo(left, bottom);
            ctx.lineTo(right, bottom);
            ctx.stroke();

            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#6b7280";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (let value = 0; value <= 100; value += 20) {
                const py = yPosition(value);

                ctx.beginPath();
                ctx.moveTo(left - 6, py);
                ctx.lineTo(left, py);
                ctx.stroke();

                ctx.fillText(`${value} %`, left - 10, py);
            }

            const tickCount = Math.max(
                2,
                Math.min(10, Math.floor(plotWidth / 115))
            );

            const ticks = x.ticks(tickCount);

            ctx.font = `11px ${FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";

            for (const tick of ticks) {
                const px = xPosition(tick.getTime());

                if (px < left - 0.5 || px > right + 0.5) {
                    continue;
                }

                ctx.beginPath();
                ctx.moveTo(px, bottom);
                ctx.lineTo(px, bottom + 6);
                ctx.stroke();

                ctx.fillText(formatTime(tick), px, bottom + 20);
                ctx.fillText(formatTickDate(tick), px, bottom + 36);
            }

            ctx.restore();
        }

        function drawSmoothingLine(from: number, to: number) {
            if (!smoothedShares || from >= to) return;

            const ctx = chartContext!;
            const pixelBuckets = Math.max(1, Math.ceil(plotWidth));
            const step = Math.max(
                1,
                Math.floor((to - from) / (pixelBuckets * 2))
            );

            ctx.beginPath();
            let prevIdx = -1;

            for (let idx = from; idx < to; idx += step) {
                const px = xPosition(times[idx]);
                const py = yPosition(smoothedShares[idx]);

                if (
                    prevIdx < 0 ||
                    segmentIds[prevIdx] !== segmentIds[idx]
                ) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }

                prevIdx = idx;
            }

            if (prevIdx !== to - 1) {
                const lastIdx = to - 1;
                const px = xPosition(times[lastIdx]);
                const py = yPosition(smoothedShares[lastIdx]);

                if (
                    prevIdx < 0 ||
                    segmentIds[prevIdx] !== segmentIds[lastIdx]
                ) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }

            ctx.strokeStyle = "#dc2626";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        function drawLineSeries(
            visibleStart: number,
            visibleEnd: number,
            from: number,
            to: number
        ) {
            const ctx = chartContext!;
            markerIndices.length = 0;

            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = smoothedShares ? 1.6 : 2.4;
            ctx.globalAlpha = smoothedShares ? 0.55 : 1;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();

            let previousIndex = -1;

            function emit(index: number) {
                if (index < 0 || index === previousIndex) return;

                const px = xPosition(times[index]);
                const py = yPosition(shares[index]);

                if (
                    previousIndex < 0 ||
                    segmentIds[previousIndex] !== segmentIds[index]
                ) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }

                if (
                    (count <= 200 || isolated[index] === 1) &&
                    px >= left - 4 &&
                    px <= right + 4
                ) {
                    markerIndices.push(index);
                }

                previousIndex = index;
            }

            const pixelBuckets = Math.max(1, Math.ceil(plotWidth));

            if (to - from <= pixelBuckets * 2) {
                for (let index = from; index < to; index += 1) {
                    emit(index);
                }
            } else {
                if (from < visibleStart) {
                    emit(from);
                }

                let cursor = visibleStart;

                for (
                    let bucket = 0;
                    bucket < pixelBuckets && cursor < visibleEnd;
                    bucket += 1
                ) {
                    const bucketRight =
                        left +
                        ((bucket + 1) / pixelBuckets) * plotWidth;

                    const next =
                        bucket === pixelBuckets - 1
                            ? visibleEnd
                            : lowerBound(
                                  times,
                                  timeAtPixel(bucketRight),
                                  cursor,
                                  visibleEnd
                              );

                    if (next <= cursor) continue;

                    if (next - cursor <= 4) {
                        for (
                            let index = cursor;
                            index < next;
                            index += 1
                        ) {
                            emit(index);
                        }
                    } else {
                        queryExtremes(model!, cursor, next, extrema);

                        selectedIndices[0] = cursor;
                        selectedIndices[1] = extrema.min;
                        selectedIndices[2] = extrema.max;
                        selectedIndices[3] = next - 1;

                        for (let i = 1; i < 4; i += 1) {
                            const value = selectedIndices[i];
                            let j = i - 1;

                            while (
                                j >= 0 &&
                                selectedIndices[j] > value
                            ) {
                                selectedIndices[j + 1] =
                                    selectedIndices[j];
                                j -= 1;
                            }

                            selectedIndices[j + 1] = value;
                        }

                        for (let i = 0; i < 4; i += 1) {
                            emit(selectedIndices[i]);
                        }
                    }

                    cursor = next;
                }

                if (visibleEnd < to) {
                    emit(visibleEnd);
                }
            }

            ctx.stroke();
            ctx.globalAlpha = 1;

            if (markerIndices.length > 0) {
                ctx.beginPath();

                for (const index of markerIndices) {
                    const px = xPosition(times[index]);
                    const py = yPosition(shares[index]);

                    ctx.moveTo(px + 3.5, py);
                    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
                }

                ctx.fillStyle = "#2563eb";
                ctx.fill();

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        function drawStackedSeries(
            visibleStart: number,
            visibleEnd: number,
            from: number,
            to: number
        ) {
            const ctx = chartContext!;
            const activeCount = activeCarrierIndices.length;

            if (activeCount === 0) return;

            type StackSample = {
                px: number;
                segId: number;
                carrierShares: number[];
            };

            const samples: StackSample[] = [];
            const pixelBuckets = Math.max(1, Math.ceil(plotWidth));

            function pushExactSample(idx: number) {
                const tot = totals[idx];
                const carrierShares = activeCarrierIndices.map((cIdx) =>
                    tot > 0
                        ? (renewableCarriers[cIdx][idx] / tot) * 100
                        : 0
                );
                samples.push({
                    px: xPosition(times[idx]),
                    segId: segmentIds[idx],
                    carrierShares,
                });
            }

            if (to - from <= pixelBuckets * 2) {
                for (let idx = from; idx < to; idx += 1) {
                    pushExactSample(idx);
                }
            } else {
                if (from < visibleStart) {
                    pushExactSample(from);
                }

                let cursor = visibleStart;

                for (
                    let bucket = 0;
                    bucket < pixelBuckets && cursor < visibleEnd;
                    bucket += 1
                ) {
                    const bucketRight =
                        left +
                        ((bucket + 1) / pixelBuckets) * plotWidth;

                    const next =
                        bucket === pixelBuckets - 1
                            ? visibleEnd
                            : lowerBound(
                                  times,
                                  timeAtPixel(bucketRight),
                                  cursor,
                                  visibleEnd
                              );

                    if (next <= cursor) continue;

                    // Bei Segmentwechseln innerhalb eines Pixels sauber aufteilen.
                    let subStart = cursor;

                    while (subStart < next) {
                        const seg = segmentIds[subStart];
                        let subEnd = subStart + 1;

                        while (
                            subEnd < next &&
                            segmentIds[subEnd] === seg
                        ) {
                            subEnd += 1;
                        }

                        const sumTot =
                            series.prefixTotal[subEnd] -
                            series.prefixTotal[subStart];
                        const midTime =
                            (times[subStart] + times[subEnd - 1]) / 2;

                        const carrierShares = activeCarrierIndices.map(
                            (cIdx) =>
                                sumTot > 0
                                    ? ((series.prefixCarriers[cIdx][
                                          subEnd
                                      ] -
                                          series.prefixCarriers[cIdx][
                                              subStart
                                          ]) /
                                          sumTot) *
                                      100
                                    : 0
                        );

                        samples.push({
                            px: xPosition(midTime),
                            segId: seg,
                            carrierShares,
                        });

                        subStart = subEnd;
                    }

                    cursor = next;
                }

                if (visibleEnd < to) {
                    pushExactSample(visibleEnd);
                }
            }

            // Zusammenhängende Abschnitte einzeln stapeln.
            let runStart = 0;

            while (runStart < samples.length) {
                const seg = samples[runStart].segId;
                let runEnd = runStart + 1;

                while (
                    runEnd < samples.length &&
                    samples[runEnd].segId === seg
                ) {
                    runEnd += 1;
                }

                const runLen = runEnd - runStart;
                const cumulativePct = new Float64Array(runLen);
                const prevY = new Float64Array(runLen);
                prevY.fill(bottom);

                if (runLen === 1) {
                    const sample = samples[runStart];
                    let acc = 0;

                    for (let c = 0; c < activeCount; c += 1) {
                        const nextAcc = acc + sample.carrierShares[c];
                        const y0 = yPosition(acc);
                        const y1 = yPosition(nextAcc);
                        const color =
                            RENEWABLE_CARRIERS[
                                activeCarrierIndices[c]
                            ].color;

                        ctx.fillStyle = color;
                        ctx.fillRect(
                            sample.px - 2,
                            y1,
                            4,
                            Math.max(1, y0 - y1)
                        );
                        acc = nextAcc;
                    }
                } else {
                    for (let c = 0; c < activeCount; c += 1) {
                        const currY = new Float64Array(runLen);

                        for (let k = 0; k < runLen; k += 1) {
                            cumulativePct[k] +=
                                samples[runStart + k].carrierShares[c];
                            currY[k] = yPosition(cumulativePct[k]);
                        }

                        ctx.beginPath();
                        ctx.moveTo(
                            samples[runStart].px,
                            currY[0]
                        );

                        for (let k = 1; k < runLen; k += 1) {
                            ctx.lineTo(
                                samples[runStart + k].px,
                                currY[k]
                            );
                        }

                        for (let k = runLen - 1; k >= 0; k -= 1) {
                            ctx.lineTo(
                                samples[runStart + k].px,
                                prevY[k]
                            );
                        }

                        ctx.closePath();

                        const color =
                            RENEWABLE_CARRIERS[
                                activeCarrierIndices[c]
                            ].color;
                        ctx.fillStyle = color;
                        ctx.globalAlpha = 0.82;
                        ctx.fill();
                        ctx.globalAlpha = 1;

                        prevY.set(currY);
                    }

                    // Obere Abschlusslinie für klare Kontur.
                    ctx.beginPath();
                    ctx.moveTo(samples[runStart].px, prevY[0]);
                    for (let k = 1; k < runLen; k += 1) {
                        ctx.lineTo(
                            samples[runStart + k].px,
                            prevY[k]
                        );
                    }
                    ctx.strokeStyle = "#0f172a";
                    ctx.lineWidth = 1.3;
                    ctx.stroke();
                }

                runStart = runEnd;
            }
        }

        function drawSeries() {
            const ctx = chartContext!;

            const visibleStart = lowerBound(times, visibleMin);
            const visibleEnd = upperBound(times, visibleMax);

            const from = Math.max(0, visibleStart - 1);
            const to = Math.min(count, visibleEnd + 1);

            if (from >= to) return;

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            if (viewMode === "stacked") {
                drawStackedSeries(visibleStart, visibleEnd, from, to);
            } else {
                drawLineSeries(visibleStart, visibleEnd, from, to);
            }

            if (smoothedShares) {
                drawSmoothingLine(from, to);
            }

            ctx.restore();
        }

        function drawChart() {
            prepareContext(chartContext!, chartCanvas!);
            drawAxes();
            drawSeries();
        }

        function getHoverIndex(): number {
            if (!mouse || interacting) return -1;

            if (
                mouse.x < left ||
                mouse.x > right ||
                mouse.y < top ||
                mouse.y > bottom
            ) {
                return -1;
            }

            const timestamp = timeAtPixel(mouse.x);

            if (
                timestamp < times[0] ||
                timestamp >= coverageEnds[count - 1]
            ) {
                return -1;
            }

            const after = upperBound(times, timestamp);
            const before = after - 1;

            if (
                before >= 0 &&
                after < count &&
                timestamp >= coverageEnds[before] &&
                timestamp < times[after]
            ) {
                // Keine Tooltips in Datenlücken.
                return -1;
            }

            let index: number;

            if (before < 0) {
                index = 0;
            } else if (after >= count) {
                index = count - 1;
            } else if (
                aggregation !== "raw" &&
                timestamp < coverageEnds[before]
            ) {
                index = before;
            } else {
                index =
                    timestamp - times[before] <=
                    times[after] - timestamp
                        ? before
                        : after;
            }

            const px = xPosition(times[index]);

            return px >= left && px <= right ? index : -1;
        }

        function drawOverlay(force = false) {
            const index = getHoverIndex();

            if (
                !force &&
                index === previousHoverIndex &&
                previousHoverTransform === transform
            ) {
                return;
            }

            previousHoverIndex = index;
            previousHoverTransform = transform;

            const ctx = overlayContext!;

            prepareContext(ctx, overlayCanvas!);

            if (index < 0) return;

            const shareVal = shares[index];
            const px = xPosition(times[index]);
            const py = yPosition(shareVal);

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            ctx.strokeStyle = "#64748b";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);

            ctx.beginPath();
            ctx.moveTo(px, top);
            ctx.lineTo(px, bottom);
            ctx.moveTo(left, py);
            ctx.lineTo(right, py);
            ctx.stroke();

            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#2563eb";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();

            const hasSmoothing = smoothedShares !== null;
            const showBreakdown =
                viewMode === "stacked" ||
                activeCarrierIndices.length < RENEWABLE_CARRIERS.length;
            const breakdownRows = showBreakdown
                ? activeCarrierIndices.length
                : 0;
            const nucFilled = nuclearFilled[index] === 1;

            const tooltipWidth = Math.min(325, cssWidth - 16);
            const tooltipHeight =
                118 +
                (hasSmoothing ? 20 : 0) +
                (breakdownRows > 0 ? 10 + breakdownRows * 17 : 0) +
                (nucFilled ? 24 : 0);

            const preferredX =
                px + 14 + tooltipWidth > right
                    ? px - tooltipWidth - 14
                    : px + 14;

            const tooltipX = clamp(
                preferredX,
                8,
                Math.max(8, cssWidth - tooltipWidth - 8)
            );

            const tooltipY = clamp(
                py - tooltipHeight - 12,
                8,
                Math.max(8, cssHeight - tooltipHeight - 8)
            );

            ctx.save();
            ctx.translate(tooltipX, tooltipY);

            drawRoundedRect(ctx, tooltipWidth, tooltipHeight, 6);
            ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
            ctx.fill();

            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            const textWidth = Math.max(1, tooltipWidth - 24);

            let cursorY = 20;

            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#cbd5e1";
            ctx.fillText(
                `Von: ${formatDate(new Date(times[index]))}`,
                12,
                cursorY,
                textWidth
            );
            cursorY += 19;

            ctx.fillText(
                `Bis: ${formatDate(new Date(ends[index]))}`,
                12,
                cursorY,
                textWidth
            );
            cursorY += 23;

            ctx.font = `600 13px ${FONT}`;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(
                `Anteil: ${formatNumber.format(shareVal)} %`,
                12,
                cursorY,
                textWidth
            );
            cursorY += 20;

            if (hasSmoothing && smoothedShares) {
                ctx.font = `12px ${FONT}`;
                ctx.fillStyle = "#fca5a5";
                ctx.fillText(
                    `Gleitender Ø: ${formatNumber.format(
                        smoothedShares[index]
                    )} %`,
                    12,
                    cursorY,
                    textWidth
                );
                cursorY += 20;
            }

            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#cbd5e1";
            ctx.fillText(
                `Erneuerbar (Auswahl): ${formatNumber.format(
                    selectedRenewable[index]
                )} MWh`,
                12,
                cursorY,
                textWidth
            );
            cursorY += 20;

            ctx.fillText(
                `Gesamt: ${formatNumber.format(totals[index])} MWh`,
                12,
                cursorY,
                textWidth
            );
            cursorY += 16;

            if (breakdownRows > 0) {
                cursorY += 6;
                const tot = totals[index];

                for (let i = activeCarrierIndices.length - 1; i >= 0; i -= 1) {
                    const cIdx = activeCarrierIndices[i];
                    const meta = RENEWABLE_CARRIERS[cIdx];
                    const val = renewableCarriers[cIdx][index];
                    const pct = tot > 0 ? (val / tot) * 100 : 0;

                    ctx.fillStyle = meta.color;
                    ctx.fillRect(12, cursorY - 8, 8, 8);

                    ctx.font = `11px ${FONT}`;
                    ctx.fillStyle = "#e2e8f0";
                    ctx.fillText(
                        `${meta.label}: ${formatPercent.format(
                            pct
                        )} % (${formatNumber.format(val)} MWh)`,
                        25,
                        cursorY,
                        textWidth - 14
                    );
                    cursorY += 17;
                }
            }

            if (nucFilled) {
                cursorY += 6;
                ctx.font = `11px ${FONT}`;
                ctx.fillStyle = "#fbbf24";
                ctx.fillText(
                    'Kernenergie: „-“ als 0 MWh ergänzt',
                    12,
                    cursorY,
                    textWidth
                );
            }

            ctx.restore();
        }

        function scheduleDraw(redrawChart: boolean) {
            if (disposed) return;

            chartDirty = chartDirty || redrawChart;
            overlayDirty = true;

            if (animationFrame !== 0) return;

            animationFrame = requestAnimationFrame(() => {
                animationFrame = 0;

                if (disposed) return;

                const forceOverlay = chartDirty;

                if (chartDirty) {
                    chartDirty = false;
                    updateVisibleScale();
                    drawChart();
                }

                if (overlayDirty) {
                    overlayDirty = false;
                    drawOverlay(forceOverlay);
                }
            });
        }

        const selection = d3.select(overlayCanvas);

        const zoom = d3
            .zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([1, maxZoomFactor])
            .clickDistance(4)
            .filter((event: Event) => {
                const input = event as MouseEvent;

                if (input.button && event.type !== "wheel") {
                    return false;
                }

                if (input.ctrlKey && event.type !== "wheel") {
                    return false;
                }

                const [px, py] = d3.pointer(event, overlayCanvas);

                return (
                    px >= left &&
                    px <= right &&
                    py >= top &&
                    py <= bottom
                );
            })
            .on("start.chart", () => {
                interacting = true;
                mouse = null;
                scheduleDraw(false);
            })
            .on(
                "zoom.chart",
                (
                    event: d3.D3ZoomEvent<
                        HTMLCanvasElement,
                        unknown
                    >
                ) => {
                    transform = event.transform;
                    mouse = null;
                    updateVisibleScale();
                    scheduleDraw(true);
                    scheduleSummaryUpdate(false);
                }
            )
            .on("end.chart", () => {
                interacting = false;
                scheduleSummaryUpdate(true);
            });

        function buildTransformForRange(
            fromMs: number,
            toMs: number
        ): d3.ZoomTransform {
            const clampedFrom = clamp(fromMs, domainMin, domainMax);
            const clampedTo = clamp(toMs, domainMin, domainMax);

            if (
                clampedTo - clampedFrom >= domainSpan * 0.999 ||
                clampedTo <= clampedFrom
            ) {
                return d3.zoomIdentity;
            }

            const x0 = baseX(new Date(clampedFrom));
            const x1 = baseX(new Date(clampedTo));
            const rawK = plotWidth / Math.max(1e-6, x1 - x0);
            const k = clamp(rawK, 1, maxZoomFactor);

            const centerPx = (x0 + x1) / 2;
            const desiredTx = (left + right) / 2 - k * centerPx;
            const tx = clamp(
                desiredTx,
                right * (1 - k),
                left * (1 - k)
            );

            return d3.zoomIdentity
                .translate(tx, top * (1 - k))
                .scale(k);
        }

        function zoomToRange(fromMs: number, toMs: number) {
            if (disposed) return;

            mouse = null;
            const nextTransform = buildTransformForRange(fromMs, toMs);
            selection.call(zoom.transform, nextTransform);
            scheduleSummaryUpdate(true);
        }

        function resetZoom() {
            if (disposed) return;

            mouse = null;
            savedViewportRef.current = null;
            selection.call(zoom.transform, d3.zoomIdentity);
            scheduleSummaryUpdate(true);
        }

        resetZoomRef.current = resetZoom;
        zoomToRangeRef.current = zoomToRange;

        function handleDoubleClick(event: MouseEvent) {
            event.preventDefault();
            resetZoom();
        }

        selection.call(zoom);

        selection
            .on("dblclick.zoom", null)
            .on("dblclick.reset", handleDoubleClick);

        function handlePointerMove(event: PointerEvent) {
            if (
                event.pointerType === "touch" ||
                event.buttons !== 0 ||
                interacting
            ) {
                if (mouse) {
                    mouse = null;
                    scheduleDraw(false);
                }

                return;
            }

            const [px, py] = d3.pointer(event, overlayCanvas);

            mouse = { x: px, y: py };
            scheduleDraw(false);
        }

        function handlePointerLeave() {
            mouse = null;
            scheduleDraw(false);
        }

        overlayCanvas.addEventListener(
            "pointermove",
            handlePointerMove,
            { passive: true }
        );

        overlayCanvas.addEventListener(
            "pointerleave",
            handlePointerLeave,
            { passive: true }
        );

        function resize() {
            if (disposed) return;

            const bounds = container!.getBoundingClientRect();

            const nextWidth = Math.max(1, bounds.width);
            const nextHeight = Math.max(1, bounds.height);

            const dpr = Math.min(
                2,
                Math.max(1, window.devicePixelRatio || 1)
            );

            const pixelWidth = Math.max(
                1,
                Math.round(nextWidth * dpr)
            );
            const pixelHeight = Math.max(
                1,
                Math.round(nextHeight * dpr)
            );

            if (
                cssWidth === nextWidth &&
                cssHeight === nextHeight &&
                chartCanvas!.width === pixelWidth &&
                chartCanvas!.height === pixelHeight
            ) {
                return;
            }

            const oldCenter = (visibleMin + visibleMax) / 2;

            cssWidth = nextWidth;
            cssHeight = nextHeight;

            left = Math.min(
                Math.max(0, marginLeft),
                cssWidth * 0.35
            );

            right =
                cssWidth -
                Math.min(
                    Math.max(0, marginRight),
                    cssWidth * 0.2
                );

            top = Math.min(
                Math.max(0, marginTop),
                cssHeight * 0.2
            );

            bottom =
                cssHeight -
                Math.min(
                    Math.max(0, marginBottom),
                    cssHeight * 0.35
                );

            plotWidth = Math.max(1, right - left);
            plotHeight = Math.max(1, bottom - top);

            rasterScaleX = pixelWidth / cssWidth;
            rasterScaleY = pixelHeight / cssHeight;

            for (const canvas of [chartCanvas!, overlayCanvas!]) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }

            baseX.range([left, right]);

            zoom
                .extent([
                    [left, top],
                    [right, bottom],
                ])
                .translateExtent([
                    [left, top],
                    [right, bottom],
                ]);

            let nextTransform: d3.ZoomTransform;

            if (!initializedViewport) {
                initializedViewport = true;

                if (savedViewportRef.current?.isZoomed) {
                    nextTransform = buildTransformForRange(
                        savedViewportRef.current.min,
                        savedViewportRef.current.max
                    );
                } else {
                    nextTransform = d3.zoomIdentity;
                }
            } else {
                const k = transform.k;
                const desiredTranslation =
                    (left + right) / 2 -
                    k * baseX(new Date(oldCenter));
                const translation = clamp(
                    desiredTranslation,
                    right * (1 - k),
                    left * (1 - k)
                );

                nextTransform = d3.zoomIdentity
                    .translate(translation, top * (1 - k))
                    .scale(k);
            }

            mouse = null;

            selection.call(zoom.transform, nextTransform);
            scheduleDraw(true);
            scheduleSummaryUpdate(true);
        }

        const resizeObserver = new ResizeObserver(resize);

        resizeObserver.observe(container);
        window.addEventListener("resize", resize, { passive: true });

        resize();

        return () => {
            disposed = true;

            if (animationFrame !== 0) {
                cancelAnimationFrame(animationFrame);
            }

            if (summaryTimeout !== 0) {
                window.clearTimeout(summaryTimeout);
            }

            resizeObserver.disconnect();
            window.removeEventListener("resize", resize);

            overlayCanvas.removeEventListener(
                "pointermove",
                handlePointerMove
            );

            overlayCanvas.removeEventListener(
                "pointerleave",
                handlePointerLeave
            );

            selection.on(".zoom", null);
            selection.on(".reset", null);

            zoom.on(".chart", null);

            if (resetZoomRef.current === resetZoom) {
                resetZoomRef.current = null;
            }

            if (zoomToRangeRef.current === zoomToRange) {
                zoomToRangeRef.current = null;
            }
        };
    }, [
        model,
        viewMode,
        aggregation,
        computeSummary,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
    ]);

    const handleToggleCarrier = (id: RenewableCarrierId) => {
        setSelectedCarriers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size === 1) {
                    // Mindestens ein Energieträger bleibt aktiv.
                    return prev;
                }
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectOnlyCarrier = (id: RenewableCarrierId) => {
        setSelectedCarriers(new Set([id]));
    };

    const handleSelectAllCarriers = () => {
        setSelectedCarriers(
            new Set(RENEWABLE_CARRIERS.map((c) => c.id))
        );
    };

    const handleQuickPreset = (durationMs: number | "all") => {
        if (!rawData) return;

        if (durationMs === "all") {
            resetZoomRef.current?.();
            return;
        }

        const endMs = rawData.ends[rawData.count - 1];
        const startMs = Math.max(
            rawData.starts[0],
            endMs - durationMs
        );
        zoomToRangeRef.current?.(startMs, endMs);
    };

    const handleYearPreset = (year: number) => {
        const startMs = Date.UTC(year, 0, 1, 0, 0);
        const endMs = Date.UTC(year + 1, 0, 1, 0, 0);
        zoomToRangeRef.current?.(startMs, endMs);
    };

    const handleApplyCustomRange = (event: FormEvent) => {
        event.preventDefault();

        const fromDate =
            parseInputDateTime(rangeFromInput) ??
            parseInputDateTimeSec(rangeFromInput);
        const toDate =
            parseInputDateTime(rangeToInput) ??
            parseInputDateTimeSec(rangeToInput);

        if (!fromDate || !toDate) {
            setRangeInputError(
                "Bitte gültiges Start- und Enddatum angeben."
            );
            return;
        }

        const fromMs = fromDate.getTime();
        const toMs = toDate.getTime();

        if (toMs <= fromMs) {
            setRangeInputError(
                "Das Enddatum muss nach dem Startdatum liegen."
            );
            return;
        }

        setRangeInputError(null);
        zoomToRangeRef.current?.(fromMs, toMs);
    };

    const handleFocusTimestamp = (timestamp: number | null) => {
        if (timestamp === null || !rawData) return;

        const currentSpan = viewportSummary
            ? viewportSummary.visibleMax - viewportSummary.visibleMin
            : 7 * 86_400_000;
        const targetSpan = Math.min(currentSpan, 48 * 3_600_000);
        zoomToRangeRef.current?.(
            timestamp - targetSpan / 2,
            timestamp + targetSpan / 2
        );
    };

    const handleExportPng = () => {
        const chartCanvas = chartCanvasRef.current;
        if (!chartCanvas || !model || !viewportSummary) return;

        const headerPx = Math.round(74 * (chartCanvas.width / Math.max(1, chartCanvas.clientWidth || width)));
        const scale = chartCanvas.width / Math.max(1, chartCanvas.clientWidth || width);

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = chartCanvas.width;
        exportCanvas.height = chartCanvas.height + headerPx;

        const ctx = exportCanvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        ctx.save();
        ctx.scale(scale, scale);

        ctx.fillStyle = "#0f172a";
        ctx.font = `600 15px ${FONT}`;
        ctx.fillText(
            "Anteil erneuerbarer Energien an der Stromerzeugung",
            16,
            24
        );

        const aggLabel =
            AGGREGATION_OPTIONS.find((o) => o.value === aggregation)
                ?.label ?? aggregation;

        ctx.fillStyle = "#475569";
        ctx.font = `12px ${FONT}`;
        ctx.fillText(
            `Zeitraum: ${formatDate(
                new Date(viewportSummary.visibleMin)
            )} – ${formatDate(
                new Date(viewportSummary.visibleMax)
            )} | Auflösung: ${aggLabel} | Ø Anteil: ${formatPercent.format(
                viewportSummary.weightedShare
            )} %`,
            16,
            44
        );

        // Farb-Legende aktiver Energieträger.
        let legendX = 16;
        ctx.font = `11px ${FONT}`;

        for (const cIdx of model.activeCarrierIndices) {
            const meta = RENEWABLE_CARRIERS[cIdx];
            ctx.fillStyle = meta.color;
            ctx.fillRect(legendX, 54, 9, 9);
            legendX += 13;

            ctx.fillStyle = "#334155";
            ctx.fillText(meta.label, legendX, 62);
            legendX += ctx.measureText(meta.label).width + 14;
        }

        ctx.restore();
        ctx.drawImage(chartCanvas, 0, headerPx);

        const fromTag = formatFileDate(
            new Date(viewportSummary.visibleMin)
        );
        const toTag = formatFileDate(
            new Date(viewportSummary.visibleMax)
        );
        const filename = `ist-analyse_${fromTag}_bis_${toTag}.png`;

        exportCanvas.toBlob((blob) => {
            if (blob) {
                triggerBlobDownload(blob, filename);
            }
        }, "image/png");
    };

    const handleExportCsv = () => {
        if (!model || !viewportSummary) return;

        const { series, shares, selectedRenewable, smoothedShares } =
            model;
        const from = clamp(
            viewportSummary.visibleStart,
            0,
            series.count
        );
        const to = clamp(
            viewportSummary.visibleEnd,
            from,
            series.count
        );

        const aggLabel =
            AGGREGATION_OPTIONS.find((o) => o.value === aggregation)
                ?.label ?? aggregation;

        const headers = [
            "Datum von",
            "Datum bis",
            "Auflösung",
            "Anteil Auswahl [%]",
            ...(smoothedShares ? ["Gleitender Durchschnitt [%]"] : []),
            "Erneuerbar Auswahl [MWh]",
            "Erneuerbar Gesamt [MWh]",
            "Gesamterzeugung [MWh]",
            ...RENEWABLE_CARRIERS.map((c) => `${c.label} [MWh]`),
            "Kernenergie als 0 ergänzt",
        ];

        const lines: string[] = [headers.join(";")];

        for (let i = from; i < to; i += 1) {
            const row = [
                formatDate(new Date(series.times[i])),
                formatDate(new Date(series.ends[i])),
                aggLabel,
                formatCsvDecimal(shares[i]),
                ...(smoothedShares
                    ? [formatCsvDecimal(smoothedShares[i])]
                    : []),
                formatCsvDecimal(selectedRenewable[i]),
                formatCsvDecimal(series.allRenewable[i]),
                formatCsvDecimal(series.totals[i]),
                ...RENEWABLE_CARRIERS.map((c) =>
                    formatCsvDecimal(
                        series.renewableCarriers[c.index][i]
                    )
                ),
                series.nuclearFilled[i] === 1 ? "Ja" : "Nein",
            ];

            lines.push(row.join(";"));
        }

        // UTF-8 BOM für korrekte Umlaute in Excel.
        const csvContent = `\uFEFF${lines.join("\r\n")}`;
        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8",
        });

        const fromTag = formatFileDate(
            new Date(viewportSummary.visibleMin)
        );
        const toTag = formatFileDate(
            new Date(viewportSummary.visibleMax)
        );

        triggerBlobDownload(
            blob,
            `ist-analyse_${aggregation}_${fromTag}_bis_${toTag}.csv`
        );
    };

        const allCarriersSelected =
        selectedCarriers.size === RENEWABLE_CARRIERS.length;

    return (
        <div className="content-body" style={{ fontFamily: FONT, color: "#0f172a" }}>
            {/* Kopfbereich & Export-Aktionen */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <h2 style={{ margin: 0 }}>
                    Anteil erneuerbarer Energien an der Stromerzeugung
                </h2>

                {model && !loading && !error && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                            type="button"
                            onClick={handleExportPng}
                            style={BUTTON_BASE_STYLE}
                        >
                            PNG speichern
                        </button>
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={!viewportSummary || viewportSummary.pointCount === 0}
                            style={{
                                ...BUTTON_BASE_STYLE,
                                opacity:
                                    !viewportSummary || viewportSummary.pointCount === 0
                                        ? 0.5
                                        : 1,
                            }}
                        >
                            Ausschnitt als CSV
                        </button>
                    </div>
                )}
            </div>

            {loading && <p role="status">CSV-Daten werden geladen …</p>}

            {error && (
                <p
                    role="alert"
                    style={{
                        color: "#dc2626",
                        overflowWrap: "anywhere",
                        padding: "10px 12px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                    }}
                >
                    {error}
                </p>
            )}

            {rawData && model && !loading && !error && (
                <>
                    {/* Toolbar: Datenqualitäts-Hinweise, Kernenergie-Regel & Zoom-Reset */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px 16px",
                            padding: "8px 12px",
                            marginBottom: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <span
                                style={{
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    fontWeight: 600,
                                }}
                            >
                                {rawData.count.toLocaleString("de-DE")} Roh-Messwerte (
                                {formatDate(new Date(rawData.starts[0]))} –{" "}
                                {formatDate(new Date(rawData.ends[rawData.count - 1]))})
                            </span>

                            {rawData.skippedRows > 0 && (
                                <span
                                    style={{
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        background: "#fef3c7",
                                        color: "#92400e",
                                    }}
                                    title="Zeilen mit unvollständigen Erzeugungswerten wurden übersprungen"
                                >
                                    {rawData.skippedRows.toLocaleString("de-DE")} Zeilen mit Lücken übersprungen
                                </span>
                            )}

                            {rawData.filledNuclearRows > 0 && (
                                <span
                                    style={{
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        background: "#fef9c3",
                                        color: "#854d0e",
                                    }}
                                >
                                    {rawData.filledNuclearRows.toLocaleString("de-DE")}× Kernenergie „-“ = 0 MWh
                                </span>
                            )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                            <label
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    cursor: "pointer",
                                    color: "#334155",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={nuclearRuleEnabled}
                                    onChange={(e) => setNuclearRuleEnabled(e.target.checked)}
                                />
                                Kernenergie „-“ ab 30.01.2024 als 0 MWh
                            </label>

                            <button
                                type="button"
                                onClick={() => resetZoomRef.current?.()}
                                disabled={!viewportSummary?.isZoomed}
                                style={{
                                    ...BUTTON_BASE_STYLE,
                                    fontWeight: 600,
                                    background: viewportSummary?.isZoomed ? "#eff6ff" : "#f1f5f9",
                                    borderColor: viewportSummary?.isZoomed ? "#93c5fd" : "#cbd5e1",
                                    color: viewportSummary?.isZoomed ? "#1d4ed8" : "#94a3b8",
                                    cursor: viewportSummary?.isZoomed ? "pointer" : "default",
                                }}
                                title="Alternativ Doppelklick ins Diagramm"
                            >
                                Zoom zurücksetzen
                                {viewportSummary?.isZoomed
                                    ? ` (${formatNumber.format(viewportSummary.zoomFactor)}×)`
                                    : ""}
                            </button>
                        </div>
                    </div>

                    {/* Zeitraum-Schnellfilter, Aggregation, Glättung & Ansichtsmodus */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "10px 16px",
                            marginBottom: 12,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                            <span style={{ fontSize: 12, color: "#475569", marginRight: 2 }}>
                                Zeitraum:
                            </span>
                            <button
                                type="button"
                                onClick={() => handleQuickPreset(7 * 86_400_000)}
                                style={BUTTON_BASE_STYLE}
                            >
                                7 Tage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickPreset(30 * 86_400_000)}
                                style={BUTTON_BASE_STYLE}
                            >
                                30 Tage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickPreset(90 * 86_400_000)}
                                style={BUTTON_BASE_STYLE}
                            >
                                90 Tage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickPreset(365 * 86_400_000)}
                                style={BUTTON_BASE_STYLE}
                            >
                                1 Jahr
                            </button>
                            {rawData.availableYears.length > 1 &&
                                rawData.availableYears.map((yr) => (
                                    <button
                                        key={yr}
                                        type="button"
                                        onClick={() => handleYearPreset(yr)}
                                        style={BUTTON_BASE_STYLE}
                                    >
                                        {yr}
                                    </button>
                                ))}
                            <button
                                type="button"
                                onClick={() => handleQuickPreset("all")}
                                style={BUTTON_BASE_STYLE}
                            >
                                Gesamt
                            </button>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
                                Auflösung:
                                <select
                                    value={aggregation}
                                    onChange={(e) => setAggregation(e.target.value as AggregationLevel)}
                                    style={SELECT_STYLE}
                                >
                                    {AGGREGATION_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
                                Glättung:
                                <select
                                    value={smoothing}
                                    onChange={(e) => setSmoothing(e.target.value as SmoothingWindow)}
                                    style={SELECT_STYLE}
                                >
                                    {SMOOTHING_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
                                Ansicht:
                                <select
                                    value={viewMode}
                                    onChange={(e) => setViewMode(e.target.value as ChartViewMode)}
                                    style={SELECT_STYLE}
                                >
                                    <option value="line">Linie (Auswahl gesamt)</option>
                                    <option value="stacked">Gestapelte Fläche (Energieträger)</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    {/* Manuelle Zeitraum-Eingabe (Von / Bis) */}
                    <form
                        onSubmit={handleApplyCustomRange}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 12,
                            fontSize: 12,
                        }}
                    >
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569" }}>
                            Von:
                            <input
                                type="datetime-local"
                                value={rangeFromInput}
                                onChange={(e) => setRangeFromInput(e.target.value)}
                                style={INPUT_STYLE}
                            />
                        </label>

                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569" }}>
                            Bis:
                            <input
                                type="datetime-local"
                                value={rangeToInput}
                                onChange={(e) => setRangeToInput(e.target.value)}
                                style={INPUT_STYLE}
                            />
                        </label>

                        <button type="submit" style={BUTTON_BASE_STYLE}>
                            Zeitraum anwenden
                        </button>

                        {rangeInputError && (
                            <span style={{ color: "#dc2626" }}>{rangeInputError}</span>
                        )}
                    </form>

                    {/* KPI-Übersicht für den aktuell sichtbaren Ausschnitt */}
                    {viewportSummary && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                                gap: 10,
                                marginBottom: 12,
                            }}
                        >
                            <div
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #bfdbfe",
                                    background: "#eff6ff",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#1e40af", marginBottom: 2 }}>
                                    Ø Anteil im Ausschnitt (gewichtet)
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#1d4ed8" }}>
                                    {formatPercent.format(viewportSummary.weightedShare)} %
                                </div>
                                <div style={{ fontSize: 11, color: "#475569" }}>
                                    {viewportSummary.pointCount.toLocaleString("de-DE")} Intervalle sichtbar
                                </div>
                            </div>

                            <div
                                onClick={() => handleFocusTimestamp(viewportSummary.minTime)}
                                title="Klicken, um das Minimum im Diagramm zu fokussieren"
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                    cursor: viewportSummary.minTime !== null ? "pointer" : "default",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                                    Minimum im Ausschnitt
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>
                                    {viewportSummary.minShare !== null
                                        ? `${formatPercent.format(viewportSummary.minShare)} %`
                                        : "–"}
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>
                                    {viewportSummary.minTime !== null
                                        ? formatDate(new Date(viewportSummary.minTime))
                                        : "Keine Daten"}
                                </div>
                            </div>

                            <div
                                onClick={() => handleFocusTimestamp(viewportSummary.maxTime)}
                                title="Klicken, um das Maximum im Diagramm zu fokussieren"
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                    cursor: viewportSummary.maxTime !== null ? "pointer" : "default",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                                    Maximum im Ausschnitt
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>
                                    {viewportSummary.maxShare !== null
                                        ? `${formatPercent.format(viewportSummary.maxShare)} %`
                                        : "–"}
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>
                                    {viewportSummary.maxTime !== null
                                        ? formatDate(new Date(viewportSummary.maxTime))
                                        : "Keine Daten"}
                                </div>
                            </div>

                            <div
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                                    Erzeugung im Ausschnitt
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f766e" }}>
                                    {formatEnergyAuto(viewportSummary.selectedRenewableMwh)}{" "}
                                    <span style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>
                                        Erneuerbar (Auswahl)
                                    </span>
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>
                                    von {formatEnergyAuto(viewportSummary.totalMwh)} Gesamterzeugung
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filter-Chips nach Energieträgern inkl. Einzelanteil im Ausschnitt */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 12,
                        }}
                    >
                        <span style={{ fontSize: 12, color: "#475569" }}>
                            Energieträger (Doppelklick = einzeln):
                        </span>

                        {RENEWABLE_CARRIERS.map((carrier) => {
                            const active = selectedCarriers.has(carrier.id);
                            const sharePct =
                                viewportSummary?.carrierShareOfTotal[carrier.index] ?? 0;

                            return (
                                <button
                                    key={carrier.id}
                                    type="button"
                                    onClick={() => handleToggleCarrier(carrier.id)}
                                    onDoubleClick={() => handleSelectOnlyCarrier(carrier.id)}
                                    aria-pressed={active}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "4px 10px",
                                        fontSize: 12,
                                        fontFamily: FONT,
                                        borderRadius: 999,
                                        border: `1px solid ${active ? carrier.color : "#cbd5e1"}`,
                                        background: active ? "#ffffff" : "#f8fafc",
                                        color: active ? "#0f172a" : "#94a3b8",
                                        opacity: active ? 1 : 0.65,
                                        cursor: "pointer",
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 9,
                                            height: 9,
                                            borderRadius: "50%",
                                            background: active ? carrier.color : "#cbd5e1",
                                            display: "inline-block",
                                        }}
                                    />
                                    <span>{carrier.label}</span>
                                    <strong
                                        style={{
                                            fontSize: 11,
                                            color: active ? "#334155" : "#94a3b8",
                                        }}
                                    >
                                        {formatPercent.format(sharePct)} %
                                    </strong>
                                </button>
                            );
                        })}

                        {!allCarriersSelected && (
                            <button
                                type="button"
                                onClick={handleSelectAllCarriers}
                                style={{
                                    ...BUTTON_BASE_STYLE,
                                    borderRadius: 999,
                                    color: "#2563eb",
                                    borderColor: "#93c5fd",
                                }}
                            >
                                Alle auswählen
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* Dual-Canvas-Diagramm */}
            <div
                ref={containerRef}
                className="chart-container"
                aria-busy={loading}
                style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
                    minHeight: 260,
                    overflow: "hidden",
                    contain: "layout paint",
                }}
            >
                <canvas
                    ref={chartCanvasRef}
                    role="img"
                    aria-label="Anteil erneuerbarer Energien an der Stromerzeugung im Zeitverlauf in Prozent"
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "block",
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                    }}
                >
                    Zeitdiagramm des Anteils erneuerbarer Energien an der Stromerzeugung in Prozent.
                </canvas>

                <canvas
                    ref={overlayCanvasRef}
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "block",
                        width: "100%",
                        height: "100%",
                        cursor: model ? "crosshair" : "default",
                        touchAction: "none",
                    }}
                />

                {!model && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "#ffffff",
                            pointerEvents: "none",
                        }}
                    />
                )}
            </div>
        </div>
    );
}
