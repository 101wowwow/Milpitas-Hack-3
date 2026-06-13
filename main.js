const {app, BrowserWindow, Menu, ipcMain} = require('electron')

ipcMain.on('app-close', () => {
  app.quit()
})


app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  const mainWindow = new BrowserWindow({
    width: 480,
    height: 480,
    useContentSize: true,
    resizable: false,
    frame: false,
    transparent: false,
    autoHideMenuBar: false,
    backgroundColor: '#c8ffb7',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      enableRemoteModule: true
    }
  })

  mainWindow.loadFile('mainpage.html')

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
})

app.on('window-all-closed', () => {
  app.quit()
})