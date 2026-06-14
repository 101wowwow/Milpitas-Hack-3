const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron')
const path = require('path');
const tracker = require('./tracker');
 
let mainWindow;
let mascotWindow = null;
let mascotTimer = null;
let lastBurnoutScore = 0;

// --- IPC Handlers ---

ipcMain.on('app-close', () => {
  app.quit()
})

ipcMain.on('toggle-main-window', () => {
  if (!mainWindow) {
    createMainWindow();
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
})

ipcMain.on('burnout-score', (_event, score) => {
  const normalized = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  lastBurnoutScore = normalized;
  scheduleMascotCycle();
});

ipcMain.on('show-mascot-popup', () => {
  createMascotPopup();
});
 
ipcMain.on('open-new-page', () => {
  const pageWindow = new BrowserWindow({
    width: 480,
    height: 480,
    autoHideMenuBar: true,
    backgroundColor: '#ccffd3',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      enableRemoteModule: true
    }
  })
  pageWindow.loadFile('new-page.html')
})
 
// --- Window Creators ---
 
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 480,
    useContentSize: true,
    resizable: false,
    frame: false,
    transparent: false,
    show: true,
    autoHideMenuBar: false,
    backgroundColor: '#c8ffb7',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      enableRemoteModule: true
    }
  })
  mainWindow.loadFile('mainpage.html')
  mainWindow.on('closed', () => {
    mainWindow = null;
  })
}
 
function createMascotPopup() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const popupWidth = 180;
  const popupHeight = 180;

  if (mascotWindow) {
    mascotWindow.close();
    mascotWindow = null;
  }

  mascotWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: width - popupWidth - 20,
    y: height - popupHeight - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mascotWindow.loadFile('notifJohn.html');
  mascotWindow.on('closed', () => {
    mascotWindow = null;
  });
}

function getMascotIntervalMs(score) {
  const normalized = Math.max(0, Math.min(100, score));
  const step = Math.floor(normalized / 20);
  const hours = step >= 5 ? 0.5 : 5 - step;
  return Math.max(0.5, hours) * 60 * 60 * 1000;
}

function scheduleMascotCycle() {
  if (mascotTimer) {
    clearTimeout(mascotTimer);
    mascotTimer = null;
  }

  const interval = getMascotIntervalMs(lastBurnoutScore);
  mascotTimer = setTimeout(() => {
    createMascotPopup();
    scheduleMascotCycle();
  }, interval);
}
 
// --- App Lifecycle ---
 
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  tracker.start(app.getPath('userData'));
  createMainWindow();
  setTimeout(() => {
    createMascotPopup();
    scheduleMascotCycle();
  }, 10000);
})
 
app.on('before-quit', () => {
  tracker.stop()
})
 
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
})


// const {app, BrowserWindow, Menu, ipcMain, screen} = require('electron')
// const path = require('path');
// const tracker = require('./tracker'); 
// let mainWindow;

// ipcMain.on('app-close', () => {
//   app.quit()
// })

// ipcMain.on('toggle-main-window', () => {
//   if (!mainWindow) {
//     createMainWindow();
//   }

//   if (mainWindow.isVisible()) {
//     mainWindow.hide();
//   } else {
//     mainWindow.show();
//     mainWindow.focus();
//   }
// })

// ipcMain.on('open-new-page', () => {
//   const pageWindow = new BrowserWindow({
//     width: 480,
//     height: 480,
//     autoHideMenuBar: true,
//     backgroundColor: '#ccffd3',
//     webPreferences: {
//       contextIsolation: false,
//       nodeIntegration: true,
//       enableRemoteModule: true
//     }
//   })
//   pageWindow.loadFile('new-page.html')
// })

// function createMainWindow() {
//   mainWindow = new BrowserWindow({
//     width: 480,
//     height: 480,
//     useContentSize: true,
//     resizable: false,
//     frame: false,
//     transparent: false,
//     show: true,
//     autoHideMenuBar: false,
//     backgroundColor: '#c8ffb7',
//     webPreferences: {
//       contextIsolation: false,
//       nodeIntegration: true,
//       enableRemoteModule: true
//     }
//   })

//   mainWindow.loadFile('mainpage.html')

//   mainWindow.on('closed', () => {
//     mainWindow = null;
//   })
// }

// app.whenReady().then(() => {
//   Menu.setApplicationMenu(null)

//   // Start screen-time tracker
//   tracker.start(app.getPath('userData'));

//   createMainWindow();

//   setTimeout(() => {
//     createMascotPopup();
//   }, 10000);
// })


// function createMascotPopup() {
//   // 1. Get the screen dimensions to calculate the bottom right corner
//   const primaryDisplay = screen.getPrimaryDisplay();
//   const { width, height } = primaryDisplay.workAreaSize;

//   // 2. Set the window dimensions
//   const popupWidth = 180;
//   const popupHeight = 180;

//   // 3. Create the borderless, transparent window
//   const mascotWindow = new BrowserWindow({
//     width: popupWidth,
//     height: popupHeight,
//     // Position it in the bottom-right corner (leaving a small 20px gap)
//     x: width - popupWidth - 20,
//     y: height - popupHeight - 20,
//     frame: false,            // Removes the top title bar and close buttons
//     transparent: true,      // Makes the window background clear
//     alwaysOnTop: true,      // Keeps it visible over other open apps/browsers
//     resizable: false,       // User can't stretch it out of shape
//     skipTaskbar: true,      // Optional: Stops it from showing up in the bottom Windows taskbar
//     webPreferences: {
//       nodeIntegration: true,
//       contextIsolation: false
//     }
//   });

//   // 4. Load your mascot HTML file
//   mascotWindow.loadFile('notifJohn.html');
// }

// // 5. App lifecycle management (Moved outside of the mascot function)
// app.on('window-all-closed', () => {
//   // On macOS it's common for applications to stay open until explicitly quit
//   if (process.platform !== 'darwin') {
//     app.quit();
//   }
// });
