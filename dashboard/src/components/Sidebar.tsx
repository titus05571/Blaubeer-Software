import { useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/core";

{/* Pages */ }
import JNotebook from "../pages/JNoteBook";
import BisJetztGraph from "../pages/Analyse/Analyse";

{/* Css import */ }
import "./Sidebar.css";

type MenuItem = {
    id: string;
    label: string;
    icon: IconName;
    color: string;
};

type PageInfo = {
    id: string;
    label: string;
};

const appItems: MenuItem[] = [
    { id: "analyse", label: "Analyse", icon: "globe", color: "#45c01f" },
    { id: "contour", label: "MS2", icon: "lightning", color: "#f59e0b" },
    { id: "speicherkapazitaet", label: "MS3", icon: "database", color: "#ffffff" },
    { id: "contour3", label: "MS3+4", icon: "filter", color: "#f59e0b" },
    { id: "contour4", label: "MS4+5", icon: "filter", color: "#f59e0b" },
];

const navigationItems: PageInfo[] = [
    { id: "home", label: "Dashboard" },
    { id: "placeholder", label: "Jupyter Notebook" },
    { id: "notifications", label: "Notifications" },
    { id: "recent", label: "Recent" },
];

export default function Sidebar() {
    const [activePage, setActivePage] = useState("home");
    const [search] = useState("");

    const filteredApps = appItems.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase())
    );

    const currentPage =
        [...navigationItems, ...appItems].find(
            (item) => item.id === activePage
        )?.label ?? "Dashboard";

    function menuItem(
        id: string,
        label: string,
        icon: IconName
    ) {
        return (
            <button
                key={id}
                className={`sidebar-item ${activePage === id ? "active" : ""
                    }`}
                onClick={() => setActivePage(id)}
            >
                <Icon icon={icon} size={16} />
                <span>{label}</span>
            </button>
        );
    }

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <header className="sidebar-header">
                    <div className="brand-mark">
                        <Icon icon="person" size={23} />
                    </div>
                </header>

                <nav className="sidebar-navigation">
                    <section className="navigation-group">
                        {menuItem("home", "Dashboard", "control")}
                        {menuItem("placeholder", "Jupyter Notebook", "book")}
                    </section>

                    <section className="apps-section">
                        <div className="apps-heading">
                            <span>MODULE</span>
                        </div>

                        <div className="apps-list">
                            {filteredApps.map((item) => (
                                <button
                                    key={item.id}
                                    className={`sidebar-item app-item ${activePage === item.id ? "active" : ""
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

                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                    <footer className="sidebar-footer">
                        Blaubeer-Software v0.0.0
                    </footer>
                </nav>
            </aside>

            <main className="main-content">
                <div className="content-topbar">
                    <strong>{currentPage}</strong>
                </div>


                {/* Geladenes Modul je nach Auswahl */}
                {activePage === "analyse" ? (
                    <BisJetztGraph />
                ) : activePage === "placeholder" ? (
                    <JNotebook />
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