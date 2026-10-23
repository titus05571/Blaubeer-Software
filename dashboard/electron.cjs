
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        rezisable: true,
        title: "CO₂ Analytics",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
    } else {
        mainWindow.loadURL("http://localhost:5173");
    }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
