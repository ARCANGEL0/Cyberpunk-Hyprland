local cyberpunk = os.getenv("HOME") .. "/.config/hypr/themes/cyberpunk"
local themeMod  = "SUPER + SHIFT"
local augSock   = os.getenv("XDG_RUNTIME_DIR") .. "/astal/cyberpunk.sock"
local TERM      = "rio"
local TERMFLOAT = "rio"

local once = function(cmd)
    hl.on("hyprland.start", function()
        hl.exec_cmd(cmd)
    end)
end

hl.exec_cmd("killall -9 waybar mako dunst swaync 2>/dev/null; systemctl --user stop waybar mako dunst swaync 2>/dev/null || true")
hl.exec_cmd(os.getenv("HOME") .. "/.local/bin/ags quit -i cyberpunk 2>/dev/null")
hl.exec_cmd("sleep 1 && " .. cyberpunk .. "/scripts/launch-theme")
hl.exec_cmd(cyberpunk .. "/scripts/ws pin")
hl.exec_cmd("awww img " .. os.getenv("HOME") .. "/.config/hypr/themes/cyberpunk/assets/img/lucy_wallpaper.png")
once(cyberpunk .. "/components/login/lock.sh")

hl.exec_cmd("mkdir -p " .. os.getenv("HOME") .. "/.config/kitty && ln -sfn " .. cyberpunk .. "/assets/kitty/kitty.conf " .. os.getenv("HOME") .. "/.config/kitty/kitty.conf")
hl.exec_cmd("mkdir -p " .. os.getenv("HOME") .. "/.local/share/icons && ln -sfn " .. cyberpunk .. "/assets/gtk/iconpack " .. os.getenv("HOME") .. "/.local/share/icons/iconpack")
hl.exec_cmd("gsettings set org.gnome.desktop.interface icon-theme 'iconpack'")
hl.exec_cmd("ln -sfn " .. cyberpunk .. "/assets/cursor " .. os.getenv("HOME") .. "/.local/share/icons/neurodance")
hl.exec_cmd("gsettings set org.gnome.desktop.interface cursor-theme 'neurodance'")
hl.exec_cmd("hyprctl setcursor neurodance 48")
hl.env("XCURSOR_THEME", "neurodance")
hl.env("XCURSOR_SIZE", "48")
hl.env("QT_STYLE_OVERRIDE", "kvantum")
once(cyberpunk .. "/scripts/apply_theme")
once("mkdir -p " .. os.getenv("HOME") .. "/.config/Kvantum/Daemon && cp -f " .. cyberpunk .. "/assets/gtk/DaemonKvantum/Daemon.kvconfig " .. os.getenv("HOME") .. "/.config/Kvantum/Daemon/Daemon.kvconfig && cp -f " .. cyberpunk .. "/assets/gtk/DaemonKvantum/Daemon.svg " .. os.getenv("HOME") .. "/.config/Kvantum/Daemon/Daemon.svg && echo '[General]' > " .. os.getenv("HOME") .. "/.config/Kvantum/kvantum.kvconfig && echo 'theme=Daemon' >> " .. os.getenv("HOME") .. "/.config/Kvantum/kvantum.kvconfig")

local sock = function(msg)
    return hl.dsp.exec_cmd('echo "' .. msg .. '" | socat - UNIX-CONNECT:' .. augSock)
end

hl.bind("SUPER + TAB", hl.dsp.exec_cmd(cyberpunk .. "/scripts/launcher"))
hl.bind("SUPER + T", hl.dsp.exec_cmd(TERM))
hl.bind(themeMod .. " + Z", sock("toggle-hud"))
hl.bind(themeMod .. " + V", sock("modal vol"))
hl.bind(themeMod .. " + I", sock("modal brt"))
hl.bind(themeMod .. " + U", sock("modal aur"))
hl.bind(themeMod .. " + J", sock("aur-dismiss"))
hl.bind(themeMod .. " + M", sock("notif-hud"))
hl.bind(themeMod .. " + O", sock("player"))
hl.bind(themeMod .. " + N", sock("modal wifi"))
hl.bind(themeMod .. " + B", sock("modal bt"))
hl.bind(themeMod .. " + P", sock("modal pwr"))
hl.bind(themeMod .. " + W", sock("forecast"))
hl.bind(themeMod .. " + minus", sock("clock"))
hl.bind(themeMod .. " + G", sock("markets"))
hl.bind(themeMod .. " + Y", sock("modal bat"))
hl.bind(themeMod .. " + C", sock("modal sys"))
hl.bind(themeMod .. " + H", sock("modal keys"))
hl.bind(themeMod .. " + E", sock("notif-read"))
hl.bind(themeMod .. " + X", sock("notif-dismiss"))
hl.bind(themeMod .. " + R", hl.dsp.exec_cmd(cyberpunk .. "/scripts/screenrecord"))
hl.bind(themeMod .. " + T", hl.dsp.exec_cmd(cyberpunk .. "/scripts/terminal"))
hl.bind(themeMod .. " + S", hl.dsp.exec_cmd(cyberpunk .. "/scripts/screenshot"))

once(cyberpunk .. "/scripts/overkill prewarm")
hl.bind(themeMod .. " + K", hl.dsp.exec_cmd(cyberpunk .. "/scripts/overkill"))
hl.define_submap("kill", function()
    hl.bind("mouse:272", hl.dsp.exec_cmd(cyberpunk .. "/scripts/overkill kill"))
    hl.bind("escape", hl.dsp.exec_cmd(cyberpunk .. "/scripts/overkill exit"))
end)

hl.bind(themeMod .. " + L", hl.dsp.exec_cmd(cyberpunk .. "/components/login/lock.sh"))
hl.bind("CTRL + SHIFT + ALT + r", hl.dsp.exec_cmd(cyberpunk .. "/scripts/restart"))
hl.bind("SUPER + CTRL + Delete", hl.dsp.exec_cmd("hyprctl reload"))

hl.bind("SUPER + SHIFT + F", hl.dsp.window.fullscreen({ mode = "fullscreen" }))
hl.bind("SUPER + F", hl.dsp.window.float({ action = "toggle" }))
hl.bind("SUPER + D", hl.dsp.exec_cmd(cyberpunk .. "/scripts/peek"))

hl.bind("SUPER + left",  hl.dsp.focus({ direction = "left" }))
hl.bind("SUPER + right", hl.dsp.focus({ direction = "right" }))
hl.bind("SUPER + up",    hl.dsp.focus({ direction = "up" }))
hl.bind("SUPER + down",  hl.dsp.focus({ direction = "down" }))

hl.bind("SUPER + SHIFT + left",  hl.dsp.window.move({ direction = "left" }))
hl.bind("SUPER + SHIFT + right", hl.dsp.window.move({ direction = "right" }))
hl.bind("SUPER + SHIFT + up",    hl.dsp.window.move({ direction = "up" }))
hl.bind("SUPER + SHIFT + down",  hl.dsp.window.move({ direction = "down" }))

hl.bind("SUPER + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind("SUPER + mouse:273", hl.dsp.window.resize(), { mouse = true })
hl.bind("SUPER + Q", hl.dsp.window.close())

hl.bind("CTRL + SHIFT + left",  hl.dsp.window.resize({ x = -40, y = 0, relative = true }))
hl.bind("CTRL + SHIFT + right", hl.dsp.window.resize({ x = 40,  y = 0, relative = true }))
hl.bind("CTRL + SHIFT + up",    hl.dsp.window.resize({ x = 0,   y = -40, relative = true }))
hl.bind("CTRL + SHIFT + down",  hl.dsp.window.resize({ x = 0,   y = 40, relative = true }))

hl.bind("SUPER + CTRL + left",  hl.dsp.window.resize({ x = -40, y = 0, relative = true }))
hl.bind("SUPER + CTRL + right", hl.dsp.window.resize({ x = 40,  y = 0, relative = true }))
hl.bind("SUPER + CTRL + up",    hl.dsp.window.resize({ x = 0,   y = -40, relative = true }))
hl.bind("SUPER + CTRL + down",  hl.dsp.window.resize({ x = 0,   y = 40, relative = true }))

for i = 1, 10 do
    local key = i % 10
    hl.bind("ALT + SHIFT + " .. key, hl.dsp.exec_cmd(cyberpunk .. "/scripts/ws move " .. i))
    hl.bind("SUPER + " .. key,       hl.dsp.exec_cmd(cyberpunk .. "/scripts/ws go " .. i))
end

hl.config({
    general = {
        border_size = 2,
        gaps_in  = 12,
        gaps_out = 24,
        col = {
            active_border   = { colors = { "rgba(ff2d3dff)", "rgba(ff6677ff)" }, angle = 45 },
            inactive_border = "rgba(ff2d3d44)",
        },
    },
    decoration = {
        rounding = 0,
        blur = {
            enabled = true,
            size = 3,
            passes = 1,
            noise = 0.04,
        },
        shadow = {
            enabled = true,
            range = 8,
            render_power = 2,
            color = "rgba(ff2d3d55)",
            color_inactive = "rgba(ff2d3d22)",
            offset = { 0, 0 },
        },
        screen_shader = "",
    },
})

local barsfile = cyberpunk .. "/assets/cyberbars/hyprbars.so"
local barsfh = io.open(barsfile, "rb")
if barsfh then
    barsfh:close()
    hl.plugin.load(barsfile)
    hl.config({
        plugin = {
            hyprbars = {
                bar_height = 28,
                bar_color = "rgba(160409f2)",
                col = { text = "rgba(ff2d3dff)" },
                bar_text_size = 12,
                bar_text_font = "FiraCode Nerd Font",
                bar_part_of_window = true,
                bar_precedence_over_border = false,
                bar_padding = 12,
                bar_button_padding = 10,
                ["hyprbars-button"] = {
                    "rgb(ff2d3d), 15, \xEE\xAE\x8B, hyprctl dispatch killactive",
                    "rgb(ff2d3d), 14, \xEE\xAA\xB9, hyprctl dispatch fullscreen 1",
                    "rgb(ff2d3d), 14, \xEE\xAA\xB7, hyprctl dispatch movetoworkspacesilent special:minimized",
                },
            },
        },
    })
end

hl.layer_rule({ match = { namespace = "modal_.*" }, blur = true })

hl.window_rule({
    name        = "rio-terminal",
    match       = { class = "^(rio)$" },
    border_size = 0,
    no_shadow   = true,
    float       = true,
    size        = "1238 766",
    center      = true,
})

hl.window_rule({ match = { class = "^cool-retro-term$" },          float = true })
hl.window_rule({ match = { class = "^cool-retro-term$" },          center = true })
hl.window_rule({ match = { class = "^cool-retro-term$" },          size  = "60% 65%" })
hl.window_rule({ match = { class = "^xdg-desktop-portal-gtk$" },   float = true })
hl.window_rule({ match = { class = "^xdg-desktop-portal-gtk$" },   center = true })
hl.window_rule({ match = { class = "^xdg-desktop-portal-gtk$" },   size  = "60% 65%" })

local filewin = "^(File Upload|Save As|Save File|Save Image|Enter name of file|Open File|Open Files|Select File|Select Files|Choose.*[Ff]ile|Upload File).*$"
hl.window_rule({ match = { title = filewin }, float = true })
hl.window_rule({ match = { title = filewin }, center = true })
hl.window_rule({ match = { title = filewin }, size  = "60% 65%" })

local opwin = "^(Rename.*|Create New Folder|Create Folder|Create Document|Bulk Rename.*|Properties.*|Confirm to replace.*|File Operation.*|Permissions.*|Delete|Trash|Empty Trash)$"
hl.window_rule({ match = { title = opwin }, float = true })
hl.window_rule({ match = { title = opwin }, center = true })

hl.config({ animations = { enabled = true } })
hl.curve("swiftOut", { type = "bezier", points = { {0.05, 0.7}, {0.1, 1.0} } })
hl.animation({ leaf = "windows",     enabled = true, speed = 4, bezier = "swiftOut", style = "slide" })
hl.animation({ leaf = "windowsIn",   enabled = true, speed = 4, bezier = "swiftOut", style = "slide left" })
hl.animation({ leaf = "windowsOut",  enabled = true, speed = 3, bezier = "swiftOut", style = "slide right" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "swiftOut", style = "slide" })
hl.animation({ leaf = "fade",        enabled = true, speed = 4, bezier = "swiftOut" })
hl.animation({ leaf = "workspaces",  enabled = false })
hl.animation({ leaf = "layers",      enabled = true, speed = 3, bezier = "swiftOut", style = "fade" })
