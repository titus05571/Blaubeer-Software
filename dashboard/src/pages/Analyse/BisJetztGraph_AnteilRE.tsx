import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

type IstAnalyseProps = {
    csvUrl?: string;
    applyGermanNuclearZeroRule?: boolean;
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
    renewable: number;
    total: number;
    share: number;
    nuclearWasFilled: boolean;
};

type ChartModel = {
    points: DataPoint[];
    times: Float64Array;

    // Zusammenhängende Abschnitte bekommen dieselbe ID.
    segmentIds: Uint32Array;
    isolated: Uint8Array;

    // Segmentbaum für schnelle Min-/Max-Abfragen.
    treeSize: number;
    minTree: Int32Array;
    maxTree: Int32Array;

    skippedRows: number;
    filledNuclearRows: number;
};

type Extremes = {
    min: number;
    max: number;
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

const formatNumber = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
});

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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

function buildModel(
    points: DataPoint[],
    skippedRows: number,
    filledNuclearRows: number
): ChartModel {
    const count = points.length;
    const times = new Float64Array(count);
    const segmentIds = new Uint32Array(count);
    const isolated = new Uint8Array(count);

    let segmentId = 0;

    for (let i = 0; i < count; i += 1) {
        times[i] = points[i].start.getTime();

        if (
            i > 0 &&
            times[i] > points[i - 1].end.getTime()
        ) {
            segmentId += 1;
        }

        segmentIds[i] = segmentId;
    }

    for (let i = 0; i < count; i += 1) {
        const hasPrevious =
            i > 0 && segmentIds[i - 1] === segmentIds[i];

        const hasNext =
            i + 1 < count && segmentIds[i + 1] === segmentIds[i];

        isolated[i] = !hasPrevious && !hasNext ? 1 : 0;
    }

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
                  : points[minLeft].share <= points[minRight].share
                    ? minLeft
                    : minRight;

        maxTree[node] =
            maxLeft < 0
                ? maxRight
                : maxRight < 0
                  ? maxLeft
                  : points[maxLeft].share >= points[maxRight].share
                    ? maxLeft
                    : maxRight;
    }

    return {
        points,
        times,
        segmentIds,
        isolated,
        treeSize,
        minTree,
        maxTree,
        skippedRows,
        filledNuclearRows,
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
    const { points, minTree, maxTree, treeSize } = model;

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
                (
                    minIndex < 0 ||
                    points[candidateMin].share < points[minIndex].share
                )
            ) {
                minIndex = candidateMin;
            }

            if (
                candidateMax >= 0 &&
                (
                    maxIndex < 0 ||
                    points[candidateMax].share > points[maxIndex].share
                )
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
                (
                    minIndex < 0 ||
                    points[candidateMin].share < points[minIndex].share
                )
            ) {
                minIndex = candidateMin;
            }

            if (
                candidateMax >= 0 &&
                (
                    maxIndex < 0 ||
                    points[candidateMax].share > points[maxIndex].share
                )
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

function parseCsv(
    text: string,
    applyGermanNuclearZeroRule: boolean
): ChartModel {
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

        if (end.getTime() <= start.getTime()) {
            throw new Error(
                `CSV-Zeile ${rowNumber}: Ungültiger Zeitraum. ` +
                `Das Ende liegt nicht nach dem Beginn. ` +
                `Bei einer Winterzeitumstellung muss die Zeitzone ` +
                `anhand der Datenquelle gesondert behandelt werden.`
            );
        }

        const nuclearWasFilled =
            applyGermanNuclearZeroRule &&
            start.getTime() >= NUCLEAR_MISSING_FROM &&
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

        let renewable = 0;
        let other = 0;

        for (const column of RENEWABLE_COLUMNS) {
            renewable += parseGermanNumber(
                row[column],
                column,
                rowNumber
            );
        }

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

        points.push({
            start,
            end,
            renewable,
            total,
            share: (renewable / total) * 100,
            nuclearWasFilled,
        });

        if (nuclearWasFilled) {
            filledNuclearRows += 1;
        }
    }

    if (points.length === 0) {
        throw new Error(
            `Keine auswertbaren Messwerte vorhanden. ` +
            `${skippedRows} Zeilen enthalten fehlende Erzeugungswerte.`
        );
    }

    points.sort(
        (a, b) => a.start.getTime() - b.start.getTime()
    );

    return buildModel(points, skippedRows, filledNuclearRows);
}

export default function IstAnalyse({
    csvUrl = "/Test_Daten3.csv",
    applyGermanNuclearZeroRule = true,
    width = 900,
    height = 450,
    marginTop = 30,
    marginRight = 30,
    marginBottom = 60,
    marginLeft = 65,
}: IstAnalyseProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const resetZoomRef = useRef<(() => void) | null>(null);

    // React-State nur für das Laden und für Statusmeldungen.
    // Zoom und Hover laufen vollständig außerhalb von React.
    const [model, setModel] = useState<ChartModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function loadData() {
            setLoading(true);
            setError(null);
            setModel(null);

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

                if (controller.signal.aborted) return;

                const parsedModel = parseCsv(
                    text,
                    applyGermanNuclearZeroRule
                );

                if (!controller.signal.aborted) {
                    setModel(parsedModel);
                }
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(
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

        void loadData();

        return () => controller.abort();
    }, [csvUrl, applyGermanNuclearZeroRule]);

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
            points,
            times,
            segmentIds,
            isolated,
        } = model;

        const count = points.length;

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

        let animationFrame = 0;
        let chartDirty = true;
        let overlayDirty = true;

        let mouse: { x: number; y: number } | null = null;

        let previousHoverIndex = -1;
        let previousHoverTransform = transform;

        const extrema: Extremes = { min: -1, max: -1 };
        const selectedIndices = [0, 0, 0, 0];
        const markerIndices: number[] = [];

        let domainMin = times[0];
        let domainMax = times[count - 1];

        if (domainMin === domainMax) {
            const padding = Math.max(
                (points[0].end.getTime() - domainMin) / 2,
                30_000
            );

            domainMin -= padding;
            domainMax += padding;
        }

        const baseX = d3.scaleUtc()
            .domain([new Date(domainMin), new Date(domainMax)]);

        let x = baseX.copy();

        // Numerische Abbildung für den heißen Zeichenpfad:
        // keine Date-Objekte und keine D3-Aufrufe pro Datenpunkt.
        let visibleMin = domainMin;
        let visibleMax = domainMax;
        let pixelsPerMillisecond = 1;

        function xPosition(timestamp: number): number {
            return left + (timestamp - visibleMin) * pixelsPerMillisecond;
        }

        function yPosition(share: number): number {
            return bottom - (share / 100) * plotHeight;
        }

        function timeAtPixel(pixel: number): number {
            return visibleMin + (pixel - left) / pixelsPerMillisecond;
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

        function drawSeries() {
            const ctx = chartContext!;

            // Tatsächlich sichtbare Messpunkte.
            const visibleStart = lowerBound(times, visibleMin);
            const visibleEnd = upperBound(times, visibleMax);

            // Nachbarpunkte für korrekt abgeschnittene Randsegmente.
            const from = Math.max(0, visibleStart - 1);
            const to = Math.min(count, visibleEnd + 1);

            if (from >= to) return;

            markerIndices.length = 0;

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();

            let previousIndex = -1;

            function emit(index: number) {
                if (index < 0 || index === previousIndex) return;

                const point = points[index];

                const px = xPosition(times[index]);
                const py = yPosition(point.share);

                // Zwischen unterschiedlichen Segmenten niemals verbinden.
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
                // Bei wenigen sichtbaren Punkten ohne Verdichtung zeichnen.
                for (let index = from; index < to; index += 1) {
                    emit(index);
                }
            } else {
                if (from < visibleStart) {
                    emit(from);
                }

                let cursor = visibleStart;

                // Pro horizontalem CSS-Pixel:
                // erster, kleinster, größter und letzter Messpunkt.
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
                        for (let index = cursor; index < next; index += 1) {
                            emit(index);
                        }
                    } else {
                        queryExtremes(model!, cursor, next, extrema);

                        selectedIndices[0] = cursor;
                        selectedIndices[1] = extrema.min;
                        selectedIndices[2] = extrema.max;
                        selectedIndices[3] = next - 1;

                        // Vier Elemente: einfache Insertion-Sort,
                        // keine neuen Arrays im Zeichenpfad.
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

            if (markerIndices.length > 0) {
                ctx.beginPath();

                for (const index of markerIndices) {
                    const px = xPosition(times[index]);
                    const py = yPosition(points[index].share);

                    ctx.moveTo(px + 3.5, py);
                    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
                }

                ctx.fillStyle = "#2563eb";
                ctx.fill();

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
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
                timestamp >= points[count - 1].end.getTime()
            ) {
                return -1;
            }

            const after = upperBound(times, timestamp);
            const before = after - 1;

            if (
                before >= 0 &&
                after < count &&
                timestamp >= points[before].end.getTime() &&
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
            } else {
                index =
                    timestamp - times[before] <= times[after] - timestamp
                        ? before
                        : after;
            }

            const px = xPosition(times[index]);

            return px >= left && px <= right ? index : -1;
        }

        function drawOverlay(force = false) {
            const index = getHoverIndex();

            // Innerhalb desselben Messpunkts nichts neu zeichnen.
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

            const point = points[index];
            const px = xPosition(times[index]);
            const py = yPosition(point.share);

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

            const tooltipWidth = Math.min(310, cssWidth - 16);
            const tooltipHeight = point.nuclearWasFilled ? 145 : 120;

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

            // Abgerundetes Rechteck ohne roundRect-Abhängigkeit.
            const radius = 6;

            ctx.beginPath();
            ctx.moveTo(radius, 0);
            ctx.lineTo(tooltipWidth - radius, 0);
            ctx.quadraticCurveTo(tooltipWidth, 0, tooltipWidth, radius);
            ctx.lineTo(tooltipWidth, tooltipHeight - radius);
            ctx.quadraticCurveTo(
                tooltipWidth,
                tooltipHeight,
                tooltipWidth - radius,
                tooltipHeight
            );
            ctx.lineTo(radius, tooltipHeight);
            ctx.quadraticCurveTo(0, tooltipHeight, 0, tooltipHeight - radius);
            ctx.lineTo(0, radius);
            ctx.quadraticCurveTo(0, 0, radius, 0);
            ctx.closePath();

            ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
            ctx.fill();

            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#cbd5e1";

            const textWidth = Math.max(1, tooltipWidth - 24);

            ctx.fillText(
                `Von: ${formatDate(point.start)}`,
                12,
                20,
                textWidth
            );

            ctx.fillText(
                `Bis: ${formatDate(point.end)}`,
                12,
                39,
                textWidth
            );

            ctx.font = `600 13px ${FONT}`;
            ctx.fillStyle = "#ffffff";

            ctx.fillText(
                `Anteil: ${formatNumber.format(point.share)} %`,
                12,
                63,
                textWidth
            );

            ctx.font = `12px ${FONT}`;
            ctx.fillStyle = "#cbd5e1";

            ctx.fillText(
                `Erneuerbar: ${formatNumber.format(point.renewable)} MWh`,
                12,
                85,
                textWidth
            );

            ctx.fillText(
                `Gesamt: ${formatNumber.format(point.total)} MWh`,
                12,
                106,
                textWidth
            );

            if (point.nuclearWasFilled) {
                ctx.font = `11px ${FONT}`;
                ctx.fillStyle = "#fbbf24";

                ctx.fillText(
                    'Kernenergie: „-“ als 0 MWh ergänzt',
                    12,
                    130,
                    textWidth
                );
            }

            ctx.restore();
        }

        /**
         * Höchstens ein Zeichendurchlauf je Browserframe.
         * Hover zeichnet ausschließlich das separate Overlay.
         */
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

        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([1, 40])
            .clickDistance(4)
            .filter((event: Event) => {
                const input = event as MouseEvent;

                if (
                    input.button &&
                    event.type !== "wheel"
                ) {
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

        resetZoomRef.current = resetZoom;

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

            // Begrenzt den Rasteraufwand auf sehr hochauflösenden Displays.
            const dpr = Math.min(
                2,
                Math.max(1, window.devicePixelRatio || 1)
            );

            const pixelWidth = Math.max(1, Math.round(nextWidth * dpr));
            const pixelHeight = Math.max(1, Math.round(nextHeight * dpr));

            if (
                cssWidth === nextWidth &&
                cssHeight === nextHeight &&
                chartCanvas!.width === pixelWidth &&
                chartCanvas!.height === pixelHeight
            ) {
                return;
            }

            const oldCenter =
                (visibleMin + visibleMax) / 2;

            cssWidth = nextWidth;
            cssHeight = nextHeight;

            // Auch bei schmalen Containern bleibt ein Plotbereich übrig.
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

            // Bestehenden Zoom beim Resize möglichst erhalten.
            const k = transform.k;

            const desiredTranslation =
                (left + right) / 2 -
                k * baseX(new Date(oldCenter));

            const translation = clamp(
                desiredTranslation,
                right * (1 - k),
                left * (1 - k)
            );

            const nextTransform = d3.zoomIdentity
                .translate(translation, top * (1 - k))
                .scale(k);

            mouse = null;

            selection.call(zoom.transform, nextTransform);
            scheduleDraw(true);
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
        };
    }, [
        model,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
    ]);

    const firstPoint = model?.points[0];
    const lastPoint = model?.points[model.points.length - 1];

    return (
        <div className="content-body">
            <h2>
                Anteil erneuerbarer Energien an der Stromerzeugung
            </h2>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px 16px",
                    marginBottom: 12,
                }}
            >
            </div>

            {loading && (
                <p role="status">CSV-Daten werden geladen …</p>
            )}

            {error && (
                <p
                    role="alert"
                    style={{
                        color: "#dc2626",
                        overflowWrap: "anywhere",
                    }}
                >
                    {error}
                </p>
            )}

            {model && !loading && !error && (
                <>
                    <p>
                        {model.points.length.toLocaleString("de-DE")}{" "}
                        Messwerte geladen
                    </p>

                    {firstPoint && lastPoint && (
                        <p>
                            Auswertbarer Zeitraum:{" "}
                            {formatDate(firstPoint.start)} bis{" "}
                            {formatDate(lastPoint.end)}
                        </p>
                    )}
                </>
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
                    minHeight: 260,
                    overflow: "hidden",
                    contain: "layout paint",
                }}
            >
                <canvas
                    ref={chartCanvasRef}
                    role="img"
                    aria-label={
                        "Anteil erneuerbarer Energien an der " +
                        "Stromerzeugung im Zeitverlauf in Prozent"
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
                    Zeitdiagramm des Anteils erneuerbarer Energien
                    an der Stromerzeugung in Prozent.
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

                {/*
                    Verdeckt auch alte Canvas-Inhalte, während eine
                    andere CSV geladen wird oder ein Fehler vorliegt.
                */}
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