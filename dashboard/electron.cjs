
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        resizable: true,
        show: false,
        title: "Blaubeer-Software",

        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    if (app.isPackaged) {
        mainWindow.loadFile(
            path.join(__dirname, "dist", "index.html")
        );
    } else {
        mainWindow.loadURL("http://localhost:5173");
    }
}

app.whenReady().then(() => {
    app.setAppUserModelId(
        "com.squirrel.BlaubeerSoftware.BlaubeerSoftware"
    );

    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
