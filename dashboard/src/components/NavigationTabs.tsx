
import { Tab, Tabs } from "@blueprintjs/core";

export default function DataSetNavigationTabs() {
    return (
        <Tabs id="main-navigation">
            <Tab
                id="stromverbrauch"
                title="Stromverbrauch"
                panel={<div>Stromverbrauch</div>}
            />

            <Tab
                id="forecast"
                title="Prognose"
                panel={<div>CO₂-Prognose</div>}
            />

            <Tab
                id="data"
                title="Datensätze"
                panel={<div>Importierte Datensätze</div>}
            />
        </Tabs>
    );
}
