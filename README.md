<div align="center">

<img src="preview/title.gif">



<p align="center">
  <img src="https://img.shields.io/badge/TYPESCRIPT-ff2d3d?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/CAIRO_GRAPHICS-ff2d3d?style=for-the-badge" />
  <img src="https://img.shields.io/badge/AGS_V3.0-ff2d3d?style=for-the-badge" />
  <img src="https://img.shields.io/badge/HYPRLAND-ff2d3d?style=for-the-badge&logo=hyprland&logoColor=white" />
  <img src="https://img.shields.io/badge/ARCH_LINUX-ff2d3d?style=for-the-badge&logo=arch-linux&logoColor=white" />
</p>

### **A Hyprland *netrunner* rice with 3D-tilted cairo HUD and components on AGS v3 / Astal**


</div>



# // Theme Showcase

<table border="0">
    <tr><img src="preview/preview.png" width="100%"/></tr>
  <tr>
    <td><img src="preview/apps.png" width="100%"/></td>
    <td><img src="preview/login.png" width="100%"/></td>
    <td></td>
  </tr>
</table>

### Video preview



https://github.com/user-attachments/assets/6f6ee38d-8318-4954-8c79-27546fb85eb6


---


## ⌁ Welcome to Night City::

<img src="preview/johnny.gif" align="right" width="30%" style="margin-left: 20px;">

This is a complete Cyberpunk 2077 themed desktop for **Hyprland**. The HUD is made with AGS script (`core.ts`) that draws everything with usage of cairo to create perspective-tilted panels, angular red-neon glass, segmented health bars, and glitch transitions to completely mimick the in-game UI such as animations and components aswell as much as possible.

<br clear="right"/>

### Highlights

- **Health bars** -> The in-game UI bars meant for Health, Stamina, RAM and Level are copied to provide system monitors:
  - The level badge provides current CPU temperature in Cº, if sensors fail or null it returns the system uptime
  -  The Health bars provide average usage in % of CPU load using /proc/stat
  -  The RAM bars...well they provide RAM Memory usage, with ramStat()
  -  the top bar on health for experience, provides the current filesystem storage as `Used/Total` 
  -  The Stamina bar provides the current battery level (if AC, will just stay at 100%)

- **Corner widgets** -> Renders the same UI style of the game UI shortcuts like Radio, Vehicle, Phone, Cyberware item etc
  -  Radio shortcut as Music Player (Toggleable by clicking, or SUPER + SHIFT + O)
  -  System controls for rest of shortcuts like Brightness, Volume, Microphone, Wifi, Bluetooth, Record Screen
    
- **Minimap** -> Recreates the Minimap from the HUD exactly the same as in-game, showing a random location from `city.json`  
  -  Weather widget below minimap: retrieves the weather forecast for the next 7 days from location at `city.json` using Open Meteo API (Right click to change city location)
  -  Network notification: Displays current WiFi/Etherned connected and SSID, or Offline Status along with Upload/Download speed

- **Weapon/Item** -> The bottom-right hud that shows weapon/ammo in-game
  -  Shows App Launcher, with a custom icon gathered from the design concepts of Cyberpunk 2077
  -  App Launcher shows a custom launcher that mimicks the Kiroshi Scanner, with audio and animations and the same shape of the 'quickhacks' frames.

- **Messages/Contacts** -> App tray/Notification center recreated on V's contacts HUD.
  - the MESSAGES will show the last notifications and their respective apps
  - the APPS Tray is shows the tray for active apps along with custom tilted context menus

- **Pacman hook** -> Displays V's streetcred reputation frame
  - Whenever a new pacman pkg is added, it will show animated frame as "PKG Installed\nVersion XXX" 
  - Whenever AUR packages have upgrades available, it will show update notifications.

- **KILL MODE** -> Starts an animated overlay similar to Kiroshi aswell, click on any app to forcekill it (Toggleable by SUPER+SHIFT+K)
- **Screen Recording** -> Starts recording the active screen, and with the same HUD components from in-game when acessing cameras from quickhacks (Toggleable by SUPER+SHIFT+R)
- **Music player** -> Opens/Closes the Media Player, designed with a tilted glassy-look frame similar to in-game panels. (Toggleable by SUPER+SHIFT+O)
- **Quickshell lockscreen** -> ANimated loginscreen with qs, simulating a NetWatch controlled terminal.
- **cool-retro-term** -> Autoinstalls Cool-Retro-Term by Swordfish90, and sets a 'Netrunner' profile for default, in same style of the terminal windows in-game, along with an optional fish installation and 'SAMURAI' banner.

---

## ⌁ Video previews

 

<table>
  <tr>
    <td width="50%" align="center">
      <b>KILL MODE</b><br/>
      <video src="https://github.com/user-attachments/assets/306a4b40-8a75-401d-9d25-260ab38747c8" controls width="100%"></video>
    </td>
    <td width="50%" align="center">
      <b>CONTROL MODALS</b><br/>
      <video src="https://github.com/user-attachments/assets/b10e6f94-5f49-4244-93ce-dcca43e5161b" controls width="100%"></video>
    </td>
  </tr>

  <tr>
    <td width="50%" align="center">
      <b>APPS LAUNCHER</b><br/>
      <video src="https://github.com/user-attachments/assets/8c4d7d37-1d06-470b-8dcc-e8b26a1b2ec6" controls width="100%"></video>
    </td>
    <td width="50%" align="center">
      <b>MUSIC PLAYER</b><br/>
      <video src="https://github.com/user-attachments/assets/db41ab8e-e619-4be8-a367-f4e3152749f5" controls width="100%"></video>
    </td>
  </tr>

   <tr>
    <td width="50%" align="center">
      <b>SCREENSHOT / CAPTURE</b><br/>
      <video src="https://github.com/user-attachments/assets/3e985d7e-dd04-4c15-b26f-9bbfb095bb59" controls width="100%"></video>
    </td>
         <td width="50%" align="center">
      <b>MESSAGES / APP TRAY
</b><br/>
      <video src="https://github.com/user-attachments/assets/f1de18a1-c5d1-4b0b-a7d7-06bc84b6521f" controls width="100%"></video>
    </td>
  </tr>

  <tr>
    <td width="50%" align="center">
      <b>STREET CRED REPUTATION || AUR PACKAGE LISTENER</b><br/>
      <video src="https://github.com/user-attachments/assets/4ff47cae-8cbc-4f49-b74d-1baf99f0e4b5" controls width="100%"></video>
    </td>
    <td width="50%" align="center">
      <b>STREET CRED REPUTATION || AUR UPDATES</b><br/>
      <video src="https://github.com/user-attachments/assets/c4ebdb24-8219-4c28-9107-d0954753da89" controls width="100%"></video>
    </td>
  </tr>
</table>


---

## ⌁ Requirements

- **Arch Linux** (the installer uses `pacman`)
- **Hyprland ≥ 0.55** (this theme uses custom titlebars that need 0.55's plugin API; optional though, the rest of theme isn't affected)
- An **AUR helper** — `yay` or `paru` (Always check PKGBUILD btw)
- A running Hyprland session (so theming + first-run setup can apply)

---

## ⌁ Install

```bash
git clone https://github.com/ARCANGEL0/Cyberpunk-Hyprland.git 
cd Cyberpunk-Hyprland
chmod +x install.sh
./install.sh
```

The installer is interactive and will:

1. **Dependencies** =>> scan + install missing repo and AUR packages.
2. **AGS runtime** =>> Installs and symlink the binary and resolve astal/GJS imports.
3. **Fonts** =>> install bundled Chakra Petch + Rajdhani.
4. **Lockscreen** =>> set up quickshell, qt6, and PAM auth.
5. **cool-retro-term** =>> download AppImage and configure the netrunner profile, and optionally installs fish shell.
7. **Theme source** =>> prepend `$cyberpunk` + `source=` to `hyprland.conf`.
8. **Conflicts** =>> scan and comment clashing keybinds, stale options, and overridden config blocks, to avoid keybinds being duplicated.
9. **Apply** =>> Set the full theme for icons,cursor,kitty, kvantum, build the custom hyprbars plugin, and reload Hyprland.

---

## ⌁ Keybinds

The theme modifier is **`$themeMod = SUPER + SHIFT`** (change it at the top of `theme.conf`). Open the full cheat-sheet with all keybinds anytime with **`SUPER+SHIFT+H`**.

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
| `SUPER + SHIFT + X` | Dismiss Notifications |
| `SUPER + SHIFT + U` | System Upgrade modal |
| `SUPER + SHIFT + B` | Bluetooth modal |
| `SUPER + SHIFT + P` | Power menu |
| `SUPER + SHIFT + W` | Weather |
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
├─ theme.conf          # Hyprland full theme
├─ install.sh          # interactive installer
├─ components/
│  ├─ modules/         # every widget (monitors, sidepanel, dock, modals, anim, …)
│  └─ style/           # cyber.scss and cyber.css
├─ scripts/            # launcher, screenshot, screenrecord, overkill, ws, terminal, and other used scripts.
├─ quickshell/         # Login screen using quickshell
├─ city.json           # City.json with the provided location, used for minimap and weather forecast
└─ assets/             # fonts, cursor, icons, kitty, kvantum, hyprbars, cool-retro-term
```

## TODO List

- [x] Add modal controls like CPU/RAM monitors, battery modals etc.
- [x] Draw HUD on N different monitors
- [x] Add same notifications from CP2077 messages and add official audios from game
- [x] Add "+ Street Cred" animation when installing new apps from pacman 
  <br><img src="preview/streetcred.jpg" width="20%"/>
- [x] Add more notification chips on HUD such as 'AUR Update Available!'.
- [x] Redraw Music Player to match CP2077 Radioport + Now Playing toast animation.
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
