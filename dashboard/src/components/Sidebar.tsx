import { useEffect, useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/core";

/* Pages */
import SMARD_Analyse from "../pages/SMARD_Analyse/SMARD_Analyse";
import Privathaushaltmodell from "../pages/Privathaushaltmodell/Privathaushaltmodell";
import DecisionEngine from "../pages/AGORA/DecisionEngine";
import GeographischeAnalyse from "../pages/GeographischeAnalyse/GeographischeAnalyse";
import DigitalTwin from "../pages/DigitalTwin/DigitalTwin";

/* Css import */
import "./Sidebar.css";

type MenuItem = {
    id: string;
    label: string;
    icon: IconName;
    color: string;
};

type NavItem = {
    id: string;
    label: string;
    icon: IconName;
};

const appItems: MenuItem[] = [
    { id: "analyse", label: "Anteil EE", icon: "globe", color: "#45c01f" },
    { id: "geographische", label: "Geographische Analyse", icon: "map", color: "#10b981" },
    { id: "privathaushaltmodell", label: "Privathaushaltmodell", icon: "home", color: "#f59e0b" },
    { id: "digitaltwin", label: "Digitales Abbild (EE)", icon: "locate", color: "#38bdf8" },
];

// { id: "decisionengine", label: "DecisionEngine", icon: "locomotive", color: "#a78bfa" },
const navigationItems: NavItem[] = [
    { id: "home", label: "Dashboard", icon: "dashboard" },
];

const STORAGE_KEY = "blaubeer_sidebar_collapsed";

export default function Sidebar() {
    const [activePage, setActivePage] = useState("dashboard");
    const [search, setSearch] = useState("");
    const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, isCollapsed ? "1" : "0");
        } catch {
            // Ignorieren, falls Storage nicht verfügbar ist.
        }
    }, [isCollapsed]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
                event.preventDefault();
                setIsCollapsed((prev) => !prev);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const filteredApps = appItems.filter((item) =>
        item.label.toLowerCase().includes(search.trim().toLowerCase())
    );

    const currentPage =
        [...navigationItems, ...appItems].find((item) => item.id === activePage)
            ?.label ?? "Dashboard";

    return (
        <div className="dashboard-layout">
            <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
                <header className="sidebar-header">
                    {!isCollapsed && (
                        <div className="sidebar-brand">
                            <span className="brand-title">Blaubeerkuchen</span>
                        </div>
                    )}

                    <button
                        type="button"
                        className="sidebar-collapse-btn"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                        title={
                            isCollapsed
                                ? "Sidebar ausklappen (Strg+B)"
                                : "Sidebar einklappen (Strg+B)"
                        }
                        aria-label={
                            isCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"
                        }
                        aria-expanded={!isCollapsed}
                    >
                        <Icon
                            icon={
                                isCollapsed
                                    ? "double-chevron-right"
                                    : "double-chevron-left"
                            }
                            size={15}
                        />
                    </button>
                </header>

                {!isCollapsed && (
                    <div className="sidebar-search-wrapper">
                        <div className="sidebar-search">
                            <Icon icon="search" size={13} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Modul suchen …"
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="sidebar-search-clear"
                                    onClick={() => setSearch("")}
                                    aria-label="Suche löschen"
                                >
                                    <Icon icon="cross" size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <nav className="sidebar-navigation">
                    <div className="nav-section">
                        {navigationItems.map((nav) => (
                            <button
                                key={nav.id}
                                type="button"
                                title={isCollapsed ? nav.label : undefined}
                                className={`sidebar-item ${
                                    activePage === nav.id ? "active" : ""
                                }`}
                                onClick={() => setActivePage(nav.id)}
                            >
                                <span
                                    className="app-icon"
                                    style={{
                                        color: "#cbd5e1",
                                        backgroundColor: "#30363d",
                                    }}
                                >
                                    <Icon icon={nav.icon} size={16} />
                                </span>
                                {!isCollapsed && (
                                    <span className="item-label">{nav.label}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <section className="apps-section">
                        {!isCollapsed && (
                            <div className="apps-heading">
                                <span>MODULE</span>
                            </div>
                        )}

                        <div className="apps-list">
                            {filteredApps.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={isCollapsed ? item.label : undefined}
                                    className={`sidebar-item app-item ${
                                        activePage === item.id ? "active" : ""
                                    }`}
                                    onClick={() => setActivePage(item.id)}
                                >
                                    <span
                                        className="app-icon"
                                        style={{
                                            color: item.color,
                                            backgroundColor: "#30363d",
                                        }}
                                    >
                                        <Icon icon={item.icon} size={16} />
                                    </span>

                                    {!isCollapsed && (
                                        <span className="item-label">
                                            {item.label}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>

                    <footer
                        className="sidebar-footer"
                        title="Blaubeerkuchen-Software v0.0.0"
                    >
                        {isCollapsed ? "v0.0" : "Blaubeerkuchen-Software v0.0.0"}
                    </footer>
                </nav>
            </aside>

            <main className="main-content">

                {activePage === "digitaltwin" ? (
                    <DigitalTwin />
                ) : activePage === "analyse" ? (
                    <SMARD_Analyse />
                ) : activePage === "privathaushaltmodell" ? (
                    <Privathaushaltmodell />
                ) : activePage === "decisionengine" ? (
                    <DecisionEngine />
                ) : activePage === "geographische" ? (
                    <GeographischeAnalyse />
                ) : (
                    <div className="content-body">
                        <h1>{currentPage}</h1>
                        <p>Der Bereich {currentPage} ist ausgewählt.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
