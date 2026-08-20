<div align="center">

<img src="preview/title.gif">



<p align="center">
  <img src="https://img.shields.io/badge/TYPESCRIPT-ff2d3d?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/CAIRO_GRAPHICS-ff2d3d?style=for-the-badge" />
  <img src="https://img.shields.io/badge/AGS_V3.0-ff2d3d?style=for-the-badge" />
  <img src="https://img.shields.io/badge/HYPRLAND-ff2d3d?style=for-the-badge&logo=hyprland&logoColor=white" />
  <img src="https://img.shields.io/badge/ARCH_LINUX-ff2d3d?style=for-the-badge&logo=arch-linux&logoColor=white" />
</p>

### **A Hyprland *netrunner* rice with built on AGS v3 / Astal**


</div>



# // Theme Showcase

<table border="0">
    <tr> 
      <img width="1920" height="1080" alt="2026-08-20_17-23-36" src="https://github.com/user-attachments/assets/a80ba225-08e2-40e9-bbaf-3032739a9fef" />
    </tr>
  <tr>
    <td>
      <img width="1009" height="748" alt="2026-08-20_21-09-27" src="https://github.com/user-attachments/assets/85fc85fa-6130-4c14-bb7b-eb20a10da8c6" />
    </td>
    <td>
<video src="https://github.com/user-attachments/assets/86e78d03-7522-4671-9e63-a67953ab1e7e"></video>
    </td>
  </tr>
</table>

### Video preview

https://github.com/user-attachments/assets/f8affc37-d25d-404c-bd02-df04892cfec8

---


## ⌁ Welcome to Night City, Choom. ::

<img src="preview/johnny.gif" align="right" width="30%" style="margin-left: 20px;">

This is my attempt to recreate Cyberpunk 2077 UI entirely on **Hyprland**, using AGS/Astal to build the HUD similar to the in-game overlay including the widgets, minimaps, and more themed features.

<br clear="right"/>

### About each component

- **Health bars** -> The in-game UI bars meant for Health, Stamina, RAM and Level are copied to provide system monitors:
  - The level badge shows the current active workspace, like [1], [2] and etc.
  -  The Health bars provide average usage in % of CPU load using /proc/stat
  -  The RAM bars...well they provide RAM Memory usage, with ramStat()
  -  the top bar on health for experience, provides the current filesystem storage as `Used/Total` 
  -  The Stamina bar provides the current battery level (if AC, will just stay at 100%)

- **Corner widgets** -> Renders the same UI style of the game UI shortcuts like Radio, Vehicle, Phone, Cyberware item etc
  -  Radio shortcut as Music Player (Toggleable by clicking, or SUPER + SHIFT + O)
  -  System controls for rest of shortcuts like Brightness, Volume, Microphone, Wifi, Bluetooth, Record Screen
  - App tray/Notification center recreated on V's contacts HUD.
    -> the MESSAGES will show the last notifications and their respective apps
    -> the APPS Tray is shows the tray for active apps along with custom tilted context menus

    
- **Minimap** -> Recreates the Minimap from the HUD exactly the same as in-game, showing a random location from `city.json`  
  -  Weather widget below minimap: retrieves the weather forecast for the next 7 days from location at `city.json` using Open Meteo API (Right click to change city location, and double click to see the full forecast)
  -  Network notification: Displays current WiFi/Etherned connected and SSID, or Offline Status along with Upload/Download speed
  -  Market Feed: Shows an interactive widget that displays values and charts for Stocks, Cryptocoins and Trending news. Double-clicking it opens the ''terminal'' that mimicks V computer where you can access websites and buy cars etc, but for market and news.
    
- **Weapon/Item** -> The bottom-right hud that shows weapon/ammo in-game
  -  Shows App Launcher, with a custom icon gathered from the design concepts of Cyberpunk 2077
  -  App Launcher shows a custom launcher that mimicks the Kiroshi Scanner, with audio and animations and the same shape of the 'quickhacks' frames.

- **Pacman hook** -> Displays V's streetcred reputation frame
  - Whenever a new pacman pkg is added, it will show animated frame as "PKG Installed\nVersion XXX" 
  - Whenever AUR packages have upgrades available, it will show update notifications.

- **KILL MODE** -> Starts an animated overlay similar to Kiroshi aswell, click on any app to forcekill it (Toggleable by SUPER+SHIFT+K)
  
- **Screen Recording** -> Starts recording the active screen, and with the same HUD components from in-game when acessing cameras from quickhacks (Toggleable by SUPER+SHIFT+R)

- **Music player** -> Opens/Closes the Media Player, designed pixel-perfect exact as the RADIOPORT in the game. (Toggleable by SUPER+SHIFT+O)
  
- **Quickshell lockscreen** -> ANimated loginscreen with qs.
 
- **Terminals** -> Installs Rio Terminal for 'glassy cyan' cyber terminals, and Cool-Retro-Term by Swordfish90, and sets a 'Netrunner' profile for default, in same style of the terminal windows in-game, along with an optional fish installation and 'SAMURAI' banner.

---

## ⌁ Video previews

<table>
  <tr>
    <td width="50%" align="center">
      <b>KILL MODE</b><br/>
      <video src="https://github.com/user-attachments/assets/d40443b8-bd50-45cf-b63f-9b31fc5d6b03"></video>
    </td>
    <td width="50%" align="center">
      <b>CONTROL MODALS</b><br/>
            <video src="https://github.com/user-attachments/assets/9d151f4f-9913-4d86-8319-0def42cf349d"></video>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>APPS LAUNCHER</b><br/>
      <video src="https://github.com/user-attachments/assets/31ce5454-1a20-466d-a249-3eec409fb46a"></video></td>
    <td width="50%" align="center">
      <b>MUSIC PLAYER</b><br/>
<video src="https://github.com/user-attachments/assets/c0c2fc66-81d6-441c-9102-6409cc79ab2a"></video>
    </td>
  </tr>
   <tr>
    <td width="50%" align="center">
      <b>SCREENSHOT / CAPTURE</b><br/>
<video src="https://github.com/user-attachments/assets/1f0f25c0-4868-45c7-9099-ca9498c73dd3"></video>
    </td>
         <td width="50%" align="center">
      <b>MESSAGES / APP TRAY
</b><br/>
<video src="https://github.com/user-attachments/assets/3ef2f30b-d5e6-4026-add8-aca9ae58b98d"></video>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>STREET CRED REPUTATION || AUR PACKAGE LISTENER ~~ UPDATES </b><br/>
<video src="https://github.com/user-attachments/assets/401eb9e9-2a56-4b67-9afe-422d413be67d"></video>
    </td>
        <td width="50%" align="center">
      <b>RipperCPU | Process manager </b><br/>
<video src="https://github.com/user-attachments/assets/7fe5a447-7135-4949-9504-6a8de8fd0e35"></video>
</td>
  </tr>
</table>


---

## ⌁ Requirements

- **Arch Linux or based distros.**
- **Hyprland ≥ 0.56**
- An **AUR helper**: `yay` or `paru` (Always check PKGBUILD btw)
- A running Hyprland session (so theming + first-run setup can apply)

---

## ⌁ Install

```bash
git clone https://github.com/ARCANGEL0/CyberArch-Dotfiles.git 
cd CyberArch-Dotfiles 
chmod +x install.sh
./install.sh
```

The installer will download any required dependencies, install the theme, quickshell and the necessary packages, along with optional features such as fish, GPU Terminals in theme style, and wallpapers. 

---

## ⌁ Keybinds

The theme modifier is **`$themeMod = SUPER + SHIFT`** (change it at the top of `theme.lua`). Open the full cheat-sheet with all keybinds anytime with **`SUPER+SHIFT+H`**.

### HUD & widgets

| Keybind | Action |
| --- | --- |
| `SUPER` / `SUPER + Space` | App launcher |
| `SUPER + SHIFT + Z` | Toggle HUD above / below windows |
| `SUPER + SHIFT + V` | Volume & Microphone modal |
| `SUPER + SHIFT + I` | Brightness modal |
| `SUPER + SHIFT + M` | Messages modal |
| `SUPER + SHIFT + O` | Music player |
| `SUPER + SHIFT + N` | Wi-Fi modal |
| `SUPER + SHIFT + G` | Netterminal: See Stocks, Crypto or News |
| `SUPER + SHIFT + X` | Dismiss Notifications |
| `SUPER + SHIFT + U` | System Upgrade modal |
| `SUPER + SHIFT + B` | Bluetooth modal |
| `SUPER + SHIFT + P` | Power menu |
| `SUPER + SHIFT + W` | 7-day weather forecast (double-click the city to change location) |
| `SUPER + SHIFT + -` | System time: timezone, NTP sync, manual set |
| `SUPER + SHIFT + Y` | Battery modal |
| `SUPER + SHIFT + C` | CPU / RAM / system modal |
| `SUPER + SHIFT + H` | Keybind help |

### System & capture

| Keybind | Action |
| --- | --- |
| `SUPER + SHIFT + T` | Netrunner terminal (cool-retro-term) |
| `SUPER + SHIFT + S` | Screenshot (region) |
| `SUPER + SHIFT + R` | Start / stop screen recording |
| `SUPER + SHIFT + K` | **Kill mode** (click a window to kill · `ESC` exits) |
| `SUPER + SHIFT + L` | Lock screen |
| `SUPER + D` | Peek desktop (hide windows) |

### Window management

| Keybind | Action |
| --- | --- |
| `SUPER + SHIFT + F` | Fullscreen toggle |
| `SUPER + F` | Float / tile toggle |
| `SUPER + ← → ↑ ↓` | Move focus |
| `SUPER + SHIFT + ← → ↑ ↓` | Move window |
| `CTRL + SHIFT + ← → ↑ ↓` | Resize window |
| `SUPER + 1…0` | Switch workspace (with the glitch transition) |
| `ALT + SHIFT + 1/2/3/4/5...` | Send window to workspace |
| 3-finger swipe (If using notebook)  ← / → | Previous / next workspace |

---

## ⌁ Layout

```
cyberpunk/
├─ core.ts              # HUD entry point (AGS / astal / GJS)
├─ theme.lua           # Hyprland full theme
├─ install.sh          
├─ components/
│  ├─ modules/         # The widgets and main components of the theme HD
│  ├─ login/           # Quickshell login
│  └─ style/           # cyber.scss and cyber.css
├─ scripts/            # launcher, screenshot, screenrecord, overkill, ws, terminal, and other used scripts.
├─ quickshell/         # Login screen using quickshell
├─ city.json           # Here is your saved location (starts by default in London,UK)
└─ assets/             # fonts, cursor, icons, kitty, kvantum, hyprbars, and resources
```

## TODO List

- [x] Add modal controls like CPU/RAM monitors, battery modals etc.
- [x] Draw HUD on N different monitors
- [x] Add same notifications from CP2077 messages and add official audios from game
- [x] Add "+ Street Cred" animation when installing new apps from pacman 
  <br><img src="preview/streetcred.jpg" width="20%"/>
- [x] Add more notification chips on HUD such as 'AUR Update Available!'.
- [x] Redraw Music Player to match CP2077 Radioport + Now Playing toast animation.
- [x] Add the 'KEYSTORE' Terminal and add new features
- [x] Add Stocks and live news feed on Net Terminal
- [x] Add custom wallpapers and new login
- [x] Add the RipperDoc GUI or something similar
<br>
suggestions are welcome! :) 
---

## ⌁ Credits

- Built on **[Hyprland](https://hypr.land)**, **[AGS / Aylur's GTK Shell](https://github.com/Aylur/ags)**, and **[astal](https://github.com/Aylur/astal)**.
- Lockscreen on **[quickshell](https://quickshell.org)**.
- Terminal: **[cool-retro-term](https://github.com/Swordfish90/cool-retro-term)**.
- The custom titlebars are a small cairo-bevel patch over Hyprland's **hyprbars** plugin, from original hyprbars by the Hyprland project.
- Projekt Red obviously for the game Cyberpunk 2077 UI Designs and aesthetics.
 
<div align="center">

## ❤️ Support

 ### if you enjoy the project and want to support future development:

[![Star on GitHub](https://img.shields.io/github/stars/ARCANGEL0/ResumeMe?style=social)](https://github.com/ARCANGEL0/Cyberpunk-Hyprland)
[![Follow on GitHub](https://img.shields.io/github/followers/ARCANGEL0?style=social)](https://github.com/ARCANGEL0)
<br>

<a href='https://ko-fi.com/J3J7WTYV7' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
<br>
<strong>Hack the world. Byte by Byte.</strong> ⛛ <br>
𝝺𝗿𝗰𝗮𝗻𝗴𝗲𝗹𝗼 @ 2026


</div>
