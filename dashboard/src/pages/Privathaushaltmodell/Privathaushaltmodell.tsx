import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";

type ModuleId =
    | "pv"
    | "battery"
    | "heatpump"
    | "ev"
    | "hems"
    | "insulation";

type Vec3 = [number, number, number];

type ModuleMeta = {
    id: ModuleId;
    badge: string;
    title: string;
    shortTitle: string;
    spec: string;
    color: string;
    anchor: Vec3;
    interior?: boolean;
    summary: string;
    impactHint: string;
};

type OverlayQuad = {
    verts: Vec3[];
    color: string;
    stroke?: string;
    unlit?: boolean;
};

type Face3D = {
    verts: Vec3[];
    color: string;
    alpha?: number;
    unlit?: boolean;
    doubleSided?: boolean;
    overlays?: OverlayQuad[];
};

type LiveFlows = {
    pvKw: number;
    houseBaseKw: number;
    heatpumpKw: number;
    evKw: number;
    batteryKw: number;
    gridKw: number;
    batterySoc: number;
};

const FONT =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const MODULES: readonly ModuleMeta[] = [
    {
        id: "pv",
        badge: "1",
        title: "Photovoltaikanlage (Dach)",
        shortTitle: "Photovoltaik",
        spec: "PLACEHOLDER",
        color: "#eab308",
        anchor: [0, 3.85, 0.95],
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER",
    },
    {
        id: "battery",
        badge: "2",
        title: "Heimspeicher (Batterie)",
        shortTitle: "Batteriespeicher",
        spec: "PLACEHOLDER",
        color: "#10b981",
        anchor: [-1.45, 1.05, -0.65],
        interior: true,
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER",
    },
    {
        id: "heatpump",
        badge: "3",
        title: "Luft-Wasser-Wärmepumpe & Flächenheizung",
        shortTitle: "Wärmepumpe",
        spec: "PLACEHOLDER",
        color: "#f97316",
        anchor: [-3.2, 0.95, 0.65],
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER",
    },
    {
        id: "ev",
        badge: "4",
        title: "Wallbox & E-Auto (Überschussladen / V2H)",
        shortTitle: "Wallbox & E-Auto",
        spec: "PLACEHOLDER",
        color: "#06b6d4",
        anchor: [3.25, 1.0, 0.65],
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER    ",
    },
    {
        id: "hems",
        badge: "5",
        title: "Smart Meter & Energiemanagement (HEMS)",
        shortTitle: "HEMS & Dynamischer Tarif",
        spec: "PLACEHOLDER",
        color: "#8b5cf6",
        anchor: [-0.35, 1.45, -1.2],
        interior: true,
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER",
    },
    {
        id: "insulation",
        badge: "6",
        title: "Gebäudedämmung & 3-fach-Verglasung",
        shortTitle: "Effizienzhülle",
        spec: "PLACEHOLDER",
        color: "#38bdf8",
        anchor: [1.35, 1.55, 1.75],
        summary:
            "PLACEHOLDER",
        impactHint: "PLACEHOLDER",
    },
] as const;

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string): [number, number, number] {
    const num = parseInt(hex.replace("#", ""), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpRgb(c1: string, c2: string, t: number): string {
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);
    const k = clamp(t, 0, 1);
    return `rgb(${Math.round(r1 + (r2 - r1) * k)}, ${Math.round(
        g1 + (g2 - g1) * k
    )}, ${Math.round(b1 + (b2 - b1) * k)})`;
}

function shadeHex(hex: string, factor: number): string {
    const [r, g, b] = hexToRgb(hex);
    const f = clamp(factor, 0.22, 1.3);
    return `rgb(${Math.round(clamp(r * f, 0, 255))}, ${Math.round(
        clamp(g * f, 0, 255)
    )}, ${Math.round(clamp(b * f, 0, 255))})`;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function dot3(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(v: Vec3): Vec3 {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

function centroid3(verts: Vec3[]): Vec3 {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const v of verts) {
        sx += v[0];
        sy += v[1];
        sz += v[2];
    }
    const n = verts.length || 1;
    return [sx / n, sy / n, sz / n];
}

/**
 * Erzeugt einen geschlossenen Quader mit nach außen zeigenden Normalen (CCW).
 */
function addBox(
    faces: Face3D[],
    cx: number,
    cy: number,
    cz: number,
    wx: number,
    wy: number,
    wz: number,
    color: string,
    frontOverlays?: OverlayQuad[]
) {
    const x0 = cx - wx / 2;
    const x1 = cx + wx / 2;
    const y0 = cy - wy / 2;
    const y1 = cy + wy / 2;
    const z0 = cz - wz / 2;
    const z1 = cz + wz / 2;

    const p000: Vec3 = [x0, y0, z0];
    const p100: Vec3 = [x1, y0, z0];
    const p110: Vec3 = [x1, y1, z0];
    const p010: Vec3 = [x0, y1, z0];
    const p001: Vec3 = [x0, y0, z1];
    const p101: Vec3 = [x1, y0, z1];
    const p111: Vec3 = [x1, y1, z1];
    const p011: Vec3 = [x0, y1, z1];

    faces.push(
        { verts: [p001, p101, p111, p011], color, overlays: frontOverlays }, // Vorne (+Z)
        { verts: [p100, p000, p010, p110], color }, // Hinten (-Z)
        { verts: [p000, p001, p011, p010], color }, // Links (-X)
        { verts: [p101, p100, p110, p111], color }, // Rechts (+X)
        { verts: [p011, p111, p110, p010], color }, // Oben (+Y)
        { verts: [p000, p100, p101, p001], color }  // Unten (-Y)
    );
}

/**
 * Unterteilt ein großes Viereck in ein Gitter kleinerer Vierecke für saubere Tiefensortierung.
 */
function addSubdividedQuad(
    faces: Face3D[],
    v00: Vec3,
    v10: Vec3,
    v11: Vec3,
    v01: Vec3,
    nx: number,
    ny: number,
    color: string,
    alpha = 1,
    doubleSided = false
) {
    for (let iy = 0; iy < ny; iy += 1) {
        const ty0 = iy / ny;
        const ty1 = (iy + 1) / ny;
        const left0 = lerp3(v00, v01, ty0);
        const right0 = lerp3(v10, v11, ty0);
        const left1 = lerp3(v00, v01, ty1);
        const right1 = lerp3(v10, v11, ty1);

        for (let ix = 0; ix < nx; ix += 1) {
            const tx0 = ix / nx;
            const tx1 = (ix + 1) / nx;
            faces.push({
                verts: [
                    lerp3(left0, right0, tx0),
                    lerp3(left0, right0, tx1),
                    lerp3(left1, right1, tx1),
                    lerp3(left1, right1, tx0),
                ],
                color,
                alpha,
                doubleSided,
            });
        }
    }
}

function computeLiveFlows(
    hour: number,
    enabled: ReadonlySet<ModuleId>
): LiveFlows {
    const hasPv = enabled.has("pv");
    const hasBat = enabled.has("battery");
    const hasHp = enabled.has("heatpump");
    const hasEv = enabled.has("ev");
    const hasHems = enabled.has("hems");
    const hasIns = enabled.has("insulation");

    const sunPhase =
        hour >= 6 && hour <= 20
            ? Math.sin(((hour - 6) / 14) * Math.PI)
            : 0;
    const pvKw = hasPv ? +(10.2 * Math.pow(sunPhase, 1.35)).toFixed(2) : 0;

    const morningPeak = Math.exp(-Math.pow((hour - 7.5) / 1.8, 2)) * 0.9;
    const eveningPeak = Math.exp(-Math.pow((hour - 19) / 2.2, 2)) * 1.3;
    const houseBaseKw = +(0.35 + morningPeak + eveningPeak).toFixed(2);

    const insFactor = hasIns ? 0.58 : 1.0;
    let heatpumpKw = 0;
    if (hasHp) {
        const coldFactor =
            0.9 + 0.45 * Math.cos(((hour - 4) / 24) * Math.PI * 2);
        const solarBoost =
            hasHems && pvKw > 3
                ? 0.85
                : hasHems && hour >= 17 && hour <= 21
                  ? -0.45
                  : 0;
        heatpumpKw = +(
            Math.max(0.25, (1.45 * coldFactor + solarBoost) * insFactor)
        ).toFixed(2);
    }

    let evKw = 0;
    if (hasEv) {
        if (hasHems && hasPv && hour >= 10.5 && hour <= 15.5) {
            evKw = +(Math.min(7.4, Math.max(1.8, pvKw - 1.5))).toFixed(2);
        } else if (hasHems && !hasPv && hour >= 1 && hour <= 4.5) {
            evKw = 6.5;
        } else if (!hasHems && hour >= 17.5 && hour <= 20.5) {
            evKw = 7.4;
        }
    }

    const totalDemand = houseBaseKw + heatpumpKw + evKw;
    const netBeforeBattery = pvKw - totalDemand;

    const batterySoc = hasBat
        ? Math.round(
              clamp(
                  25 +
                      68 *
                          Math.sin(
                              ((clamp(hour, 4, 24) - 7) / 15) * Math.PI
                          ),
                  15,
                  98
              )
          )
        : 0;

    let batteryKw = 0;
    if (hasBat) {
        if (netBeforeBattery > 0.1 && batterySoc < 98) {
            batteryKw = +Math.min(4.5, netBeforeBattery).toFixed(2);
        } else if (netBeforeBattery < -0.1 && batterySoc > 16) {
            batteryKw = -Math.min(4.2, -netBeforeBattery).toFixed(2);
        }
    }

    const gridKw = +(totalDemand + batteryKw - pvKw).toFixed(2);

    return {
        pvKw,
        houseBaseKw,
        heatpumpKw,
        evKw,
        batteryKw,
        gridKw,
        batterySoc,
    };
}

export default function Privathaushaltmodell() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedModule, setSelectedModule] =
        useState<ModuleId>("pv");
    const [enabledModules, setEnabledModules] = useState<Set<ModuleId>>(
        () => new Set(MODULES.map((m) => m.id))
    );
    const [xray, setXray] = useState(false);
    const [hour, setHour] = useState(13.0);
    const [autoPlayDay, setAutoPlayDay] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const cameraRef = useRef({
        yaw: -0.62,
        pitch: 0.42,
        zoom: 1.05,
    });

    const hotspotPositionsRef = useRef<
        { id: ModuleId; x: number; y: number }[]
    >([]);

    const activeMeta =
        MODULES.find((m) => m.id === selectedModule) ?? MODULES[0];
    const effectiveXray = xray || Boolean(activeMeta.interior);

    const liveFlows = useMemo(
        () => computeLiveFlows(hour, enabledModules),
        [hour, enabledModules]
    );

    // Synchroner Ref für die persistente Render-Schleife (verhindert jegliches Neu-Mounten / Flackern).
    const renderStateRef = useRef({
        hour,
        autoPlayDay,
        enabledModules,
        selectedModule,
        effectiveXray,
    });

    renderStateRef.current = {
        hour,
        autoPlayDay,
        enabledModules,
        selectedModule,
        effectiveXray,
    };

    const hourRef = useRef(hour);
    const handleSliderChange = (nextHour: number) => {
        setAutoPlayDay(false);
        hourRef.current = nextHour;
        setHour(nextHour);
    };

    useEffect(() => {
        if (!isFullscreen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsFullscreen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isFullscreen]);

    const toggleModule = (id: ModuleId) => {
        setEnabledModules((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };


    // Einmalig gemountete, komplett flackerfreie 3D-Engine.
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let disposed = false;
        let rafId = 0;
        let dragging = false;
        let dragMoved = false;
        let lastX = 0;
        let lastY = 0;
        let cssW = 800;
        let cssH = 450;
        let dpr = 1;
        let prevTimeMs = performance.now();
        let lastUiSyncMs = 0;

        const syncCanvasSize = () => {
            const rect = container.getBoundingClientRect();
            const nextCssW = Math.max(200, rect.width);
            const nextCssH = Math.max(240, rect.height);
            const nextDpr = Math.min(
                2,
                Math.max(1, window.devicePixelRatio || 1)
            );
            const targetW = Math.round(nextCssW * nextDpr);
            const targetH = Math.round(nextCssH * nextDpr);

            cssW = nextCssW;
            cssH = nextCssH;
            dpr = nextDpr;

            // Nur bei echter Größenänderung Puffer neu anlegen (verhindert Flackern!).
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }
        };

        const ro = new ResizeObserver(syncCanvasSize);
        ro.observe(container);
        syncCanvasSize();

        const TARGET: Vec3 = [0, 1.45, 0];
        const CAM_DIST = 14.5;

        const getCameraWorldPos = (): Vec3 => {
            const { yaw, pitch } = cameraRef.current;
            return [
                TARGET[0] + CAM_DIST * Math.cos(pitch) * Math.sin(yaw),
                TARGET[1] + CAM_DIST * Math.sin(pitch),
                TARGET[2] + CAM_DIST * Math.cos(pitch) * Math.cos(yaw),
            ];
        };

        // Rechtshändige Projektion: kleineres depth = näher an der Kamera.
        const project = (
            p: Vec3
        ): { x: number; y: number; depth: number } => {
            const { yaw, pitch, zoom } = cameraRef.current;
            const cy = Math.cos(yaw);
            const sy = Math.sin(yaw);
            const cp = Math.cos(pitch);
            const sp = Math.sin(pitch);

            const px = p[0] - TARGET[0];
            const py = p[1] - TARGET[1];
            const pz = p[2] - TARGET[2];

            const x1 = px * cy - pz * sy;
            const z1 = px * sy + pz * cy;

            const yCam = py * cp - z1 * sp;
            const zView = py * sp + z1 * cp;
            const depth = CAM_DIST - zView;

            const baseScale = Math.min(cssW, cssH) * 1.05 * zoom;
            const scale = baseScale / Math.max(2.5, depth);

            return {
                x: cssW * 0.5 + x1 * scale,
                y: cssH * 0.54 - yCam * scale,
                depth,
            };
        };

        const onPointerDown = (e: PointerEvent) => {
            dragging = true;
            dragMoved = false;
            lastX = e.clientX;
            lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (!dragging) {
                const hit = hotspotPositionsRef.current.some(
                    (h) => Math.hypot(mx - h.x, my - h.y) <= 16
                );
                canvas.style.cursor = hit ? "pointer" : "grab";
                return;
            }

            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            if (Math.hypot(dx, dy) > 3) dragMoved = true;

            lastX = e.clientX;
            lastY = e.clientY;

            cameraRef.current.yaw -= dx * 0.0085;
            cameraRef.current.pitch = clamp(
                cameraRef.current.pitch + dy * 0.0065,
                0.15,
                1.2
            );
            canvas.style.cursor = "grabbing";
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            canvas.style.cursor = "grab";

            if (!dragMoved) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                for (const h of hotspotPositionsRef.current) {
                    if (Math.hypot(mx - h.x, my - h.y) <= 18) {
                        setSelectedModule(h.id);
                        break;
                    }
                }
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            cameraRef.current.zoom = clamp(
                cameraRef.current.zoom * factor,
                0.65,
                2.0
            );
        };

        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });

        const renderFrame = (timeMs: number) => {
            if (disposed) return;

            const dtSec = Math.min(0.1, (timeMs - prevTimeMs) * 0.001);
            prevTimeMs = timeMs;
            const tSec = timeMs * 0.001;

            const state = renderStateRef.current;

            // Flüssige kontinuierliche Uhrzeit-Animation beim Taglauf ohne Flackern.
            if (state.autoPlayDay) {
                hourRef.current = (hourRef.current + dtSec * 1.6) % 24;
                if (timeMs - lastUiSyncMs > 120) {
                    lastUiSyncMs = timeMs;
                    setHour(+hourRef.current.toFixed(2));
                }
            } else {
                hourRef.current = state.hour;
            }

            const curHour = hourRef.current;
            const enabled = state.enabledModules;
            const xrayMode = state.effectiveXray;
            const flows = computeLiveFlows(curHour, enabled);
            const camPos = getCameraWorldPos();

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Stufenlose Tageslicht-Kurve [0..1] ohne harte Sprünge.
            const daylight =
                curHour >= 5 && curHour <= 21
                    ? Math.pow(
                          Math.sin(((curHour - 5) / 16) * Math.PI),
                          0.85
                      )
                    : 0;

            const skyGrad = ctx.createLinearGradient(0, 0, 0, cssH);
            skyGrad.addColorStop(
                0,
                lerpRgb("#020617", "#0c4a6e", daylight)
            );
            skyGrad.addColorStop(
                0.55,
                lerpRgb("#0f172a", "#0284c7", daylight * 0.75)
            );
            skyGrad.addColorStop(
                1,
                lerpRgb("#020617", "#0f172a", daylight)
            );
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, cssW, cssH);

            // Sonnenposition & weicher Lichtschein am Himmel.
            const sunArc = ((curHour - 5.5) / 15) * Math.PI;
            const sunDir = normalize3([
                -Math.cos(sunArc) * 4.5,
                Math.max(0.8, Math.sin(sunArc) * 5.5),
                3.2,
            ]);

            if (daylight > 0.02) {
                const sunWorld: Vec3 = [
                    -Math.cos(sunArc) * 4.6,
                    1.6 + Math.sin(sunArc) * 3.1,
                    -2.4,
                ];
                const sunPos = project(sunWorld);
                const glow = ctx.createRadialGradient(
                    sunPos.x,
                    sunPos.y,
                    4,
                    sunPos.x,
                    sunPos.y,
                    60
                );
                glow.addColorStop(
                    0,
                    `rgba(254, 240, 138, ${0.95 * daylight})`
                );
                glow.addColorStop(
                    0.35,
                    `rgba(250, 204, 21, ${0.38 * daylight})`
                );
                glow.addColorStop(1, "rgba(250, 204, 21, 0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(sunPos.x, sunPos.y, 60, 0, Math.PI * 2);
                ctx.fill();
            }

            // 1) Bodenplatte, Garten, Einfahrt & Hausgrundriss auf y = 0.
            const drawGroundPoly = (
                pts: Vec3[],
                fill: string,
                stroke?: string
            ) => {
                const p2 = pts.map(project);
                ctx.beginPath();
                ctx.moveTo(p2[0].x, p2[0].y);
                for (let i = 1; i < p2.length; i += 1) {
                    ctx.lineTo(p2[i].x, p2[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                if (stroke) {
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            };

            drawGroundPoly(
                [
                    [-5.2, 0, -3.6],
                    [-5.2, 0, 3.6],
                    [5.2, 0, 3.6],
                    [5.2, 0, -3.6],
                ],
                lerpRgb("#0a2617", "#166534", daylight * 0.85),
                "rgba(148, 163, 184, 0.3)"
            );

            // Einfahrt rechts + Gehweg zur Haustür.
            drawGroundPoly(
                [
                    [2.2, 0.01, -1.5],
                    [2.2, 0.01, 2.9],
                    [4.45, 0.01, 2.9],
                    [4.45, 0.01, -1.5],
                ],
                lerpRgb("#1e293b", "#475569", daylight * 0.7)
            );
            drawGroundPoly(
                [
                    [-0.45, 0.01, 1.7],
                    [-0.45, 0.01, 3.6],
                    [0.35, 0.01, 3.6],
                    [0.35, 0.01, 1.7],
                ],
                lerpRgb("#334155", "#64748b", daylight * 0.7)
            );

            // Haus-Innenbodenplatte.
            drawGroundPoly(
                [
                    [-2.2, 0.02, -1.7],
                    [-2.2, 0.02, 1.7],
                    [2.2, 0.02, 1.7],
                    [2.2, 0.02, -1.7],
                ],
                xrayMode ? "#e2e8f0" : "#1e293b"
            );

            // Fußbodenheizung im Erdgeschoss bei Röntgenblick.
            if (xrayMode && enabled.has("heatpump")) {
                ctx.strokeStyle =
                    flows.heatpumpKw > 0.1
                        ? "rgba(249, 115, 22, 0.9)"
                        : "rgba(148, 163, 184, 0.5)";
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                for (let r = 0; r < 5; r += 1) {
                    const zL = -1.15 + r * 0.58;
                    const pA = project([-0.3, 0.05, zL]);
                    const pB = project([1.85, 0.05, zL]);
                    if (r === 0) ctx.moveTo(pA.x, pA.y);
                    else ctx.lineTo(pA.x, pA.y);
                    ctx.lineTo(pB.x, pB.y);
                }
                ctx.stroke();
            }

            // 2) 3D-Körper & Flächen mit korrekten Außen-Normalen aufbauen.
            const faces: Face3D[] = [];
            const hasIns = enabled.has("insulation");
            const wallColor = hasIns ? "#f8fafc" : "#cbd5e1";
            const hx = 2.2;
            const hy = 2.55;
            const hz = 1.7;

            if (xrayMode) {
                // Halbtransparente unterteilte Hauswände für freien Blick in den Technikraum.
                addSubdividedQuad(
                    faces,
                    [-hx, 0, hz],
                    [hx, 0, hz],
                    [hx, hy, hz],
                    [-hx, hy, hz],
                    4,
                    2,
                    wallColor,
                    0.16,
                    true
                );
                addSubdividedQuad(
                    faces,
                    [hx, 0, -hz],
                    [-hx, 0, -hz],
                    [-hx, hy, -hz],
                    [hx, hy, -hz],
                    4,
                    2,
                    wallColor,
                    0.35,
                    true
                );
                addSubdividedQuad(
                    faces,
                    [-hx, 0, -hz],
                    [-hx, 0, hz],
                    [-hx, hy, hz],
                    [-hx, hy, -hz],
                    3,
                    2,
                    wallColor,
                    0.28,
                    true
                );
                addSubdividedQuad(
                    faces,
                    [hx, 0, hz],
                    [hx, 0, -hz],
                    [hx, hy, -hz],
                    [hx, hy, hz],
                    3,
                    2,
                    wallColor,
                    0.18,
                    true
                );

                // Innenraum-Geräte: Batteriespeicher, HEMS & Pufferspeicher.
                if (enabled.has("battery")) {
                    const socH = 1.05 * (flows.batterySoc / 100);
                    addBox(
                        faces,
                        -1.45,
                        0.75,
                        -0.75,
                        0.62,
                        1.45,
                        0.42,
                        "#f1f5f9",
                        [
                            {
                                verts: [
                                    [-1.62, 0.16, -0.539],
                                    [-1.28, 0.16, -0.539],
                                    [-1.28, 0.16 + socH, -0.539],
                                    [-1.62, 0.16 + socH, -0.539],
                                ],
                                color: "#10b981",
                                unlit: true,
                            },
                        ]
                    );
                }

                if (enabled.has("hems")) {
                    addBox(
                        faces,
                        -0.35,
                        1.45,
                        -1.42,
                        0.72,
                        0.82,
                        0.24,
                        "#ede9fe",
                        [
                            {
                                verts: [
                                    [-0.58, 1.24, -1.299],
                                    [-0.12, 1.24, -1.299],
                                    [-0.12, 1.66, -1.299],
                                    [-0.58, 1.66, -1.299],
                                ],
                                color: "#7c3aed",
                                unlit: true,
                            },
                        ]
                    );
                }

                if (enabled.has("heatpump")) {
                    addBox(
                        faces,
                        -1.45,
                        0.8,
                        0.55,
                        0.58,
                        1.55,
                        0.58,
                        "#fed7aa"
                    );
                }
            } else {
                // Solide Außenwände mit oberflächengebundenen Fenstern & Haustür (kein Z-Fighting!).
                const winGlass = hasIns ? "#38bdf8" : "#64748b";
                const winFrame = hasIns ? "#0f172a" : "#475569";

                const frontOverlays: OverlayQuad[] = [
                    // Haustür
                    {
                        verts: [
                            [-0.38, 0.02, hz],
                            [0.28, 0.02, hz],
                            [0.28, 1.55, hz],
                            [-0.38, 1.55, hz],
                        ],
                        color: "#1e293b",
                        stroke: "#94a3b8",
                    },
                    // Fenster links
                    {
                        verts: [
                            [-1.75, 0.85, hz],
                            [-0.75, 0.85, hz],
                            [-0.75, 1.9, hz],
                            [-1.75, 1.9, hz],
                        ],
                        color: winGlass,
                        stroke: winFrame,
                    },
                    // Fenster rechts
                    {
                        verts: [
                            [0.72, 0.85, hz],
                            [1.75, 0.85, hz],
                            [1.75, 1.9, hz],
                            [0.72, 1.9, hz],
                        ],
                        color: winGlass,
                        stroke: winFrame,
                    },
                ];

                const backOverlays: OverlayQuad[] = [
                    // Terrassentür / Gartenfenster hinten
                    {
                        verts: [
                            [1.6, 0.1, -hz],
                            [0.3, 0.1, -hz],
                            [0.3, 1.9, -hz],
                            [1.6, 1.9, -hz],
                        ],
                        color: winGlass,
                        stroke: winFrame,
                    },
                    {
                        verts: [
                            [-0.5, 0.9, -hz],
                            [-1.6, 0.9, -hz],
                            [-1.6, 1.9, -hz],
                            [-0.5, 1.9, -hz],
                        ],
                        color: winGlass,
                        stroke: winFrame,
                    },
                ];

                faces.push(
                    {
                        verts: [
                            [-hx, 0, hz],
                            [hx, 0, hz],
                            [hx, hy, hz],
                            [-hx, hy, hz],
                        ],
                        color: wallColor,
                        overlays: frontOverlays,
                    },
                    {
                        verts: [
                            [hx, 0, -hz],
                            [-hx, 0, -hz],
                            [-hx, hy, -hz],
                            [hx, hy, -hz],
                        ],
                        color: wallColor,
                        overlays: backOverlays,
                    },
                    {
                        verts: [
                            [-hx, 0, -hz],
                            [-hx, 0, hz],
                            [-hx, hy, hz],
                            [-hx, hy, -hz],
                        ],
                        color: wallColor,
                    },
                    {
                        verts: [
                            [hx, 0, hz],
                            [hx, 0, -hz],
                            [hx, hy, -hz],
                            [hx, hy, hz],
                        ],
                        color: wallColor,
                        overlays: [
                            {
                                verts: [
                                    [hx, 0.95, 0.45],
                                    [hx, 0.95, -0.55],
                                    [hx, 1.85, -0.55],
                                    [hx, 1.85, 0.45],
                                ],
                                color: winGlass,
                                stroke: winFrame,
                            },
                        ],
                    }
                );
            }

            // Satteldach inkl. direkt auf den Dachflächen liegender PV-Module.
            const rX = hx + 0.2;
            const rZ = hz + 0.2;
            const ridgeY = 4.2;
            const roofColor = hasIns ? "#334155" : "#475569";
            const roofAlpha = xrayMode ? 0.28 : 1;

            const buildPvOverlays = (side: 1 | -1): OverlayQuad[] => {
                if (!enabled.has("pv")) return [];
                const mods: OverlayQuad[] = [];
                const pvFill = flows.pvKw > 0.25 ? "#1d4ed8" : "#0f172a";

                for (let row = 0; row < 2; row += 1) {
                    const s0 = 0.14 + row * 0.42;
                    const s1 = s0 + 0.36;
                    const y0 = hy + (ridgeY - hy) * s0;
                    const y1 = hy + (ridgeY - hy) * s1;
                    const z0 = side * rZ * (1 - s0);
                    const z1 = side * rZ * (1 - s1);

                    for (let col = 0; col < 5; col += 1) {
                        const xA = -1.95 + col * 0.8;
                        const xB = xA + 0.72;
                        mods.push({
                            verts:
                                side === 1
                                    ? [
                                          [xA, y0, z0],
                                          [xB, y0, z0],
                                          [xB, y1, z1],
                                          [xA, y1, z1],
                                      ]
                                    : [
                                          [xB, y0, z0],
                                          [xA, y0, z0],
                                          [xA, y1, z1],
                                          [xB, y1, z1],
                                      ],
                            color: pvFill,
                            stroke: "#93c5fd",
                        });
                    }
                }
                return mods;
            };

            faces.push(
                // Vordere Dachfläche (+Z)
                {
                    verts: [
                        [-rX, hy, rZ],
                        [rX, hy, rZ],
                        [rX, ridgeY, 0],
                        [-rX, ridgeY, 0],
                    ],
                    color: roofColor,
                    alpha: roofAlpha,
                    doubleSided: xrayMode,
                    overlays: buildPvOverlays(1),
                },
                // Hintere Dachfläche (-Z)
                {
                    verts: [
                        [rX, hy, -rZ],
                        [-rX, hy, -rZ],
                        [-rX, ridgeY, 0],
                        [rX, ridgeY, 0],
                    ],
                    color: roofColor,
                    alpha: roofAlpha,
                    doubleSided: xrayMode,
                    overlays: buildPvOverlays(-1),
                },
                // Giebeldreiecke links & rechts
                {
                    verts: [
                        [-hx, hy, -hz],
                        [-hx, hy, hz],
                        [-hx, ridgeY, 0],
                    ],
                    color: wallColor,
                    alpha: xrayMode ? 0.28 : 1,
                    doubleSided: xrayMode,
                },
                {
                    verts: [
                        [hx, hy, hz],
                        [hx, hy, -hz],
                        [hx, ridgeY, 0],
                    ],
                    color: wallColor,
                    alpha: xrayMode ? 0.18 : 1,
                    doubleSided: xrayMode,
                }
            );

            // Außengerät der Luft-Wasser-Wärmepumpe links neben dem Haus.
            if (enabled.has("heatpump")) {
                addBox(
                    faces,
                    -3.2,
                    0.55,
                    0.65,
                    0.95,
                    1.1,
                    0.55,
                    "#f1f5f9",
                    [
                        {
                            verts: [
                                [-3.55, 0.2, 0.926],
                                [-2.9, 0.2, 0.926],
                                [-2.9, 0.9, 0.926],
                                [-3.55, 0.9, 0.926],
                            ],
                            color: "#1e293b",
                            stroke: "#64748b",
                        },
                    ]
                );
            }

            // Wallbox & E-Auto rechts in der Einfahrt.
            if (enabled.has("ev")) {
                addBox(
                    faces,
                    hx + 0.1,
                    1.2,
                    0.65,
                    0.18,
                    0.42,
                    0.3,
                    "#06b6d4"
                );
                // Fahrzeug-Unterbau & Glaskabine
                addBox(
                    faces,
                    3.3,
                    0.38,
                    0.75,
                    1.22,
                    0.44,
                    2.2,
                    "#0284c7"
                );
                addBox(
                    faces,
                    3.3,
                    0.76,
                    0.62,
                    1.02,
                    0.36,
                    1.18,
                    "#bae6fd"
                );
                // Räder
                for (const wx of [2.66, 3.94]) {
                    for (const wz of [0.05, 1.42]) {
                        addBox(
                            faces,
                            wx,
                            0.2,
                            wz,
                            0.14,
                            0.36,
                            0.4,
                            "#0f172a"
                        );
                    }
                }
            }

            // Stromnetz-Anschlusskasten vorne links.
            addBox(
                faces,
                -4.45,
                0.55,
                2.65,
                0.45,
                1.1,
                0.35,
                "#64748b"
            );

            // 3) Backface-Culling + korrekte Tiefensortierung (großes depth zuerst = hinten nach vorne).
            type DrawItem = {
                face: Face3D;
                pVerts: { x: number; y: number; depth: number }[];
                depth: number;
                shade: number;
                frontFacing: boolean;
            };

            const drawList: DrawItem[] = [];

            for (const f of faces) {
                const n = normalize3(
                    cross3(
                        sub3(f.verts[1], f.verts[0]),
                        sub3(f.verts[2], f.verts[0])
                    )
                );
                const center = centroid3(f.verts);
                const toCam = sub3(camPos, center);
                const frontFacing = dot3(n, toCam) > 0;

                if (!frontFacing && !f.doubleSided) {
                    continue;
                }

                const pVerts = f.verts.map(project);
                const avgDepth =
                    pVerts.reduce((sum, v) => sum + v.depth, 0) /
                    pVerts.length;

                const effNormal: Vec3 = frontFacing
                    ? n
                    : [-n[0], -n[1], -n[2]];
                const sunDot = Math.max(0, dot3(effNormal, sunDir));
                const ambient = 0.46 + 0.24 * daylight;
                const shade = ambient + sunDot * (0.38 + 0.26 * daylight);

                drawList.push({
                    face: f,
                    pVerts,
                    depth: avgDepth,
                    shade,
                    frontFacing,
                });
            }

            // Größtes depth (am weitesten entfernt) zuerst zeichnen!
            drawList.sort((a, b) => b.depth - a.depth);

            for (const item of drawList) {
                const { face, pVerts, shade, frontFacing } = item;
                ctx.save();
                ctx.globalAlpha = face.alpha ?? 1;

                ctx.beginPath();
                ctx.moveTo(pVerts[0].x, pVerts[0].y);
                for (let i = 1; i < pVerts.length; i += 1) {
                    ctx.lineTo(pVerts[i].x, pVerts[i].y);
                }
                ctx.closePath();

                ctx.fillStyle = face.unlit
                    ? face.color
                    : shadeHex(face.color, shade);
                ctx.fill();

                ctx.strokeStyle = "rgba(15, 23, 42, 0.32)";
                ctx.lineWidth = 0.85;
                ctx.stroke();

                // Oberflächen-Overlays (Fenster, Tür, PV-Module, Anzeigen) direkt auf der Vorderseite zeichnen.
                if (frontFacing && face.overlays) {
                    for (const ov of face.overlays) {
                        const ovPts = ov.verts.map(project);
                        ctx.beginPath();
                        ctx.moveTo(ovPts[0].x, ovPts[0].y);
                        for (let i = 1; i < ovPts.length; i += 1) {
                            ctx.lineTo(ovPts[i].x, ovPts[i].y);
                        }
                        ctx.closePath();
                        ctx.fillStyle = ov.unlit
                            ? ov.color
                            : shadeHex(ov.color, shade * 1.04);
                        ctx.fill();
                        if (ov.stroke) {
                            ctx.strokeStyle = ov.stroke;
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    }
                }

                ctx.restore();
            }

            // Rotierendes Lüfterrad auf der Vorderseite der Wärmepumpe (nur wenn Vorderseite sichtbar).
            if (
                enabled.has("heatpump") &&
                flows.heatpumpKw > 0.1 &&
                camPos[2] > 0.93
            ) {
                const fanCenter = project([-3.22, 0.55, 0.94]);
                ctx.save();
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 2;
                for (let b = 0; b < 3; b += 1) {
                    const ang = tSec * 5.5 + (b * Math.PI * 2) / 3;
                    ctx.beginPath();
                    ctx.moveTo(
                        fanCenter.x - Math.cos(ang) * 8,
                        fanCenter.y - Math.sin(ang) * 8
                    );
                    ctx.lineTo(
                        fanCenter.x + Math.cos(ang) * 8,
                        fanCenter.y + Math.sin(ang) * 8
                    );
                    ctx.stroke();
                }
                ctx.restore();
            }

            // 4) Animierte 3D-Energieflüsse.
            const hub: Vec3 = [-0.35, 1.4, -1.1];

            const drawFlow = (
                from: Vec3,
                to: Vec3,
                kw: number,
                color: string
            ) => {
                if (kw <= 0.05) return;
                const pA = project(from);
                const pB = project(to);

                ctx.save();
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.45;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(pA.x, pA.y);
                ctx.lineTo(pB.x, pB.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.globalAlpha = 0.95;
                const speed = clamp(0.32 + kw * 0.1, 0.32, 1.25);
                for (let k = 0; k < 3; k += 1) {
                    const phase = (tSec * speed + k / 3) % 1;
                    const pos = project(lerp3(from, to, phase));
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, 3.6, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                }
                ctx.restore();
            };

            drawFlow([0, 3.6, 0.25], hub, flows.pvKw, "#facc15");
            if (flows.batteryKw > 0) {
                drawFlow(
                    hub,
                    [-1.45, 0.9, -0.75],
                    flows.batteryKw,
                    "#10b981"
                );
            } else if (flows.batteryKw < 0) {
                drawFlow(
                    [-1.45, 0.9, -0.75],
                    hub,
                    -flows.batteryKw,
                    "#10b981"
                );
            }
            drawFlow(
                hub,
                [-3.2, 0.65, 0.65],
                flows.heatpumpKw,
                "#fb923c"
            );
            drawFlow(hub, [2.3, 1.2, 0.65], flows.evKw, "#22d3ee");
            drawFlow(
                [2.3, 1.2, 0.65],
                [2.85, 0.55, 0.65],
                flows.evKw,
                "#22d3ee"
            );
            if (flows.gridKw > 0.05) {
                drawFlow(
                    [-4.45, 0.7, 2.65],
                    hub,
                    flows.gridKw,
                    "#94a3b8"
                );
            } else if (flows.gridKw < -0.05) {
                drawFlow(
                    hub,
                    [-4.45, 0.7, 2.65],
                    -flows.gridKw,
                    "#34d399"
                );
            }

            // 5) Klickbare 3D-Hotspot-Pins (1–6).
            const nextHotspots: { id: ModuleId; x: number; y: number }[] =
                [];

            for (const mod of MODULES) {
                const pos = project(mod.anchor);
                const isSel = mod.id === state.selectedModule;
                const isOn = enabled.has(mod.id);
                const radius = isSel ? 14 : 11;

                nextHotspots.push({ id: mod.id, x: pos.x, y: pos.y });

                ctx.save();
                if (isSel) {
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = isOn ? mod.color : "#475569";
                ctx.fill();
                ctx.lineWidth = isSel ? 2.5 : 1.5;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();

                ctx.fillStyle = "#0f172a";
                ctx.font = `700 11px ${FONT}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(mod.badge, pos.x, pos.y + 0.5);
                ctx.restore();
            }

            hotspotPositionsRef.current = nextHotspots;

            rafId = requestAnimationFrame(renderFrame);
        };

        rafId = requestAnimationFrame(renderFrame);

        return () => {
            disposed = true;
            cancelAnimationFrame(rafId);
            ro.disconnect();
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointermove", onPointerMove);
            canvas.removeEventListener("pointerup", onPointerUp);
            canvas.removeEventListener("wheel", onWheel);
        };
    }, []);

    const formatClock = (h: number) => {
        const totalMins = Math.round(h * 60) % (24 * 60);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
            2,
            "0"
        )} Uhr`;
    };

    const setCameraPreset = (
        yaw: number,
        pitch: number,
        zoom: number,
        cut = false
    ) => {
        cameraRef.current = { yaw, pitch, zoom };
        setXray(cut);
    };

    const wrapperStyle: CSSProperties = isFullscreen
        ? {
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(2, 6, 23, 0.85)",
              backdropFilter: "blur(5px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
          }
        : {};

    return (
        <div className="content-body" style={{ fontFamily: FONT }}>
            <div style={wrapperStyle}>
                <div
                    style={{
                        width: isFullscreen ? "min(1280px, 100%)" : "100%",
                        maxHeight: isFullscreen ? "95vh" : undefined,
                        overflowY: isFullscreen ? "auto" : undefined,
                        background: "#0f172a",
                        color: "#f8fafc",
                        borderRadius: 16,
                        border: "1px solid #334155",
                        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.25)",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {/* Kopfleiste */}
                    <div
                        style={{
                            padding: "14px 18px",
                            borderBottom: "1px solid #1e293b",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 10,
                        }}
                    >
                        <div>
                            <h2 style={{ margin: 0, color: "#94a3b8", fontSize: 18 }}>
                                Idealer Privathaushalt für die Energiewende
                            </h2>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={() => setCameraPreset(-0.62, 0.42, 1.05, false)}
                                style={OVERLAY_BTN_STYLE}
                            >
                                Außenansicht
                            </button>
                            <button
                                type="button"
                                onClick={() => setCameraPreset(-0.35, 0.9, 1.15, false)}
                                style={OVERLAY_BTN_STYLE}
                            >
                                Dach / PV
                            </button>
                            <button
                                type="button"
                                onClick={() => setXray((v) => !v)}
                                style={{
                                    ...OVERLAY_BTN_STYLE,
                                    background: effectiveXray ? "#2563eb" : "#1e293b",
                                    borderColor: effectiveXray ? "#60a5fa" : "#334155",
                                }}
                            >
                                {effectiveXray ? "Röntgenblick aktiv" : "Röntgenblick (Innenraum)"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen((v) => !v)}
                                style={{
                                    ...OVERLAY_BTN_STYLE,
                                    background: isFullscreen ? "#dc2626" : "#334155",
                                    borderColor: isFullscreen ? "#ef4444" : "#475569",
                                    fontWeight: 600,
                                }}
                            >
                                {isFullscreen ? "Vollbild beenden ✕" : "Vollbild ⛶"}
                            </button>
                        </div>
                    </div>

                    {/* Hauptbereich: Links 3D-Bühne + Tageszeitregler, Rechts KPIs & Bausteine */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                        }}
                    >
                        {/* 3D-Canvas + HUD-Overlay + Uhrzeit */}
                        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                            <div
                                ref={containerRef}
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    height: isFullscreen ? 500 : 450,
                                    borderRadius: 12,
                                    overflow: "hidden",
                                    border: "1px solid #1e293b",
                                }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        touchAction: "none",
                                        cursor: "grab",
                                    }}
                                />

                                {/* Live-Leistungs-Overlay im 3D-Viewport */}
                                <div
                                    style={{
                                        position: "absolute",
                                        top: 10,
                                        left: 10,
                                        right: 10,
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 6,
                                        pointerEvents: "none",
                                    }}
                                >
                                    <span style={HUD_BADGE_STYLE}>
                                        ☀️ PV: <strong style={{ color: "#facc15" }}>{liveFlows.pvKw} kW</strong>
                                    </span>
                                    <span style={HUD_BADGE_STYLE}>
                                        🔋 Akku:{" "}
                                        <strong style={{ color: "#34d399" }}>
                                            {enabledModules.has("battery")
                                                ? `${liveFlows.batterySoc} % (${
                                                      liveFlows.batteryKw >= 0 ? "+" : ""
                                                  }${liveFlows.batteryKw} kW)`
                                                : "Aus"}
                                        </strong>
                                    </span>
                                    <span style={HUD_BADGE_STYLE}>
                                        ♨️ Wärmepumpe:{" "}
                                        <strong style={{ color: "#fb923c" }}>{liveFlows.heatpumpKw} kW</strong>
                                    </span>
                                    <span style={HUD_BADGE_STYLE}>
                                        🚗 Wallbox:{" "}
                                        <strong style={{ color: "#22d3ee" }}>{liveFlows.evKw} kW</strong>
                                    </span>
                                    <span style={HUD_BADGE_STYLE}>
                                        ⚡ Netz:{" "}
                                        <strong
                                            style={{
                                                color: liveFlows.gridKw <= 0 ? "#34d399" : "#cbd5e1",
                                            }}
                                        >
                                            {liveFlows.gridKw <= 0
                                                ? `${Math.abs(liveFlows.gridKw)} kW Einspeisung`
                                                : `${liveFlows.gridKw} kW Bezug`}
                                        </strong>
                                    </span>
                                </div>
                            </div>

                            {/* Sonnenstands- / Uhrzeit-Regler */}
                            <div
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    background: "#1e293b",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    flexWrap: "wrap",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setAutoPlayDay((v) => !v)}
                                    style={{
                                        ...OVERLAY_BTN_STYLE,
                                        background: autoPlayDay ? "#eab308" : "#0f172a",
                                        color: autoPlayDay ? "#0f172a" : "#f8fafc",
                                        fontWeight: 600,
                                    }}
                                >
                                    {autoPlayDay ? "⏸ Pause" : "▶ Taglauf"}
                                </button>

                                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 82 }}>
                                    {formatClock(hour)}
                                </span>

                                <input
                                    type="range"
                                    min={0}
                                    max={23.75}
                                    step={0.05}
                                    value={hour}
                                    onChange={(e) => handleSliderChange(Number(e.target.value))}
                                    style={{ flex: 1, minWidth: 140, accentColor: "#eab308" }}
                                    aria-label="Uhrzeit für Sonnenstand und Lastfluss"
                                />
                            </div>
                        </div>

                        {/* Rechte Spalte: Jahres-KPIs, Detailkarte & Baustein-Konfigurator */}
                        <div
                            style={{
                                padding: 16,
                                borderLeft: "1px solid #1e293b",
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }}
                        >
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                <div style={KPI_BOX_STYLE}>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Autarkiegrad</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#34d399" }}>
                                        PLACEHOLDER
                                    </div>
                                </div>
                                <div style={KPI_BOX_STYLE}>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>CO₂-Vermeidung</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8" }}>
                                        PLACEHOLDER
                                    </div>
                                </div>
                                <div style={KPI_BOX_STYLE}>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Ersparnis</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#facc15" }}>
                                        PLACEHOLDER
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{
                                    padding: "12px 14px",
                                    borderRadius: 10,
                                    background: "#1e293b",
                                    borderLeft: `4px solid ${activeMeta.color}`,
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                    Baustein #{activeMeta.badge} · {activeMeta.spec}
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 700, margin: "3px 0 6px 0" }}>
                                    {activeMeta.title}
                                </div>
                                <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.5 }}>
                                    {activeMeta.summary}
                                </div>
                                <div
                                    style={{
                                        marginTop: 8,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: activeMeta.color,
                                    }}
                                >
                                    Wirkung: {activeMeta.impactHint}
                                </div>
                            </div>

                            <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                                Komponenten im 3D-Haus auswählen & ein-/ausschalten:
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {MODULES.map((m) => {
                                    const isSel = m.id === selectedModule;
                                    const isOn = enabledModules.has(m.id);

                                    return (
                                        <div
                                            key={m.id}
                                            onClick={() => setSelectedModule(m.id)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 10,
                                                padding: "8px 10px",
                                                borderRadius: 8,
                                                cursor: "pointer",
                                                background: isSel ? "#1e293b" : "rgba(30, 41, 59, 0.4)",
                                                border: `1px solid ${isSel ? m.color : "#1e293b"}`,
                                                opacity: isOn ? 1 : 0.55,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span
                                                    style={{
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: "50%",
                                                        background: isOn ? m.color : "#475569",
                                                        color: "#0f172a",
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    {m.badge}
                                                </span>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                                                        {m.shortTitle}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                                        {m.spec}
                                                    </div>
                                                </div>
                                            </div>

                                            <input
                                                type="checkbox"
                                                checked={isOn}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={() => toggleModule(m.id)}
                                                aria-label={`${m.shortTitle} aktivieren`}
                                                style={{
                                                    width: 16,
                                                    height: 16,
                                                    accentColor: m.color,
                                                    cursor: "pointer",
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const OVERLAY_BTN_STYLE: CSSProperties = {
    padding: "6px 11px",
    fontSize: 12,
    fontFamily: FONT,
    borderRadius: 7,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f8fafc",
    cursor: "pointer",
};

const HUD_BADGE_STYLE: CSSProperties = {
    padding: "4px 8px",
    fontSize: 11.5,
    borderRadius: 6,
    background: "rgba(15, 23, 42, 0.84)",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    color: "#e2e8f0",
};

const KPI_BOX_STYLE: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    background: "#1e293b",
    border: "1px solid #334155",
    textAlign: "center",
};
