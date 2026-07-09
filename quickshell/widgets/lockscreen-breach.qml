// ─────────────────────────────────────────────────────────────────────────────
//  BREACH PROTOCOL — cyberpunk lockscreen for Quickshell
//  Self-contained (no video deps). PAM auth via `pamtester qs-lock`.
//  Palette: neon red #ff554e, cyan #77e2f2 (focus/hover), near-black bg.
// ─────────────────────────────────────────────────────────────────────────────
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    id: root

    // ── palette ──
    readonly property color cRed:   "#ff554e"
    readonly property color cRedDim: Qt.rgba(255/255, 85/255, 78/255, 0.45)
    readonly property color cRedFaint: Qt.rgba(255/255, 85/255, 78/255, 0.15)
    readonly property color cCyan:  "#77e2f2"
    readonly property color cInk:   "#0a0204"
    readonly property string mono:  "Share Tech Mono"
    readonly property string mono2: "JetBrains Mono"
    readonly property string display: "Chakra Petch"
    // passphrase mask — one diamond per typed char (reveals length only, never the password)
    property string maskStr: {
        var s = ""
        for (var i = 0; i < lockInput.length; i++) s += (i ? " " : "") + "◆"
        return s
    }

    property string home:          Quickshell.env("HOME")
    property string xdgConfigHome: Quickshell.env("XDG_CONFIG_HOME") || (home + "/.config")

    // ── auth ──
    property string lockInput:   ""
    property bool   lockError:   false
    property bool   lockPending: false
    property bool   unlocking:   false

    property string currentUser: "user"
    Process {
        id: getUserProc; command: ["sh", "-c", "echo $USER"]; running: true
        stdout: SplitParser { onRead: data => { var u = data.trim(); if (u !== "") root.currentUser = u } }
    }
    property string machineName: "NODE WN-38K"

    Process {
        id: hostProc
        command: ["sh", "-c", "hostname"]
        running: true

        stdout: SplitParser {
            onRead: data => {
                var h = data.trim()
                if (h !== "") root.machineName = h
            }
        }
    }


    property string cityFull: "UNKNOWN LOCATION"

    Process {
    id: cityProc
    command: ["sh", "-c", "cat ~/.config/hypr/themes/cyberpunk/city.json"]
    running: true

    stdout: StdioCollector {
        onStreamFinished: {
            try {
                var obj = JSON.parse(this.text)
                root.cityFull = obj.full
            } catch (e) {
                root.cityFull = "UNKNOWN LOCATION"
            }
        }
    }
}
    Process {
        id: authProc
        command: ["/bin/bash", "-c",
            "printf '%s\\n' \"$LOCKPWD\" | pamtester qs-lock \"$LOCKUSER\" authenticate >/dev/null 2>&1 && echo OK || echo FAIL"]
        running: false
        property string envPwd: ""; property string envUser: ""
        environment: ({ "LOCKPWD": authProc.envPwd, "LOCKUSER": authProc.envUser })
        stdout: StdioCollector { onStreamFinished: {
            root.lockPending = false
            if (this.text.trim() === "OK") {
                root.lockInput = ""
                root.lockError = false
                root.unlocking = true
                exitTimer.restart()
            } else {
                root.lockError = true
                root.lockInput = ""
                errTimer.restart()
            }
        }}
    }
    Timer { id: errTimer; interval: 1100; repeat: false; onTriggered: root.lockError = false }
    Timer { id: exitTimer; interval: 320; repeat: false; onTriggered: Qt.quit() }

    function doAuth() {
        if (root.lockPending || root.lockInput === "") return
        root.lockPending = true
        authProc.envPwd  = root.lockInput
        authProc.envUser = root.currentUser
        authProc.running = true
    }

    // ── clock ──
    property string clockStr:  "--:--"
    property string secStr:    "--"
    property string dateStr:   "---- · -- · --"
    Timer {
        interval: 1000; running: true; repeat: true
        onTriggered: {
            var d = new Date(), p = function (x) { return String(x).padStart(2, "0") }
            root.clockStr = p(d.getHours()) + ":" + p(d.getMinutes())
            root.secStr   = p(d.getSeconds())
            var day = ["SUN","MON","TUE","WED","THU","FRI","SAT"]
            root.dateStr  = d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + "  //  " + day[d.getDay()]
        }
    }

    function hexLine(n) {
        var s = "", h = "0123456789ABCDEF"
        for (var i = 0; i < n; i++) {
            s += h[(Math.random() * 16) | 0] + h[(Math.random() * 16) | 0]
            if (i < n - 1) s += " "
        }
        return s
    }

    Variants {
        model: Quickshell.screens
        PanelWindow {
            required property var modelData
            screen: modelData
            anchors.top: true; anchors.left: true; anchors.right: true; anchors.bottom: true
            exclusionMode: ExclusionMode.Ignore
            color: "transparent"
            implicitWidth: modelData.width; implicitHeight: modelData.height
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.keyboardFocus: root.unlocking ? WlrKeyboardFocus.None : WlrKeyboardFocus.Exclusive

            property bool isPrimary: modelData.name === Quickshell.screens[0].name

            Item {
                id: scene
                anchors.fill: parent
                opacity: root.unlocking ? 0 : 1
                Behavior on opacity { NumberAnimation { duration: 300; easing.type: Easing.InQuad } }

                // ── background: black → deep red gradient ──
                Rectangle {
                    anchors.fill: parent
                    gradient: Gradient {
                        GradientStop { position: 0.0; color: "#1a0306" }
                        GradientStop { position: 0.55; color: "#0a0103" }
                        GradientStop { position: 1.0; color: "#000000" }
                    }
                }


                // ── red vignette edges ──
                Rectangle { anchors.fill: parent; color: "transparent"; border.width: 0
                    gradient: Gradient { orientation: Gradient.Vertical
                        GradientStop { position: 0; color: Qt.rgba(255/255,85/255,78/255,0.08) }
                        GradientStop { position: 0.12; color: "transparent" }
                        GradientStop { position: 0.88; color: "transparent" }
                        GradientStop { position: 1; color: Qt.rgba(255/255,85/255,78/255,0.08) } } }


                Rectangle {
                    anchors.fill: parent; color: "transparent"
                    gradient: Gradient {
                        GradientStop { position: 0;   color: Qt.rgba(255/255,85/255,78/255,0.06) }
                        GradientStop { position: 0.45; color: "transparent" } }
                    SequentialAnimation on opacity { loops: Animation.Infinite
                        NumberAnimation { from: 0.35; to: 1; duration: 3400; easing.type: Easing.InOutSine }
                        NumberAnimation { from: 1; to: 0.35; duration: 3400; easing.type: Easing.InOutSine } }
                }

                // ── corner HUD labels ──
                Column {
                    anchors { top: parent.top; left: parent.left; topMargin: 30; leftMargin: 34 }
                    spacing: 3
                    Row { spacing: 6
                        Rectangle { width: 6; height: 6; color: root.cRed; anchors.verticalCenter: parent.verticalCenter
                            SequentialAnimation on opacity { loops: Animation.Infinite
                                NumberAnimation { to: 0.25; duration: 700 } NumberAnimation { to: 1; duration: 700 } } }
                        Text { text: " SESSION LOCKED"; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRed }
                    }
                    Text { text: "HOST · " + root.currentUser; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRedDim }
                    Text { text: "[ BLACK ICE · ACTIVE ]"; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRedDim }
                }
                Column {
                    anchors { top: parent.top; right: parent.right; topMargin: 30; rightMargin: 34 }
                    spacing: 3
                    Text { text: "UPLINK STABLE"; width: 220; horizontalAlignment: Text.AlignRight; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRedDim }
                }
                Text { anchors { bottom: parent.bottom; left: parent.left; bottomMargin: 30; leftMargin: 34 }
                    text: "KERNEL // SECURE SHELL"; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRedDim }
                
                Column {
                    anchors {
                        bottom: parent.bottom
                        right: parent.right
                        bottomMargin: 30
                        rightMargin: 34
                    }

                    width: 260
                    spacing: 2

                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignRight

                        text: root.machineName
                        font.family: root.mono
                        font.pixelSize: 10
                        font.letterSpacing: 2
                        color: root.cRed
                    }

                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignRight

                        text: root.cityFull
                        font.family: root.mono
                        font.pixelSize: 10
                        font.letterSpacing: 2
                        color: root.cRedDim
                    }
                }                                                                   

                // ── ticker ──
                Item {
                    anchors { bottom: parent.bottom; bottomMargin: 60; left: parent.left; right: parent.right }
                    height: 16; clip: true
                    Text {
                        id: tick
                        text: "◆ NETWATCH SECURITY GATEWAY ▸ OPERATOR: UNKNOWN ▸ AUTHORIZATION REQUIRED ▸ SECURITY PROFILE: UNVERIFIED ▸ SESSION ACCESS: DENIED ▸ EVENT LOGGING: ACTIVE ▸ NETWORK STATUS: STABLE ▸ CREDENTIAL VALIDATION: PENDING ▸"

                        font.family: root.mono
                        font.pixelSize: 12
                        font.letterSpacing: 3
                        color: root.cRedFaint
                        y: 2

                        property int startX: tick.parent.width
                        property int endX: -tick.implicitWidth

                        x: startX

                        SequentialAnimation on x {
                            loops: Animation.Infinite

                            NumberAnimation {
                                from: tick.parent.width
                                to: -tick.implicitWidth
                                duration: 45000
                                easing.type: Easing.Linear
                            }
                        }
                    }
                                        

                }

                Item {
                    id: panelHost
                    property int tabH: 26
                    width: 470
                    height: tabH + panelCol.implicitHeight + 76
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.verticalCenter: parent.verticalCenter

                    // red-glow frame 
                    Canvas {
                        id: frame
                        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; top: parent.top; topMargin: panelHost.tabH - 1 }
                        onPaint: {
                            var ctx = getContext('2d'); ctx.reset()
                            var w = width, h = height, c = 18
                            function pathFn() {
                                ctx.beginPath()
                                ctx.moveTo(0, 0); ctx.lineTo(w, 0)
                                ctx.lineTo(w, h - c); ctx.lineTo(w - c, h)
                                ctx.lineTo(0, h); ctx.closePath()
                            }
                            pathFn(); ctx.fillStyle = "rgba(8,2,4,0.85)"; ctx.fill()
                            for (var i = 7; i >= 1; i--) { pathFn(); ctx.lineWidth = 2 + i * 3; ctx.strokeStyle = "rgba(255,85,78,0.05)"; ctx.stroke() }
                            pathFn(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,85,78,0.95)"; ctx.stroke()
                        }
                    }

                    Item {
                        anchors.fill: frame; anchors.margins: 8; clip: true
                        Text {
                            anchors { left: parent.left; top: parent.top; leftMargin: 6; topMargin: 4 }
                            font.family: root.mono2; font.pixelSize: 11; color: root.cRed; opacity: 0.045; lineHeight: 1.55
                            text: "async_func_t        func;\nvoid               *data;\nstruct async_domain *domain;\nstatic DECLARE_WAIT_QUEUE_HEAD(async_done);\nstatic atomic_t entry_count;\nstatic async_cookie_t lowest_in_progress(struct async_domain *d)\n{\n    struct async_entry *first = NULL;\n    async_cookie_t ret = ASYNC_COOKIE_MAX;\n    unsigned long flags;\n    spin_lock_irqsave(&async_lock, flags);\n    if (!list_empty(&async_global_pending))\n        first = list_first_entry(&async_global_pending, struct async_entry, global_list);\n    if (first) ret = first->cookie;\n    spin_unlock_irqrestore(&async_lock, flags);\n    return ret;\n}"
                        }
                    }

                    // centered scrim so the form reads above the code (code stays at the margins, like #131)
                    Rectangle {
                        anchors.centerIn: frame
                        width: 418; height: frame.height - 14
                        color: Qt.rgba(6/255, 1/255, 3/255, 0.66)
                    }

                    // top-left filled tab / section label (like #131)
                    Rectangle {
                        id: tab; z: 10
                        x: 0; y: 0; height: panelHost.tabH; width: tabTxt.implicitWidth + 30
                        color: root.cRed
                        Text { id: tabTxt; anchors.centerIn: parent
                            text: "// NETWATCH AUTHENTICATION PROTOCOL :: ACTIVE"; font.family: root.mono; font.pixelSize: 11; font.letterSpacing: 2; font.bold: true; color: "#1a0204" }
                    }

                    // glitch shake on error
                    SequentialAnimation { id: shakeAnim
                        NumberAnimation { target: panelHost; property: "anchors.horizontalCenterOffset"; from: 0; to: -12; duration: 50 }
                        NumberAnimation { target: panelHost; property: "anchors.horizontalCenterOffset"; to: 12; duration: 70 }
                        NumberAnimation { target: panelHost; property: "anchors.horizontalCenterOffset"; to: -8; duration: 60 }
                        NumberAnimation { target: panelHost; property: "anchors.horizontalCenterOffset"; to: 8; duration: 60 }
                        NumberAnimation { target: panelHost; property: "anchors.horizontalCenterOffset"; to: 0; duration: 50 }
                    }

                    Column {
                        id: panelCol
                        width: 388
                        anchors { top: parent.top; topMargin: panelHost.tabH + 22; horizontalCenter: parent.horizontalCenter }
                        spacing: 0

                        // ── status header (split row) ──
                        Item { width: parent.width; height: 12
                            Row { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter; spacing: 7
                                Rectangle { width: 6; height: 6; color: root.cRed; anchors.verticalCenter: parent.verticalCenter
                                    SequentialAnimation on opacity { loops: Animation.Infinite
                                        NumberAnimation { to: 0.2; duration: 650 } NumberAnimation { to: 1; duration: 650 } } }
                                Text { text: "AWAITING CREDENTIALS"; font.family: root.mono; font.pixelSize: 9; font.letterSpacing: 2; color: root.cRedDim
                                    anchors.verticalCenter: parent.verticalCenter }
                            }
                            Text { anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                                text: "NODE//0x1C55"; font.family: root.mono2; font.pixelSize: 9; font.letterSpacing: 1; color: root.cRedFaint }
                        }
                        Item { width: 1; height: 16 }

                        // ── clock (red, RGB-split glitch) ──
                        Item {
                            id: clockBox; width: parent.width; height: 64
                            property real gx: 0
                            // cyan ghost (glitch edge)
                            Text { anchors.centerIn: parent; anchors.horizontalCenterOffset: -2.5 - clockBox.gx; anchors.verticalCenterOffset: -1
                                text: root.clockStr; font.family: root.display; font.weight: Font.Bold; font.pixelSize: 60; font.letterSpacing: 1
                                color: root.cCyan; opacity: 0.5 }
                            // dim red ghost (bloom)
                            Text { anchors.centerIn: parent; anchors.horizontalCenterOffset: 2.5 + clockBox.gx; anchors.verticalCenterOffset: 1
                                text: root.clockStr; font.family: root.display; font.weight: Font.Bold; font.pixelSize: 60; font.letterSpacing: 1
                                color: root.cRed; opacity: 0.45 }
                            // main numerals — red
                            Text { anchors.centerIn: parent
                                text: root.clockStr; font.family: root.display; font.weight: Font.Bold; font.pixelSize: 60; font.letterSpacing: 1
                                color: root.cRed }
                            // occasional glitch jitter
                            Timer { interval: 3000; running: true; repeat: true
                                onTriggered: { clockBox.gx = (Math.random() < 0.5 ? -3 : 3); glitchReset.restart() } }
                            Timer { id: glitchReset; interval: 80; onTriggered: clockBox.gx = 0 }
                        }
                        Item { width: 1; height: 18 }

                        // divider
                        Rectangle { width: parent.width; height: 1; color: root.cRedFaint }
                        Item { width: 1; height: 13 }

                        // ── access / user (split row) ──
                        Item { width: parent.width; height: 16
                            Row { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                                Text { text: "ACCESS ▸ "; font.family: root.mono; font.pixelSize: 11; font.letterSpacing: 2; color: root.cRedDim }
                                Text { text: root.currentUser.toUpperCase(); font.family: root.mono; font.pixelSize: 11; font.letterSpacing: 2; color: root.cRed }
                            }
                            Text { anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                                text: "CLEARANCE ▮▮▮▯"; font.family: root.mono; font.pixelSize: 9; font.letterSpacing: 1; color: root.cRedFaint }
                        }
                        Item { width: 1; height: 9 }

                        // ── passphrase input (cyberpunk hex mask — no plaintext echo) ──
                        Item { width: parent.width; height: 42
                            Rectangle { anchors.fill: parent
                                color: inputScope.activeFocus ? Qt.rgba(root.cCyan.r, root.cCyan.g, root.cCyan.b, 0.05) : "transparent"
                                border.color: root.lockError ? root.cRed : (inputScope.activeFocus ? root.cCyan : root.cRedDim); border.width: 1
                                Behavior on border.color { ColorAnimation { duration: 180 } } }
                            // left accent notch
                            Rectangle { width: 3; height: parent.height; color: inputScope.activeFocus ? root.cCyan : root.cRed
                                Behavior on color { ColorAnimation { duration: 180 } } }
                            Text { anchors.left: parent.left; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter
                                text: "▸"; font.pixelSize: 12; color: inputScope.activeFocus ? root.cCyan : root.cRed
                                Behavior on color { ColorAnimation { duration: 180 } } }

                            // masked hex readout + block caret (the passphrase shown as a live hex stream)
                            Item {
                                id: maskField; clip: true
                                anchors { left: parent.left; leftMargin: 32; right: parent.right; rightMargin: 46; top: parent.top; bottom: parent.bottom }
                                Text { id: maskText; anchors.verticalCenter: parent.verticalCenter; anchors.left: parent.left
                                    text: root.maskStr; font.family: root.mono2; font.pixelSize: 12; font.letterSpacing: 2
                                    color: root.lockError ? root.cRed : root.cCyan }
                                Rectangle { id: blockCaret; anchors.verticalCenter: parent.verticalCenter
                                    anchors.left: maskText.right; anchors.leftMargin: root.lockInput.length > 0 ? 3 : 0
                                    width: 9; height: 18; color: root.cCyan; visible: inputScope.activeFocus
                                    SequentialAnimation on opacity { loops: Animation.Infinite
                                        NumberAnimation { to: 0; duration: 520 } NumberAnimation { to: 1; duration: 520 } } }
                                Text { visible: root.lockInput.length === 0; anchors.verticalCenter: parent.verticalCenter; anchors.left: parent.left; anchors.leftMargin: 14
                                    text: "ENTER PASSPHRASE"; font.family: root.mono; font.pixelSize: 10; font.letterSpacing: 2; color: root.cRedDim }
                            }

                            // hidden input — captures keys/focus; nothing of its own is drawn
                            FocusScope {
                                id: inputScope
                                anchors.fill: parent
                                focus: true
                                TextInput {
                                    id: pwInput; width: 1; height: 1; opacity: 0
                                    echoMode: TextInput.NoEcho; cursorVisible: false
                                    focus: true
                                    text: root.lockInput
                                    onTextEdited: root.lockInput = text
                                    Keys.onReturnPressed: root.doAuth()
                                    Keys.onEnterPressed: root.doAuth()
                                    Keys.onEscapePressed: root.lockInput = ""
                                }
                            }
                            // char count
                            Text { anchors.right: parent.right; anchors.rightMargin: 12; anchors.verticalCenter: parent.verticalCenter
                                text: ("0" + root.lockInput.length).slice(-2); font.family: root.mono2; font.pixelSize: 10
                                color: root.lockInput.length > 0 ? root.cCyan : root.cRedFaint }
                        }
                        Item { width: 1; height: 14 }

                        // error
                        Text { text: "⚠ ICE INTRUSION DETECTED — ACCESS DENIED"; font.family: root.mono; font.pixelSize: 9; font.letterSpacing: 2; color: root.cRed
                            anchors.horizontalCenter: parent.horizontalCenter; height: 12
                            opacity: root.lockError ? 1 : 0; Behavior on opacity { NumberAnimation { duration: 180 } } }
                        Item { width: 1; height: 8 }

                        // divider
                        Rectangle { width: parent.width; height: 1; color: root.cRedFaint }
                        Item { width: 1; height: 12 }

                        Item { width: parent.width; height: 42
                            Rectangle { id: btnBg; anchors.fill: parent
                                color: breachMA.containsMouse ? Qt.rgba(root.cCyan.r, root.cCyan.g, root.cCyan.b, 0.12) : "transparent"
                                border.color: breachMA.containsMouse ? root.cCyan : root.cRed; border.width: 1
                                Behavior on border.color { ColorAnimation { duration: 160 } } }
                            Text { anchors.centerIn: parent
                                text: root.lockPending ? "AUTHENTICATING…" : "AUTHENTICATE ▸"
                                font.family: root.mono; font.pixelSize: 12; font.letterSpacing: 4
                                color: breachMA.containsMouse ? root.cCyan : root.cRed
                                Behavior on color { ColorAnimation { duration: 160 } } }
                            Repeater { model: 4
                                Rectangle { width: 10; height: 2
                                    color: breachMA.containsMouse ? root.cCyan : root.cRed
                                    x: (index % 2 === 0) ? 0 : btnBg.width - 10
                                    y: (index < 2) ? 0 : btnBg.height - 2
                                    Behavior on color { ColorAnimation { duration: 160 } } }
                            }
                            MouseArea { id: breachMA; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                                onClicked: root.doAuth() }
                        }
                    }
                }
            }

            Component.onCompleted: { if (isPrimary) { pwInput.forceActiveFocus(); focusRetry.restart() } }
            Timer { id: focusRetry; interval: 60; repeat: true; property int cnt: 0
                onTriggered: { pwInput.forceActiveFocus(); if (++cnt >= 10) { running = false; cnt = 0 } } }

            Connections {
                target: root
                function onLockErrorChanged() { if (root.lockError) shakeAnim.restart() }
            }
        }
    }
}
