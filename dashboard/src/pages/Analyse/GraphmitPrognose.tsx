import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

type IstAnalyseProps = {
    csvUrl?: string;
    forecastCsvUrl?: string;
    actualMetric?: "renewable" | "total";
    applyGermanNuclearZeroRule?: boolean;
    forecastIntervalMinutes?: number;
    width?: number;
    height?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
};

type DataPoint = {
    start: Date;
    end: Date;
    value: number;
    nuclearWasFilled: boolean;
};

type SeriesModel = {
    points: DataPoint[];
    times: Float64Array;
    segmentIds: Uint32Array;
    isolated: Uint8Array;
    treeSize: number;
    minTree: Int32Array;
    maxTree: Int32Array;
    maxValue: number;
    skippedRows: number;
    filledNuclearRows: number;
};

type LoadState = {
    model: SeriesModel | null;
    loading: boolean;
    error: string | null;
};

type Extremes = {
    min: number;
    max: number;
};

type DrawableSeries = {
    model: SeriesModel;
    label: string;
    color: string;
    dashed: boolean;
};

type HoverPoint = {
    series: DrawableSeries;
    index: number;
    x: number;
    y: number;
};

const RENEWABLE_COLUMNS = [
    "Biomasse [MWh] Originalauflösungen",
    "Wasserkraft [MWh] Originalauflösungen",
    "Wind Offshore [MWh] Originalauflösungen",
    "Wind Onshore [MWh] Originalauflösungen",
    "Photovoltaik [MWh] Originalauflösungen",
    "Sonstige Erneuerbare [MWh] Originalauflösungen",
];

const OTHER_COLUMNS = [
    "Kernenergie [MWh] Originalauflösungen",
    "Braunkohle [MWh] Originalauflösungen",
    "Steinkohle [MWh] Originalauflösungen",
    "Erdgas [MWh] Originalauflösungen",
    "Pumpspeicher [MWh] Originalauflösungen",
    "Sonstige Konventionelle [MWh] Originalauflösungen",
];

const ALL_ENERGY_COLUMNS = [
    ...RENEWABLE_COLUMNS,
    ...OTHER_COLUMNS,
];

const NUCLEAR_COLUMN = "Kernenergie [MWh] Originalauflösungen";

// Datenquellenspezifische Annahme.
// Kein Datum des deutschen Atomausstiegs.
const NUCLEAR_MISSING_FROM = Date.UTC(2024, 0, 30, 12, 30);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ACTUAL_COLOR = "#2563eb";
const FORECAST_COLOR = "#c2410c";

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// CSV-Uhrzeiten unverändert darstellen.
// Keine Umrechnung tatsächlicher lokaler Messzeitpunkte nach UTC.
const parseActualDate = d3.utcParse("%d.%m.%Y %H:%M");
const formatActualDate = d3.utcFormat("%d.%m.%Y %H:%M");

const parseForecastDate = d3.utcParse("%Y-%m-%d %H:%M:%S");
const formatForecastDate = d3.utcFormat("%Y-%m-%d %H:%M:%S");

const formatTime = d3.utcFormat("%H:%M");
const formatTickDate = d3.utcFormat("%d.%m.%y");

const formatNumber = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
});

const formatAxisNumber = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
});

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
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

function buildModel(
    points: DataPoint[],
    skippedRows = 0,
    filledNuclearRows = 0
): SeriesModel {
    if (points.length === 0) {
        throw new Error("Keine auswertbaren Daten vorhanden.");
    }

    points.sort(
        (a, b) => a.start.getTime() - b.start.getTime()
    );

    const count = points.length;
    const times = new Float64Array(count);
    const segmentIds = new Uint32Array(count);
    const isolated = new Uint8Array(count);

    let segmentId = 0;
    let maxValue = 0;

    for (let index = 0; index < count; index += 1) {
        const point = points[index];

        times[index] = point.start.getTime();
        maxValue = Math.max(maxValue, point.value);

        if (
            index > 0 &&
            times[index] > points[index - 1].end.getTime()
        ) {
            segmentId += 1;
        }

        segmentIds[index] = segmentId;
    }

    for (let index = 0; index < count; index += 1) {
        const hasPrevious =
            index > 0 &&
            segmentIds[index - 1] === segmentIds[index];

        const hasNext =
            index + 1 < count &&
            segmentIds[index + 1] === segmentIds[index];

        isolated[index] = !hasPrevious && !hasNext ? 1 : 0;
    }

    let treeSize = 1;

    while (treeSize < count) {
        treeSize *= 2;
    }

    const minTree = new Int32Array(treeSize * 2);
    const maxTree = new Int32Array(treeSize * 2);

    minTree.fill(-1);
    maxTree.fill(-1);

    for (let index = 0; index < count; index += 1) {
        minTree[treeSize + index] = index;
        maxTree[treeSize + index] = index;
    }

    function choose(
        first: number,
        second: number,
        minimum: boolean
    ): number {
        if (first < 0) return second;
        if (second < 0) return first;

        if (minimum) {
            return points[first].value <= points[second].value
                ? first
                : second;
        }

        return points[first].value >= points[second].value
            ? first
            : second;
    }

    for (let node = treeSize - 1; node > 0; node -= 1) {
        minTree[node] = choose(
            minTree[node * 2],
            minTree[node * 2 + 1],
            true
        );

        maxTree[node] = choose(
            maxTree[node * 2],
            maxTree[node * 2 + 1],
            false
        );
    }

    return {
        points,
        times,
        segmentIds,
        isolated,
        treeSize,
        minTree,
        maxTree,
        maxValue,
        skippedRows,
        filledNuclearRows,
    };
}

function queryExtremes(
    model: SeriesModel,
    from: number,
    to: number,
    out: Extremes
): void {
    const { points, minTree, maxTree, treeSize } = model;

    let left = from + treeSize;
    let right = to + treeSize;
    let minIndex = -1;
    let maxIndex = -1;

    function visit(node: number) {
        const candidateMin = minTree[node];
        const candidateMax = maxTree[node];

        if (
            candidateMin >= 0 &&
            (
                minIndex < 0 ||
                points[candidateMin].value < points[minIndex].value
            )
        ) {
            minIndex = candidateMin;
        }

        if (
            candidateMax >= 0 &&
            (
                maxIndex < 0 ||
                points[candidateMax].value > points[maxIndex].value
            )
        ) {
            maxIndex = candidateMax;
        }
    }

    while (left < right) {
        if (left % 2 === 1) {
            visit(left);
            left += 1;
        }

        if (right % 2 === 1) {
            right -= 1;
            visit(right);
        }

        left = Math.floor(left / 2);
        right = Math.floor(right / 2);
    }

    out.min = minIndex;
    out.max = maxIndex;
}

function parseActualCsv(
    text: string,
    metric: "renewable" | "total",
    applyGermanNuclearZeroRule: boolean
): SeriesModel {
    const rows = d3.dsvFormat(";").parse(
        text.replace(/^\uFEFF/, "")
    );

    const valueColumns =
        metric === "total"
            ? ALL_ENERGY_COLUMNS
            : RENEWABLE_COLUMNS;

    const requiredColumns = [
        "Datum von",
        "Datum bis",
        ...valueColumns,
    ];

    const missingColumns = requiredColumns.filter(
        (column) => !rows.columns.includes(column)
    );

    if (missingColumns.length > 0) {
        throw new Error(
            `Ist-CSV: Spalten fehlen: ${missingColumns.join(", ")}`
        );
    }

    const points: DataPoint[] = [];
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

        const start = parseActualDate(startText);
        const end = parseActualDate(endText);

        if (
            !start ||
            !end ||
            formatActualDate(start) !== startText ||
            formatActualDate(end) !== endText
        ) {
            throw new Error(
                `Ist-CSV, Zeile ${rowNumber}: Ungültiges Datum. ` +
                `Erwartet: TT.MM.JJJJ HH:mm.`
            );
        }

        if (end.getTime() <= start.getTime()) {
            throw new Error(
                `Ist-CSV, Zeile ${rowNumber}: ` +
                `Das Ende muss nach dem Beginn liegen. ` +
                `Bei einer Zeitumstellung muss die Zeitzone ` +
                `gesondert behandelt werden.`
            );
        }

        const nuclearWasFilled =
            metric === "total" &&
            applyGermanNuclearZeroRule &&
            start.getTime() >= NUCLEAR_MISSING_FROM &&
            row[NUCLEAR_COLUMN]?.trim() === "-";

        const hasMissingValue = valueColumns.some((column) => {
            if (column === NUCLEAR_COLUMN && nuclearWasFilled) {
                return false;
            }

            return isMissingValue(row[column]);
        });

        if (hasMissingValue) {
            skippedRows += 1;
            continue;
        }

        let value = 0;

        for (const column of valueColumns) {
            if (column === NUCLEAR_COLUMN && nuclearWasFilled) {
                continue;
            }

            value += parseGermanNumber(
                row[column],
                column,
                rowNumber
            );
        }

        if (!Number.isFinite(value)) {
            throw new Error(
                `Ist-CSV, Zeile ${rowNumber}: Ungültige Summe.`
            );
        }

        points.push({
            start,
            end,
            value,
            nuclearWasFilled,
        });

        if (nuclearWasFilled) {
            filledNuclearRows += 1;
        }
    }

    if (points.length === 0) {
        throw new Error(
            `Keine auswertbaren Ist-Werte vorhanden. ` +
            `${skippedRows} Zeilen mit fehlenden Werten.`
        );
    }

    return buildModel(
        points,
        skippedRows,
        filledNuclearRows
    );
}

function parseForecastCsv(
    text: string,
    intervalMinutes: number
): SeriesModel {
    const intervalMs = intervalMinutes * 60 * 1000;

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error(
            "Das Prognoseintervall muss größer als 0 Minuten sein."
        );
    }

    const rows = d3.dsvFormat(";").parse(
        text.replace(/^\uFEFF/, "")
    );

    const requiredColumns = ["Zeitpunkt", "Prognose_MWh"];

    const missingColumns = requiredColumns.filter(
        (column) => !rows.columns.includes(column)
    );

    if (missingColumns.length > 0) {
        throw new Error(
            `Prognose-CSV: Spalten fehlen: ` +
            missingColumns.join(", ")
        );
    }

    const points: DataPoint[] = [];
    let skippedRows = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;

        if (Object.values(row).every((value) => !value?.trim())) {
            continue;
        }

        const timeText = row["Zeitpunkt"]?.trim() ?? "";
        const start = parseForecastDate(timeText);

        if (
            !start ||
            formatForecastDate(start) !== timeText
        ) {
            throw new Error(
                `Prognose-CSV, Zeile ${rowNumber}: ` +
                `Ungültiger Zeitpunkt "${timeText}". ` +
                `Erwartet: JJJJ-MM-TT HH:mm:ss.`
            );
        }

        if (isMissingValue(row["Prognose_MWh"])) {
            skippedRows += 1;
            continue;
        }

        const value = parseGermanNumber(
            row["Prognose_MWh"],
            "Prognose_MWh",
            rowNumber
        );

        // Annahme: Zeitpunkt ist der Beginn des Energieintervalls.
        const end = new Date(start.getTime() + intervalMs);

        if (!Number.isFinite(end.getTime())) {
            throw new Error(
                `Prognose-CSV, Zeile ${rowNumber}: ` +
                `Ungültiges Intervallende.`
            );
        }

        points.push({
            start,
            end,
            value,
            nuclearWasFilled: false,
        });
    }

    if (points.length === 0) {
        throw new Error(
            "Die Prognose-CSV enthält keine auswertbaren Werte."
        );
    }

    return buildModel(points, skippedRows);
}

export default function Prognose({
    csvUrl = "/Test_Daten3.csv",
    forecastCsvUrl = "/Test_Daten4.csv",
    actualMetric = "renewable",
    applyGermanNuclearZeroRule = true,
    forecastIntervalMinutes = 15,
    width = 1000,
    height = 480,
    marginTop = 35,
    marginRight = 30,
    marginBottom = 60,
    marginLeft = 90,
}: IstAnalyseProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const [actualState, setActualState] = useState<LoadState>({
        model: null,
        loading: true,
        error: null,
    });

    const [forecastState, setForecastState] = useState<LoadState>({
        model: null,
        loading: true,
        error: null,
    });

    const forecastModel = forecastState.model;

    const actualLabel =
        actualMetric === "renewable"
            ? "Ist: Erneuerbare"
            : "Ist: Gesamtstromerzeugung";

    /*
     * Ausschließlich die letzte Woche VOR dem Prognosebeginn.
     *
     * Beispiel:
     * Prognosebeginn: 18.10.2026, 05:00
     * Ist-Zeitraum:   11.10.2026, 05:00 bis 18.10.2026, 05:00
     *
     * Nur vollständig im Zeitfenster liegende Intervalle übernehmen.
     * MWh-Werte werden nicht anteilig aufgeteilt.
     */
    const actualModel = useMemo<SeriesModel | null>(() => {
        const sourceModel = actualState.model;

        if (!sourceModel || !forecastModel) {
            return null;
        }

        const forecastStart = forecastModel.times[0];
        const weekStart = forecastStart - WEEK_MS;

        const from = lowerBound(sourceModel.times, weekStart);
        const to = lowerBound(sourceModel.times, forecastStart);

        const points = sourceModel.points
            .slice(from, to)
            .filter(
                (point) => point.end.getTime() <= forecastStart
            );

        if (points.length === 0) {
            return null;
        }

        const filledNuclearRows = points.reduce(
            (sum, point) => sum + Number(point.nuclearWasFilled),
            0
        );

        return buildModel(points, 0, filledNuclearRows);
    }, [actualState.model, forecastModel]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadActual() {
            setActualState({
                model: null,
                loading: true,
                error: null,
            });

            try {
                const response = await fetch(csvUrl, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(
                        `Ist-CSV konnte nicht geladen werden: ` +
                        `HTTP ${response.status}`
                    );
                }

                const text = await response.text();

                if (controller.signal.aborted) return;

                const model = parseActualCsv(
                    text,
                    actualMetric,
                    applyGermanNuclearZeroRule
                );

                if (!controller.signal.aborted) {
                    setActualState({
                        model,
                        loading: false,
                        error: null,
                    });
                }
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setActualState({
                        model: null,
                        loading: false,
                        error:
                            cause instanceof Error
                                ? cause.message
                                : "Fehler beim Laden der Ist-Daten.",
                    });
                }
            }
        }

        void loadActual();

        return () => controller.abort();
    }, [
        csvUrl,
        actualMetric,
        applyGermanNuclearZeroRule,
    ]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadForecast() {
            setForecastState({
                model: null,
                loading: true,
                error: null,
            });

            try {
                const response = await fetch(forecastCsvUrl, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(
                        `Prognose-CSV konnte nicht geladen werden: ` +
                        `HTTP ${response.status}`
                    );
                }

                const text = await response.text();

                if (controller.signal.aborted) return;

                const model = parseForecastCsv(
                    text,
                    forecastIntervalMinutes
                );

                if (!controller.signal.aborted) {
                    setForecastState({
                        model,
                        loading: false,
                        error: null,
                    });
                }
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setForecastState({
                        model: null,
                        loading: false,
                        error:
                            cause instanceof Error
                                ? cause.message
                                : "Fehler beim Laden der Prognose.",
                    });
                }
            }
        }

        void loadForecast();

        return () => controller.abort();
    }, [forecastCsvUrl, forecastIntervalMinutes]);

    useEffect(() => {
        const container = containerRef.current;
        const chartCanvas = chartCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;

        if (!container || !chartCanvas || !overlayCanvas) return;

        const chartContext = chartCanvas.getContext("2d");
        const overlayContext = overlayCanvas.getContext("2d");

        if (!chartContext || !overlayContext) return;

        // Ohne Prognosebeginn lässt sich die vorherige Woche
        // nicht bestimmen. Daher keine gesamte Historie anzeigen.
        if (!forecastModel) {
            for (const canvas of [chartCanvas, overlayCanvas]) {
                const context = canvas.getContext("2d");

                if (context) {
                    context.setTransform(1, 0, 0, 1, 0, 0);
                    context.clearRect(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
                }
            }

            return;
        }

        const seriesList: DrawableSeries[] = [];

        if (actualModel) {
            seriesList.push({
                model: actualModel,
                label: actualLabel,
                color: ACTUAL_COLOR,
                dashed: false,
            });
        }

        seriesList.push({
            model: forecastModel,
            label: "Prognose",
            color: FORECAST_COLOR,
            dashed: true,
        });

        const forecastStart = forecastModel.times[0];

        // Fester Gesamtbereich:
        // sieben Tage vor Prognosebeginn bis Prognoseende.
        const domainMin = forecastStart - WEEK_MS;
        const domainMax =
            forecastModel.points[
                forecastModel.points.length - 1
            ].end.getTime();

        const domainSpan = Math.max(1, domainMax - domainMin);

        let maxValue = 0;

        for (const series of seriesList) {
            maxValue = Math.max(
                maxValue,
                series.model.maxValue
            );
        }

        const maxZoom = Math.max(
            40,
            domainSpan / (60 * 60 * 1000)
        );

        const baseX = d3.scaleUtc()
            .domain([new Date(domainMin), new Date(domainMax)]);

        const y = d3.scaleLinear()
            .domain([0, Math.max(1, maxValue * 1.08)])
            .nice();

        let x = baseX.copy();
        let transform = d3.zoomIdentity;

        let cssWidth = 0;
        let cssHeight = 0;
        let rasterScaleX = 1;
        let rasterScaleY = 1;

        let left = 0;
        let right = 1;
        let top = 0;
        let bottom = 1;
        let plotWidth = 1;
        let plotHeight = 1;

        let visibleMin = domainMin;
        let visibleMax = domainMax;
        let pixelsPerMillisecond = 1;

        let mouse: { x: number; y: number } | null = null;
        let interacting = false;
        let disposed = false;
        let animationFrame = 0;
        let chartDirty = true;

        const extrema: Extremes = { min: -1, max: -1 };
        const selectedIndices = [0, 0, 0, 0];

        function xPosition(timestamp: number): number {
            return (
                left +
                (timestamp - visibleMin) * pixelsPerMillisecond
            );
        }

        function timeAtPixel(pixel: number): number {
            return (
                visibleMin +
                (pixel - left) / pixelsPerMillisecond
            );
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

            const yTicks = y.ticks(6);

            ctx.lineWidth = 1;
            ctx.strokeStyle = "#e5e7eb";
            ctx.beginPath();

            for (const value of yTicks) {
                const py = y(value);

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
            ctx.fillStyle = "#475569";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (const value of yTicks) {
                const py = y(value);

                ctx.beginPath();
                ctx.moveTo(left - 6, py);
                ctx.lineTo(left, py);
                ctx.stroke();

                ctx.fillText(
                    formatAxisNumber.format(value),
                    left - 10,
                    py,
                    Math.max(1, left - 15)
                );
            }

            ctx.font = `600 12px ${FONT}`;
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillText("MWh", left, Math.max(13, top - 12));

            const tickCount = Math.max(
                2,
                Math.min(10, Math.floor(plotWidth / 115))
            );

            ctx.font = `11px ${FONT}`;
            ctx.textAlign = "center";

            for (const tick of x.ticks(tickCount)) {
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

        function drawSeries(series: DrawableSeries) {
            const ctx = chartContext!;
            const model = series.model;

            const {
                points,
                times,
                segmentIds,
                isolated,
            } = model;

            const count = points.length;
            const visibleStart = lowerBound(times, visibleMin);
            const visibleEnd = upperBound(times, visibleMax);

            const from = Math.max(0, visibleStart - 1);
            const to = Math.min(count, visibleEnd + 1);

            if (from >= to) return;

            const markers: number[] = [];

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            ctx.strokeStyle = series.color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.setLineDash(series.dashed ? [7, 5] : []);
            ctx.beginPath();

            let previousIndex = -1;

            function emit(index: number) {
                if (index < 0 || index === previousIndex) return;

                const px = xPosition(times[index]);
                const py = y(points[index].value);

                if (
                    previousIndex < 0 ||
                    segmentIds[previousIndex] !== segmentIds[index]
                ) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }

                if (
                    (to - from <= 150 || isolated[index] === 1) &&
                    px >= left - 4 &&
                    px <= right + 4
                ) {
                    markers.push(index);
                }

                previousIndex = index;
            }

            const pixelBuckets = Math.max(
                1,
                Math.ceil(plotWidth)
            );

            if (to - from <= pixelBuckets * 2) {
                for (let index = from; index < to; index += 1) {
                    emit(index);
                }
            } else {
                if (from < visibleStart) emit(from);

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

                    // Zusammenhängende Segmente getrennt verdichten.
                    let segmentStart = cursor;

                    while (segmentStart < next) {
                        let lo = segmentStart + 1;
                        let hi = next;

                        const segmentId =
                            segmentIds[segmentStart];

                        while (lo < hi) {
                            const mid =
                                lo + Math.floor((hi - lo) / 2);

                            if (segmentIds[mid] === segmentId) {
                                lo = mid + 1;
                            } else {
                                hi = mid;
                            }
                        }

                        const segmentEnd = lo;

                        if (segmentEnd - segmentStart <= 4) {
                            for (
                                let index = segmentStart;
                                index < segmentEnd;
                                index += 1
                            ) {
                                emit(index);
                            }
                        } else {
                            queryExtremes(
                                model,
                                segmentStart,
                                segmentEnd,
                                extrema
                            );

                            selectedIndices[0] = segmentStart;
                            selectedIndices[1] = extrema.min;
                            selectedIndices[2] = extrema.max;
                            selectedIndices[3] = segmentEnd - 1;

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

                        segmentStart = segmentEnd;
                    }

                    cursor = next;
                }

                if (visibleEnd < to) emit(visibleEnd);
            }

            ctx.stroke();
            ctx.setLineDash([]);

            if (markers.length > 0) {
                ctx.beginPath();

                for (const index of markers) {
                    const px = xPosition(times[index]);
                    const py = y(points[index].value);

                    ctx.moveTo(px + 3, py);
                    ctx.arc(px, py, 3, 0, Math.PI * 2);
                }

                ctx.fillStyle = series.color;
                ctx.fill();

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.restore();
        }

        function drawChart() {
            prepareContext(chartContext!, chartCanvas!);
            drawAxes();

            for (const series of seriesList) {
                drawSeries(series);
            }
        }

        function getHoverPoint(): HoverPoint | null {
            if (!mouse || interacting) return null;

            if (
                mouse.x < left ||
                mouse.x > right ||
                mouse.y < top ||
                mouse.y > bottom
            ) {
                return null;
            }

            const timestamp = timeAtPixel(mouse.x);

            let best: HoverPoint | null = null;
            let bestDistance = Infinity;

            for (const series of seriesList) {
                const { points, times } = series.model;

                const before = upperBound(times, timestamp) - 1;

                if (
                    before < 0 ||
                    timestamp >= points[before].end.getTime()
                ) {
                    continue;
                }

                const candidates = [before];

                if (
                    before + 1 < points.length &&
                    times[before + 1] ===
                        points[before].end.getTime()
                ) {
                    candidates.push(before + 1);
                }

                for (const index of candidates) {
                    const px = xPosition(times[index]);
                    const py = y(points[index].value);

                    if (px < left || px > right) continue;

                    const dx = px - mouse.x;
                    const dy = py - mouse.y;
                    const distance = dx * dx + dy * dy;

                    if (distance < bestDistance) {
                        bestDistance = distance;

                        best = {
                            series,
                            index,
                            x: px,
                            y: py,
                        };
                    }
                }
            }

            return best;
        }

        function drawOverlay() {
            const ctx = overlayContext!;

            prepareContext(ctx, overlayCanvas!);

            const hover = getHoverPoint();

            if (!hover) return;

            const point =
                hover.series.model.points[hover.index];

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            ctx.strokeStyle = "#64748b";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);

            ctx.beginPath();
            ctx.moveTo(hover.x, top);
            ctx.lineTo(hover.x, bottom);
            ctx.moveTo(left, hover.y);
            ctx.lineTo(right, hover.y);
            ctx.stroke();

            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(hover.x, hover.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = hover.series.color;
            ctx.fill();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();

            const tooltipWidth = Math.max(
                1,
                Math.min(330, cssWidth - 16)
            );

            const tooltipHeight =
                point.nuclearWasFilled ? 142 : 118;

            const preferredX =
                hover.x + tooltipWidth + 14 > right
                    ? hover.x - tooltipWidth - 14
                    : hover.x + 14;

            const tooltipX = clamp(
                preferredX,
                8,
                Math.max(8, cssWidth - tooltipWidth - 8)
            );

            const tooltipY = clamp(
                hover.y - tooltipHeight - 12,
                8,
                Math.max(8, cssHeight - tooltipHeight - 8)
            );

            ctx.save();
            ctx.translate(tooltipX, tooltipY);

            ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
            ctx.fillRect(0, 0, tooltipWidth, tooltipHeight);

            const textWidth = Math.max(1, tooltipWidth - 24);

            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            ctx.font = `600 13px ${FONT}`;
            ctx.fillStyle = hover.series.dashed
                ? "#fdba74"
                : "#93c5fd";

            ctx.fillText(
                hover.series.label,
                12,
                22,
                textWidth
            );

            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#cbd5e1";

            ctx.fillText(
                `Von: ${formatActualDate(point.start)}`,
                12,
                45,
                textWidth
            );

            ctx.fillText(
                `Bis: ${formatActualDate(point.end)}`,
                12,
                65,
                textWidth
            );

            ctx.font = `600 15px ${FONT}`;
            ctx.fillStyle = "#ffffff";

            ctx.fillText(
                `${formatNumber.format(point.value)} MWh`,
                12,
                96,
                textWidth
            );

            if (point.nuclearWasFilled) {
                ctx.font = `11px ${FONT}`;
                ctx.fillStyle = "#fbbf24";

                ctx.fillText(
                    'Kernenergie: „-“ als 0 MWh ergänzt',
                    12,
                    124,
                    textWidth
                );
            }

            ctx.restore();
        }

        function scheduleDraw(redrawChart: boolean) {
            if (disposed) return;

            chartDirty = chartDirty || redrawChart;

            if (animationFrame !== 0) return;

            animationFrame = requestAnimationFrame(() => {
                animationFrame = 0;

                if (disposed) return;

                if (chartDirty) {
                    chartDirty = false;
                    updateVisibleScale();
                    drawChart();
                }

                drawOverlay();
            });
        }

        const selection = d3.select(overlayCanvas);

        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([1, maxZoom])
            .clickDistance(4)
            .filter((event: Event) => {
                const input = event as MouseEvent;

                if (input.button && event.type !== "wheel") {
                    return false;
                }

                if (input.ctrlKey && event.type !== "wheel") {
                    return false;
                }

                const [px, py] = d3.pointer(
                    event,
                    overlayCanvas
                );

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
                    scheduleDraw(true);
                }
            )
            .on("end.chart", () => {
                interacting = false;
            });

        function resetZoom() {
            if (disposed) return;

            mouse = null;
            selection.call(zoom.transform, d3.zoomIdentity);
        }

        selection.call(zoom);

        selection
            .on("dblclick.zoom", null)
            .on("dblclick.reset", (event: MouseEvent) => {
                event.preventDefault();
                resetZoom();
            });

        function handlePointerMove(event: PointerEvent) {
            if (
                event.pointerType === "touch" ||
                event.buttons !== 0 ||
                interacting
            ) {
                mouse = null;
                scheduleDraw(false);
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

            right = cssWidth - Math.min(
                Math.max(0, marginRight),
                cssWidth * 0.2
            );

            top = Math.min(
                Math.max(0, marginTop),
                cssHeight * 0.2
            );

            bottom = cssHeight - Math.min(
                Math.max(0, marginBottom),
                cssHeight * 0.35
            );

            plotWidth = Math.max(1, right - left);
            plotHeight = Math.max(1, bottom - top);

            rasterScaleX = pixelWidth / cssWidth;
            rasterScaleY = pixelHeight / cssHeight;

            for (const canvas of [
                chartCanvas!,
                overlayCanvas!,
            ]) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }

            baseX.range([left, right]);
            y.range([bottom, top]);

            zoom
                .extent([
                    [left, top],
                    [right, bottom],
                ])
                .translateExtent([
                    [left, top],
                    [right, bottom],
                ]);

            const k = transform.k;

            const translation = clamp(
                (left + right) / 2 -
                    k * baseX(new Date(oldCenter)),
                right * (1 - k),
                left * (1 - k)
            );

            mouse = null;

            selection.call(
                zoom.transform,
                d3.zoomIdentity
                    .translate(
                        translation,
                        top * (1 - k)
                    )
                    .scale(k)
            );

            scheduleDraw(true);
        }

        const resizeObserver = new ResizeObserver(resize);

        resizeObserver.observe(container);

        window.addEventListener("resize", resize, {
            passive: true,
        });

        resize();

        return () => {
            disposed = true;

            if (animationFrame !== 0) {
                cancelAnimationFrame(animationFrame);
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
        };
    }, [
        actualModel,
        forecastModel,
        actualLabel,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
    ]);

    const hasData = Boolean(forecastModel);
    const loading =
        actualState.loading || forecastState.loading;

    const firstActual = actualModel?.points[0];
    const lastActual =
        actualModel?.points[actualModel.points.length - 1];

    const firstForecast = forecastModel?.points[0];
    const lastForecast =
        forecastModel?.points[forecastModel.points.length - 1];

    const weekStart = firstForecast
        ? new Date(firstForecast.start.getTime() - WEEK_MS)
        : null;

    const forecastIntervalMs =
        forecastIntervalMinutes * 60 * 1000;

    const intervalMismatch = useMemo(
        () =>
            actualModel !== null &&
            actualModel.points.some(
                (point) =>
                    point.end.getTime() - point.start.getTime() !==
                    forecastIntervalMs
            ),
        [actualModel, forecastIntervalMs]
    );

    const noActualValuesInWeek =
        forecastModel !== null &&
        actualState.model !== null &&
        !actualState.loading &&
        actualModel === null;

    return (
        <div className="content-body">
            <h2>
                {actualMetric === "renewable"
                    ? "Erneuerbare Stromerzeugung"
                    : "Gesamtstromerzeugung"}
                {" – Ist-Werte und Prognose in MWh"}
            </h2>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px 24px",
                    marginBottom: 12,
                }}
            >
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span
                        aria-hidden="true"
                        style={{
                            width: 28,
                            borderTop:
                                `3px solid ${ACTUAL_COLOR}`,
                        }}
                    />
                    {actualLabel} (MWh)
                </span>

                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span
                        aria-hidden="true"
                        style={{
                            width: 28,
                            borderTop:
                                `3px dashed ${FORECAST_COLOR}`,
                        }}
                    />
                    Prognose (MWh)
                </span>
            </div>

            {weekStart && firstForecast && (
                <p>
                    <strong>Ist-Zeitfenster:</strong>{" "}
                    {formatActualDate(weekStart)} bis{" "}
                    {formatActualDate(firstForecast.start)}
                    {" · letzte sieben Tage vor Prognosebeginn"}
                </p>
            )}

            {actualState.loading && (
                <p role="status">
                    Ist-Daten werden geladen …
                </p>
            )}

            {forecastState.loading && (
                <p role="status">
                    Prognosedaten werden geladen …
                </p>
            )}

            {actualState.error && (
                <p
                    role="alert"
                    style={{
                        color: "#dc2626",
                        overflowWrap: "anywhere",
                    }}
                >
                    {actualState.error}
                </p>
            )}

            {forecastState.error && (
                <p
                    role="alert"
                    style={{
                        color: "#dc2626",
                        overflowWrap: "anywhere",
                    }}
                >
                    {forecastState.error}
                    {" "}
                    Ohne Prognosebeginn kann die vorherige Woche
                    nicht bestimmt werden.
                </p>
            )}

            {actualModel && firstActual && lastActual && (
                <p>
                    <strong>Angezeigte Ist-Daten:</strong>{" "}
                    {actualModel.points.length.toLocaleString("de-DE")}{" "}
                    Werte · {formatActualDate(firstActual.start)} bis{" "}
                    {formatActualDate(lastActual.end)}
                </p>
            )}

            {forecastModel && firstForecast && lastForecast && (
                <p>
                    <strong>Prognose:</strong>{" "}
                    {forecastModel.points.length.toLocaleString("de-DE")}{" "}
                    Werte · {formatActualDate(firstForecast.start)} bis{" "}
                    {formatActualDate(lastForecast.end)}
                </p>
            )}

            {noActualValuesInWeek && (
                <p role="status" style={{ color: "#92400e" }}>
                    In der Ist-Datei sind keine auswertbaren,
                    vollständig innerhalb der letzten sieben Tage
                    vor Prognosebeginn liegenden Intervalle vorhanden.
                    Es wird nur die Prognose gezeichnet.
                </p>
            )}

            {(actualState.model?.skippedRows ?? 0) > 0 && (
                <p role="status" style={{ color: "#92400e" }}>
                    Beim Einlesen der gesamten Ist-Datei wurden{" "}
                    {actualState.model?.skippedRows.toLocaleString("de-DE")}{" "}
                    Zeilen wegen fehlender Werte in den ausgewählten
                    Energiespalten übersprungen.
                </p>
            )}

            {(forecastModel?.skippedRows ?? 0) > 0 && (
                <p role="status" style={{ color: "#92400e" }}>
                    {forecastModel?.skippedRows.toLocaleString("de-DE")}{" "}
                    Prognosezeilen wurden wegen fehlender Werte
                    übersprungen.
                </p>
            )}

            {(actualModel?.filledNuclearRows ?? 0) > 0 && (
                <p role="status" style={{ color: "#1d4ed8" }}>
                    Datenannahme: In{" "}
                    {actualModel?.filledNuclearRows.toLocaleString("de-DE")}{" "}
                    angezeigten Ist-Zeilen wurde „-“ bei Kernenergie
                    ab dem 30.01.2024, 12:30 Uhr als 0 MWh ergänzt.
                </p>
            )}

            {intervalMismatch && forecastModel && (
                <p role="status" style={{ color: "#92400e" }}>
                    Achtung: Nicht alle angezeigten Ist-Intervalle
                    entsprechen dem Prognoseintervall von{" "}
                    {forecastIntervalMinutes} Minuten.
                    Die MWh-Werte werden unverändert dargestellt.
                    Für einen direkten Vergleich müssen die
                    Intervalllängen übereinstimmen.
                </p>
            )}

            <div
                ref={containerRef}
                className="chart-container"
                aria-busy={loading}
                style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio:
                        `${Math.max(1, width)} / ${Math.max(1, height)}`,
                    minHeight: 280,
                    overflow: "hidden",
                    contain: "layout paint",
                    background: "#ffffff",
                }}
            >
                <canvas
                    ref={chartCanvasRef}
                    role="img"
                    aria-label={
                        `${actualLabel} der letzten sieben Tage ` +
                        `vor Prognosebeginn und Prognose ` +
                        `in Megawattstunden.`
                    }
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "block",
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                    }}
                >
                    Zeitdiagramm der Ist-Werte der letzten Woche
                    vor Prognosebeginn und der Prognose in MWh.
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
                        cursor: hasData
                            ? "crosshair"
                            : "default",
                        touchAction: "none",
                    }}
                />

                {!hasData && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            background: "#ffffff",
                            color: "#64748b",
                            pointerEvents: "none",
                            padding: 16,
                            textAlign: "center",
                        }}
                    >
                        {loading
                            ? "Daten werden geladen …"
                            : "Keine Prognosedaten zur Bestimmung des Zeitfensters vorhanden."}
                    </div>
                )}
            </div>
        </div>
    );
}
