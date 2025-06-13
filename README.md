# Steam Manager

Steam Manager is a desktop application built with Electron that allows you to easily switch between different Steam accounts without having to manually log in and out each time. It reads your Steam installation files to find the accounts you've previously logged into and provides a simple interface to switch between them.

## Features

*   **Account Switching:** Quickly switch between any of the Steam accounts that have been logged into on your computer.
*   **Auto-Launch:** (Optional) Set the application to start automatically when you log into Windows.
*   **Minimize to Tray:** (Optional) Keep the application running in the system tray for easy access.
*   **Lightweight:** The application is designed to be lightweight and use minimal system resources.

## Building from source

To build the application from source, you will need to have Node.js and npm installed.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MONZikWasTaken/SteamManager
    cd steammanager
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the application:**
    ```bash
    npm start
    ```
4.  **Build the application:**
    ```bash
    npm run build
    ```
    This will create a distributable installer in the `dist` folder.

## Disclaimer

This application is not affiliated with Valve or Steam. It is a third-party tool created to help users manage their Steam accounts. Use it at your own risk. The developer is not responsible for any issues that may arise from its use. 
