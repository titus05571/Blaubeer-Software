import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

type IstAnalyseProps = {
    csvUrl?: string;
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
};

type CsvResult = {
    points: DataPoint[];
    skippedRows: number;
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

// CSV-Uhrzeiten ohne lokale Sommer-/Winterzeitkorrektur darstellen.
// Keine Umrechnung der tatsächlichen Messzeitpunkte nach UTC.
const parseDate = d3.utcParse("%d.%m.%Y %H:%M");
const formatDate = d3.utcFormat("%d.%m.%Y %H:%M");
const formatTime = d3.utcFormat("%H:%M");
const formatTickDate = d3.utcFormat("%d.%m.%y");

const formatNumber = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
});

const dateBisector = d3.bisector<DataPoint, Date>(
    (point) => point.start
);

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

    // Unterstützt z. B. 1044, 1044,75 und 1.044,75.
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

function parseCsv(text: string): CsvResult {
    // UTF-8-BOM entfernen; Semikolon als Trennzeichen.
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

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        // Vollständig leere Datensätze ignorieren.
        if (
            Object.values(row).every(
                (value) => !value?.trim()
            )
        ) {
            return;
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
                `Datum von="${startText}", Datum bis="${endText}". ` +
                `Das Ende liegt nicht nach dem Beginn. ` +
                `Bei einer Winterzeitumstellung ist eine gesonderte ` +
                `Behandlung anhand der Zeitzone der Datenquelle nötig.`
            );
        }

        // Unvollständige Erzeugungsdaten nicht als 0 interpretieren.
        const hasMissingValue = ALL_ENERGY_COLUMNS.some(
            (column) => isMissingValue(row[column])
        );

        if (hasMissingValue) {
            skippedRows += 1;
            return;
        }

        const renewable = RENEWABLE_COLUMNS.reduce(
            (sum, column) =>
                sum + parseGermanNumber(
                    row[column],
                    column,
                    rowNumber
                ),
            0
        );

        const other = OTHER_COLUMNS.reduce(
            (sum, column) =>
                sum + parseGermanNumber(
                    row[column],
                    column,
                    rowNumber
                ),
            0
        );

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
        });
    });

    if (points.length === 0) {
        throw new Error(
            `Keine vollständig auswertbaren Messwerte vorhanden. ` +
            `${skippedRows} Zeilen enthalten fehlende Erzeugungswerte.`
        );
    }

    points.sort(
        (a, b) => a.start.getTime() - b.start.getTime()
    );

    return { points, skippedRows };
}

export default function IstAnalyse({
    csvUrl = "/Test_Daten3.csv",
    width = 900,
    height = 900,
    marginTop = 30,
    marginRight = 30,
    marginBottom = 60,
    marginLeft = 65,
}: IstAnalyseProps) {
    const interactionRef = useRef<SVGRectElement>(null);
    const clipId = `chart-clip-${useId().replace(/:/g, "")}`;

    const [data, setData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [skippedRows, setSkippedRows] = useState(0);

    const [transform, setTransform] = useState<d3.ZoomTransform>(
        d3.zoomIdentity
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const plotRight = width - marginRight;
    const plotBottom = height - marginBottom;
    const plotWidth = plotRight - marginLeft;
    const plotHeight = plotBottom - marginTop;

    // CSV laden.
    useEffect(() => {
        const controller = new AbortController();

        async function loadData() {
            setLoading(true);
            setError(null);
            setData([]);
            setSkippedRows(0);
            setHoverIndex(null);

            try {
                const response = await fetch(csvUrl, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        `CSV konnte nicht geladen werden: ` +
                        `HTTP ${response.status}`
                    );
                }

                const text = await response.text();

                if (controller.signal.aborted) return;

                const result = parseCsv(text);

                setData(result.points);
                setSkippedRows(result.skippedRows);
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
    }, [csvUrl]);

    const baseX = useMemo(() => {
        let min = data[0]?.start ?? new Date(0);
        let max =
            data[data.length - 1]?.start ?? new Date(60_000);

        // Auch einzelne Messwerte darstellen.
        if (min.getTime() === max.getTime()) {
            const padding = data[0]
                ? Math.max(
                      (data[0].end.getTime() - min.getTime()) / 2,
                      30_000
                  )
                : 30_000;

            min = new Date(min.getTime() - padding);
            max = new Date(max.getTime() + padding);
        }

        return d3.scaleUtc()
            .domain([min, max])
            .range([marginLeft, plotRight]);
    }, [data, marginLeft, plotRight]);

    const y = useMemo(
        () =>
            d3.scaleLinear()
                .domain([0, 100])
                .range([plotBottom, marginTop]),
        [plotBottom, marginTop]
    );

    const x = useMemo(
        () => transform.rescaleX(baseX),
        [transform, baseX]
    );

    useEffect(() => {
        const element = interactionRef.current;
        if (!element) return;

        const selection = d3.select(element);

        const zoom = d3.zoom<SVGRectElement, unknown>()
            .scaleExtent([1, 40])
            .extent([
                [marginLeft, marginTop],
                [plotRight, plotBottom],
            ])
            .translateExtent([
                [marginLeft, marginTop],
                [plotRight, plotBottom],
            ])
            .on(
                "zoom",
                (event: d3.D3ZoomEvent<SVGRectElement, unknown>) => {
                    setTransform(event.transform);
                    setHoverIndex(null);
                }
            );

        selection.call(zoom);

        selection
            .on("dblclick.zoom", null)
            .on("dblclick.reset", (event: MouseEvent) => {
                event.preventDefault();
                selection.call(zoom.transform, d3.zoomIdentity);
            });

        selection.call(zoom.transform, d3.zoomIdentity);

        return () => {
            selection.on(".zoom", null);
            selection.on(".reset", null);
        };
    }, [baseX, marginLeft, marginTop, plotRight, plotBottom]);

    // Zusammenhängende Zeitintervalle zu Liniensegmenten gruppieren.
    // Fehlende Intervalle werden dadurch nicht überbrückt.
    const segments = useMemo(() => {
        const result: DataPoint[][] = [];

        for (const point of data) {
            const current = result[result.length - 1];
            const previous = current?.[current.length - 1];

            if (
                !current ||
                (previous &&
                    point.start.getTime() > previous.end.getTime())
            ) {
                result.push([point]);
            } else {
                current.push(point);
            }
        }

        return result;
    }, [data]);

    const linePath = useMemo(() => {
        const line = d3.line<DataPoint>()
            .x((point) => x(point.start))
            .y((point) => y(point.share));

        return segments
            .map((segment) => line(segment) ?? "")
            .join(" ");
    }, [segments, x, y]);

    // Bei großen Datenmengen nur isolierte Messpunkte markieren.
    const markerPoints = useMemo(
        () =>
            data.length <= 200
                ? data
                : segments
                      .filter((segment) => segment.length === 1)
                      .flat(),
        [data, segments]
    );

    const xTicks = x.ticks(6);
    const yTicks = y.ticks(5);

    const hoverData =
        hoverIndex === null ? undefined : data[hoverIndex];

    const point = hoverData
        ? {
              ...hoverData,
              x: x(hoverData.start),
              y: y(hoverData.share),
          }
        : null;

    const tooltipWidth = Math.min(310, plotWidth);
    const tooltipHeight = 120;

    const tooltipX = point
        ? Math.max(
              marginLeft,
              Math.min(
                  point.x + 14 + tooltipWidth > plotRight
                      ? point.x - tooltipWidth - 14
                      : point.x + 14,
                  plotRight - tooltipWidth
              )
          )
        : 0;

    const tooltipY = point
        ? Math.max(
              marginTop,
              Math.min(
                  point.y - tooltipHeight - 12,
                  plotBottom - tooltipHeight
              )
          )
        : 0;

    return (
        <div className="content-body">
            <h2>
                Anteil erneuerbarer Energien an der Stromerzeugung
            </h2>

            <p className="chart-hint">
                Mausrad: Zoom · Ziehen: Verschieben ·
                Doppelklick: Zurücksetzen
            </p>

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

            {!loading && !error && (
                <p>
                    {data.length.toLocaleString("de-DE")} Messwerte geladen
                </p>
            )}

            {!loading && !error && skippedRows > 0 && (
                <p role="status" style={{ color: "#92400e" }}>
                    Hinweis: {skippedRows.toLocaleString("de-DE")} Zeilen
                    wurden wegen fehlender Erzeugungswerte übersprungen.
                    Für diese Zeiträume wurde kein Anteil berechnet.
                </p>
            )}

            <div className="chart-container">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    width="100%"
                    role="img"
                    aria-label="Anteil erneuerbarer Energien an der Stromerzeugung im Zeitverlauf in Prozent"
                >
                    <defs>
                        <clipPath id={clipId}>
                            <rect
                                x={marginLeft}
                                y={marginTop}
                                width={plotWidth}
                                height={plotHeight}
                            />
                        </clipPath>
                    </defs>

                    {/* Gitternetz */}
                    <g stroke="#e5e7eb" strokeWidth={1}>
                        {yTicks.map((tick) => (
                            <line
                                key={tick}
                                x1={marginLeft}
                                x2={plotRight}
                                y1={y(tick)}
                                y2={y(tick)}
                            />
                        ))}
                    </g>

                    {/* X-Achse */}
                    <g
                        transform={`translate(0,${plotBottom})`}
                        color="#6b7280"
                    >
                        <line
                            x1={marginLeft}
                            x2={plotRight}
                            stroke="currentColor"
                        />

                        {data.length > 0 &&
                            xTicks.map((tick) => (
                                <g
                                    key={tick.getTime()}
                                    transform={`translate(${x(tick)},0)`}
                                >
                                    <line y2={6} stroke="currentColor" />

                                    <text
                                        textAnchor="middle"
                                        fill="currentColor"
                                        fontSize={11}
                                    >
                                        <tspan x={0} y={20}>
                                            {formatTime(tick)}
                                        </tspan>
                                        <tspan x={0} y={36}>
                                            {formatTickDate(tick)}
                                        </tspan>
                                    </text>
                                </g>
                            ))}
                    </g>

                    {/* Y-Achse */}
                    <g
                        transform={`translate(${marginLeft},0)`}
                        color="#6b7280"
                    >
                        <line
                            y1={marginTop}
                            y2={plotBottom}
                            stroke="currentColor"
                        />

                        {yTicks.map((tick) => (
                            <g
                                key={tick}
                                transform={`translate(0,${y(tick)})`}
                            >
                                <line x2={-6} stroke="currentColor" />

                                <text
                                    x={-10}
                                    dy="0.32em"
                                    textAnchor="end"
                                    fill="currentColor"
                                    fontSize={12}
                                >
                                    {tick} %
                                </text>
                            </g>
                        ))}
                    </g>

                    {/* Daten und Fadenkreuz */}
                    <g
                        clipPath={`url(#${clipId})`}
                        pointerEvents="none"
                    >
                        <path
                            d={linePath}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />

                        {markerPoints.map((value, index) => (
                            <circle
                                key={index}
                                cx={x(value.start)}
                                cy={y(value.share)}
                                r={3.5}
                                fill="#2563eb"
                                stroke="white"
                                strokeWidth={1.5}
                            />
                        ))}

                        {point && (
                            <>
                                <line
                                    x1={point.x}
                                    x2={point.x}
                                    y1={marginTop}
                                    y2={plotBottom}
                                    stroke="#64748b"
                                    strokeDasharray="4 4"
                                />

                                <line
                                    x1={marginLeft}
                                    x2={plotRight}
                                    y1={point.y}
                                    y2={point.y}
                                    stroke="#64748b"
                                    strokeDasharray="4 4"
                                />

                                <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r={5}
                                    fill="#2563eb"
                                    stroke="white"
                                    strokeWidth={2}
                                />
                            </>
                        )}
                    </g>

                    {/* Interaktionsfläche */}
                    <rect
                        ref={interactionRef}
                        className="chart-interaction"
                        x={marginLeft}
                        y={marginTop}
                        width={plotWidth}
                        height={plotHeight}
                        fill="transparent"
                        pointerEvents="all"
                        style={{
                            cursor: "crosshair",
                            touchAction: "none",
                        }}
                        onMouseMove={(event) => {
                            if (
                                event.buttons !== 0 ||
                                data.length === 0
                            ) {
                                setHoverIndex(null);
                                return;
                            }

                            const [mouseX] = d3.pointer(
                                event.nativeEvent,
                                event.currentTarget
                            );

                            const hoveredDate = x.invert(mouseX);

                            // In einer Datenlücke keinen Tooltip anzeigen.
                            const leftIndex =
                                dateBisector.right(data, hoveredDate) - 1;

                            const left = data[leftIndex];
                            const right = data[leftIndex + 1];

                            if (
                                left &&
                                right &&
                                hoveredDate.getTime() >= left.end.getTime() &&
                                hoveredDate.getTime() < right.start.getTime()
                            ) {
                                setHoverIndex(null);
                                return;
                            }

                            const index = dateBisector.center(
                                data,
                                hoveredDate
                            );

                            const datum = data[index];

                            if (!datum) {
                                setHoverIndex(null);
                                return;
                            }

                            const pointX = x(datum.start);

                            setHoverIndex(
                                pointX >= marginLeft &&
                                pointX <= plotRight
                                    ? index
                                    : null
                            );
                        }}
                        onMouseLeave={() => setHoverIndex(null)}
                    />

                    {/* Tooltip */}
                    {point && (
                        <g
                            transform={`translate(${tooltipX},${tooltipY})`}
                            pointerEvents="none"
                        >
                            <rect
                                width={tooltipWidth}
                                height={tooltipHeight}
                                rx={6}
                                fill="#0f172a"
                                opacity={0.95}
                            />

                            <text
                                x={12}
                                y={20}
                                fill="#cbd5e1"
                                fontSize={12}
                            >
                                Von: {formatDate(point.start)}
                            </text>

                            <text
                                x={12}
                                y={39}
                                fill="#cbd5e1"
                                fontSize={12}
                            >
                                Bis: {formatDate(point.end)}
                            </text>

                            <text
                                x={12}
                                y={63}
                                fill="white"
                                fontSize={13}
                                fontWeight={600}
                            >
                                Anteil:{" "}
                                {formatNumber.format(point.share)} %
                            </text>

                            <text
                                x={12}
                                y={85}
                                fill="#cbd5e1"
                                fontSize={12}
                            >
                                Erneuerbar:{" "}
                                {formatNumber.format(point.renewable)} MWh
                            </text>

                            <text
                                x={12}
                                y={106}
                                fill="#cbd5e1"
                                fontSize={12}
                            >
                                Gesamt:{" "}
                                {formatNumber.format(point.total)} MWh
                            </text>
                        </g>
                    )}
                </svg>
            </div>
        </div>
    );
}