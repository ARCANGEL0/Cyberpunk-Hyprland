import QtQuick
import QtQuick.Window
import QtQuick.Shapes
import QtMultimedia
import QtGraphicalEffects
import Quickshell
import Quickshell.Io
import SddmComponents 2.0

Rectangle {
    id: root
    width: Screen.width
    height: Screen.height
    color: "#0A0A08"

    readonly property real s: Screen.height / 1080
    property bool isQuickshell: typeof sddm === "undefined" || sddm.hostName === undefined
    property int sessionIndex: (typeof sessionModel !== "undefined" && sessionModel.lastIndex >= 0) ? sessionModel.lastIndex : 0
    property int userIndex: (typeof userModel !== "undefined" && userModel.lastIndex >= 0) ? userModel.lastIndex : 0
    property real ui: 0

    readonly property color cAmber:      "#FF2A3C"
    readonly property color cAmberSoft:  "#FF6B78"
    readonly property color cAmberDim:   "#7A1620"
    readonly property color cWhite:      "#E6E4D8"
    readonly property color cGray:       "#9A8B8D"
    readonly property color cGrayDim:    "#5A4A4E"
    readonly property color cRed:        "#D92027"
    readonly property color cRedDim:     "#7A1E22"
    readonly property color cYellow:     "#FFF200"
    readonly property color cBlack:      "#0A0A08"
    readonly property color cPanel:      Qt.rgba(10/255,10/255,8/255,0.72)
    readonly property color cLine:       Qt.rgba(255/255,42/255,60/255,0.35)
    readonly property color cLineDim:    Qt.rgba(154/255,150/255,138/255,0.28)

    FontLoader { id: fHead;        source: "font/Rajdhani-Bold.ttf" }
    FontLoader { id: fMono;        source: "font/ShareTechMono-Regular.ttf" }
    FontLoader { id: fElons;       source: "font/Elons-Regular.ttf" }
    FontLoader { id: fExo;         source: "font/Exo-Variable.ttf" }
    FontLoader { id: fElectrolize; source: "font/Electrolize-Regular.ttf" }
    FontLoader { id: fSarpanch;    source: "font/Sarpanch-ExtraBold.ttf" }
    FontLoader { id: fEnixe;       source: "font/Enixe.ttf" }

    ListView { id: sessionHelper; model: typeof sessionModel !== "undefined" ? sessionModel : null; currentIndex: root.sessionIndex; opacity: 0; width: 100; height: 100; z: -100
        delegate: Item { property string sName: model.name || "" } }
    ListView { id: userHelper; model: typeof userModel !== "undefined" ? userModel : null; currentIndex: root.userIndex; opacity: 0; width: 100; height: 100; z: -100
        delegate: Item { property string uName: model.realName || model.name || ""; property string uLogin: model.name || "" } }

    property string hostName: "NC-NET"
    Process { id: hostProc; command: ["sh","-c","hostname"]; running: true
        stdout: SplitParser { onRead: data => { var h=data.trim(); if(h!=="") root.hostName=h.toUpperCase() } } }
    property string sessionSig: ""
    function genSig() {
        var hex = "0123456789ABCDEF", out = ""
        for (var g = 0; g < 3; g++) {
            for (var i = 0; i < 4; i++) out += hex.charAt(Math.floor(Math.random() * 16))
            if (g < 2) out += "-"
        }
        return out
    }
    property string cityName: "LOCAL"
    property string cityFull: "UNKNOWN LOCATION"
    property real cityLat: 0
    property real cityLon: 0
    Process { id: cityProc; command: ["sh","-c","cat ~/.config/hypr/themes/cyberpunk/city.json 2>/dev/null || echo '{}'"]; running: true
        stdout: StdioCollector { onStreamFinished: {
            try {
                var o = JSON.parse(this.text)
                if (o.name) root.cityName = String(o.name).toUpperCase()
                if (o.full) root.cityFull = String(o.full).toUpperCase()
                if (typeof o.lat === "number") root.cityLat = o.lat
                if (typeof o.lon === "number") root.cityLon = o.lon
            } catch(e) {}
            root.refreshNews()
        } } }

    readonly property var tickerLines: [
        "SCANNING SUBNET 174.62.0.0/16",
        "ICE COUNTERMEASURE: ACTIVE",
        "UPLINK STABLE — 940Mb/s",
        "ARASAKA FIREWALL: BYPASSED",
        "TRACE ROUTE ESTABLISHED",
        "DAEMON.exe INJECTED",
        "PACKET LOSS: 0.02%",
        "NIGHT CITY GRID: ONLINE",
        "BIOMETRIC SYNC: OK",
        "NETWATCH AGENT DISPATCHED",
        "ENCRYPTION: AES-512 ACTIVE",
        "RELAY NODE 7: SECURE",
        "GHOST PROTOCOL: STANDBY",
    ]
    property var newsHeadlines: []
    property string tickerFeed: ""
    readonly property string glitchChars: "▄▟▌▙▛▚▜▝▐▃▅█▖"
    function glitchBlock() {
        var n = 5 + Math.floor(Math.random() * 8), out = ""
        for (var i = 0; i < n; i++) out += root.glitchChars.charAt(Math.floor(Math.random() * root.glitchChars.length))
        return out
    }
    function hexBlock() {
        var hex = "0123456789ABCDEF", n = 6 + Math.floor(Math.random() * 6), out = "0x"
        for (var i = 0; i < n; i++) out += hex.charAt(Math.floor(Math.random() * 16))
        return out
    }
    function tickerSep() {
        var r = Math.random()
        if (r < 0.45) return "   ▪   "
        if (r < 0.75) return "   " + root.glitchBlock() + "   "
        return "   " + root.hexBlock() + "   "
    }
    function buildTicker(lines) {
        var out = ""
        for (var i = 0; i < lines.length; i++) {
            out += lines[i]
            if (i < lines.length - 1) out += root.tickerSep()
        }
        root.tickerFeed = out
    }

    function stripTags(s) { return String(s || "").replace(/<[^>]*>/g, "") }
    function decodeEntities(s) {
        return String(s || "")
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
            .replace(/&nbsp;/gi, " ")
            .replace(/&rsquo;/gi, "'").replace(/&lsquo;/gi, "'")
            .replace(/&rdquo;/gi, "\"").replace(/&ldquo;/gi, "\"")
            .replace(/&ndash;/gi, "-").replace(/&mdash;/gi, "-")
            .replace(/&hellip;/gi, "...")
            .replace(/&#x([0-9a-f]+);/gi, function(_m,h){ return String.fromCharCode(parseInt(h,16)) })
            .replace(/&#([0-9]+);/g, function(_m,d){ return String.fromCharCode(parseInt(d,10)) })
    }
    function extractTitles(xml, max) {
        var out = [], items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []
        for (var i = 0; i < items.length && out.length < max; i++) {
            var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(items[i])
            if (!m) continue
            var t = root.decodeEntities(root.stripTags(m[1])).replace(/\s+/g, " ").trim()
            if (t) out.push(t)
        }
        return out
    }
    function refreshNews() {
        var cc = "US"
        var localQ = encodeURIComponent((root.cityFull !== "UNKNOWN LOCATION" ? root.cityFull : root.cityName) + " news when:2d")
        var localUrl = "https://news.google.com/rss/search?q=" + localQ + "&hl=en-" + cc + "&gl=" + cc + "&ceid=" + cc + ":en"
        var globalUrl = "https://feeds.bbci.co.uk/news/world/rss.xml"
        newsProc.command = ["sh","-c",
            'curl -sfL --max-time 8 -H "User-Agent: Mozilla/5.0" "' + globalUrl + '"; echo "___QYSPLIT___"; ' +
            'curl -sfL --max-time 8 -H "User-Agent: Mozilla/5.0" "' + localUrl + '"']
        newsProc.running = true
    }
    Process { id: newsProc
        stdout: StdioCollector { onStreamFinished: {
            try {
                var parts = this.text.split("___QYSPLIT___")
                var g = root.extractTitles(parts[0] || "", 7)
                var l = root.extractTitles(parts[1] || "", 7)
                var mixed = []
                for (var i = 0; i < Math.max(g.length, l.length); i++) {
                    if (g[i]) mixed.push(g[i])
                    if (l[i]) mixed.push(l[i])
                }
                if (mixed.length) { root.newsHeadlines = mixed; root.buildTicker(mixed) }
            } catch(e) {}
        } } }
    Timer { interval: 600000; running: true; repeat: true; onTriggered: root.refreshNews() }

    property string clockStr: "--:--"
    property string dateStr: "2077.01.01"
    Timer { interval: 1000; running: true; repeat: true; onTriggered: {
        var d=new Date(), p=function(x){return String(x).padStart(2,"0")}
        root.clockStr = p(d.getHours())+":"+p(d.getMinutes())
        var day=["SUN","MON","TUE","WED","THU","FRI","SAT"]
        root.dateStr = "2077."+p(d.getMonth()+1)+"."+p(d.getDate())+"  "+day[d.getDay()]
    }}

    MouseArea { anchors.fill: parent; cursorShape: Qt.ArrowCursor; z: -1 }

    Loader { anchors.fill: parent; source: "BackgroundVideo.qml" }

    Rectangle { anchors.fill: parent; color: "#660A0A08"; z: 2 }
    Rectangle {
        anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right; height: parent.height * 0.35
        gradient: Gradient {
            GradientStop { position: 0; color: "#B30A0A08" }
            GradientStop { position: 1; color: "transparent" } }
        z: 2
    }
    Canvas { id: fx; anchors.fill: parent; z: 3
        onPaint: {
            var ctx = getContext('2d'); ctx.reset()
            var w = width, h = height, t = Date.now()
            ctx.fillStyle = "rgba(230,226,210,0.02)"
            for(var y=0;y<h;y+=4){ ctx.fillRect(0,(y+(t/70|0)%4)%h,w,1) }
        }
        Timer { interval: 90; running: true; repeat: true; onTriggered: fx.requestPaint() }
    }

    Item { id: statusBlock; anchors.top: parent.top; anchors.left: parent.left; anchors.topMargin: 26 * s; anchors.leftMargin: 30 * s; z: 4; opacity: root.ui
        Bracket { anchors.left: parent.left; anchors.top: parent.top; anchors.margins: -8 * s; width: 20 * s; height: 20 * s; corner: 0; strokeColor: root.cAmber; arm: 15 * s; thickness: 2 * s }
        Column { spacing: 5 * s
            Text { text: root.cityName; font.family: fSarpanch.name; font.pixelSize: 13 * s; font.letterSpacing: 1.5 * s; color: root.cAmber }
            Text { text: root.cityFull; font.family: fElectrolize.name; font.pixelSize: 7.5 * s; font.letterSpacing: 0.8 * s; color: root.cGrayDim }
            Text { text: "GPS " + root.cityLat.toFixed(4) + "° " + root.cityLon.toFixed(4) + "°"; font.family: fMono.name; font.pixelSize: 7 * s; font.letterSpacing: 0.6 * s; color: root.cGrayDim }
        }
    }

    Column { anchors.top: parent.top; anchors.right: parent.right; anchors.topMargin: 24 * s; anchors.rightMargin: 30 * s; spacing: 2 * s; z: 4; opacity: root.ui
        Item { width: 200 * s; height: 42 * s
            Glow { anchors.fill: clockText; source: clockText; color: Qt.rgba(1, 42/255, 60/255, 0.5); radius: 6 * s; samples: 12; spread: 0.15; transparentBorder: true }
            Text { id: clockText; anchors.fill: parent; text: root.clockStr; font.family: fElons.name; font.pixelSize: 34 * s; font.letterSpacing: 2 * s; color: root.cAmber; horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter }
        }
        Text { text: root.dateStr; font.family: fMono.name; font.pixelSize: 9 * s; font.letterSpacing: 1 * s; color: root.cGray; horizontalAlignment: Text.AlignRight; width: 200 * s }
    }

    Item { id: panelContainer; anchors.centerIn: parent; width: 400 * s; z: 4
        Rectangle { id: panelBg; anchors.fill: parent; color: root.cBlack; opacity: 0.42; border.color: root.cLineDim; border.width: 1 * s
            Rectangle { width: 3 * s; height: 56 * s; color: root.cAmber; anchors.left: parent.left; anchors.top: parent.top; anchors.topMargin: 34 * s }
            Rectangle { width: 3 * s; height: 56 * s; color: root.cLineDim; anchors.left: parent.left; anchors.bottom: parent.bottom; anchors.bottomMargin: 34 * s }
        }
        Rectangle { anchors.top: panelBg.top; anchors.left: panelBg.left; anchors.right: panelBg.right; height: 2 * s; color: root.cAmber; opacity: 0.85 }
        Bracket { anchors.left: panelBg.left; anchors.top: panelBg.top; anchors.margins: -7 * s; width: 24 * s; height: 24 * s; corner: 0; strokeColor: root.cAmber; arm: 20 * s; thickness: 2 * s }
        Bracket { anchors.right: panelBg.right; anchors.bottom: panelBg.bottom; anchors.margins: -7 * s; width: 24 * s; height: 24 * s; corner: 2; strokeColor: root.cAmber; arm: 20 * s; thickness: 2 * s }
        Bracket { anchors.right: panelBg.right; anchors.top: panelBg.top; anchors.margins: -7 * s; width: 24 * s; height: 24 * s; corner: 1; strokeColor: root.cLineDim; arm: 20 * s; thickness: 2 * s }
        Bracket { anchors.left: panelBg.left; anchors.bottom: panelBg.bottom; anchors.margins: -7 * s; width: 24 * s; height: 24 * s; corner: 3; strokeColor: root.cLineDim; arm: 20 * s; thickness: 2 * s }

        Column { id: panelCol; width: 340 * s; anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top; anchors.topMargin: 28 * s; spacing: 0
            Item { width: parent.width; height: 26 * s
                Text { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter; text: "//...AUTHENTICATION_SEQUENCE"
                    font.family: fExo.name; font.bold: true; font.pixelSize: 9 * s; font.letterSpacing: 1.5 * s; color: root.cYellow }
                Item { id: lockIcon; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; width: 13 * s; height: 13 * s
                    Glow { anchors.fill: lockVisual; source: lockVisual; color: Qt.rgba(1, 42/255, 60/255, 0.8); radius: 8 * s; samples: 16; spread: 0.4; transparentBorder: true }
                    Item { id: lockVisual; anchors.fill: parent
                        Shape { anchors.fill: parent
                            ShapePath { strokeColor: root.cAmber; strokeWidth: 1.6 * s; fillColor: "transparent"; capStyle: ShapePath.RoundCap
                                PathAngleArc { centerX: lockVisual.width / 2; centerY: lockVisual.height * 0.36; radiusX: lockVisual.width * 0.27; radiusY: lockVisual.height * 0.32; startAngle: 200; sweepAngle: 140 }
                            }
                        }
                        Rectangle { width: parent.width * 0.64; height: parent.height * 0.46; radius: 1.5 * s; color: root.cAmber
                            anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom }
                    }
                }
            }
            Rectangle { width: parent.width; height: 1 * s; color: root.cLineDim }
            Item { width: 1; height: 18 * s }

            Item { width: parent.width; height: 20 * s
                Text { anchors.left: parent.left; text: "USER"; font.family: fExo.name; font.bold: true; font.pixelSize: 9.5 * s; font.letterSpacing: 1.5 * s; color: root.cYellow; anchors.verticalCenter: parent.verticalCenter }
                Text { anchors.right: parent.right; text: root.hostName; font.family: fHead.name; font.pixelSize: 11 * s; font.letterSpacing: 1 * s; color: root.cWhite; anchors.verticalCenter: parent.verticalCenter }
            }
            Item { width: 1; height: 14 * s }

            Item { width: parent.width; height: 46 * s
                Rectangle { anchors.fill: parent; color: root.cBlack; opacity: 0.4
                    border.color: pwd.focus ? root.cAmber : root.cLineDim; border.width: 1 * s
                    Behavior on border.color { ColorAnimation { duration: 180 } } }
                Rectangle { anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom; width: 2 * s
                    color: pwd.focus ? root.cAmber : root.cLineDim
                    Behavior on color { ColorAnimation { duration: 180 } } }
                Text { anchors.left: parent.left; anchors.leftMargin: 14 * s; anchors.verticalCenter: parent.verticalCenter
                    text: ">"; font.family: fMono.name; font.pixelSize: 14 * s; color: pwd.focus ? root.cAmber : root.cGrayDim
                    Behavior on color { ColorAnimation { duration: 180 } } }
                Item { anchors.left: parent.left; anchors.leftMargin: 34 * s; anchors.right: parent.right; anchors.rightMargin: 14 * s; anchors.verticalCenter: parent.verticalCenter; height: 24 * s; clip: true
                    Text { id: dots; anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                        text: root.lockInput.length ? "▮".repeat(root.lockInput.length) : ""
                        font.family: fMono.name; font.pixelSize: 13 * s; font.letterSpacing: 5 * s; color: root.cAmber }
                    Rectangle { id: caret; anchors.left: dots.right; anchors.leftMargin: 6 * s; anchors.verticalCenter: parent.verticalCenter
                        width: 8 * s; height: 18 * s; color: root.cAmber; visible: pwd.focus
                        SequentialAnimation on opacity { loops: Animation.Infinite; NumberAnimation{to:0;duration:520} NumberAnimation{to:1;duration:520} } }
                    Text { anchors.verticalCenter: parent.verticalCenter; anchors.left: parent.left
                        text: "PASSWORD"; visible: root.lockInput.length === 0
                        font.family: fElectrolize.name; font.pixelSize: 10 * s; font.letterSpacing: 1.5 * s; color: root.cGrayDim }
                }
                FocusScope { anchors.fill: parent; focus: true
                    TextInput { id: pwd; width: 1; height: 1; opacity: 0; echoMode: TextInput.NoEcho; cursorVisible: false; focus: true; text: root.lockInput
                        onTextEdited: root.lockInput = text
                        Keys.onReturnPressed: root.doAuth()
                        Keys.onEnterPressed: root.doAuth()
                        Keys.onEscapePressed: root.lockInput = "" } }
            }
            Item { width: 1; height: 10 * s }

            Text { text: root.lockError ? "ACCESS DENIED" : ""; font.family: fMono.name; font.pixelSize: 9 * s; font.letterSpacing: 2 * s; color: root.cRed
                height: 16 * s; horizontalAlignment: Text.AlignLeft
                opacity: root.lockError ? 1 : 0; Behavior on opacity { NumberAnimation { duration: 200 } } }
            Item { width: 1; height: 10 * s }

            Item { width: parent.width; height: 42 * s
                CutPanel { anchors.fill: parent; strokeColor: root.cAmber; strokeWidth: 1 * s; cut: 10 * s
                    cutTopLeft: true; cutBottomRight: true; cutTopRight: false; cutBottomLeft: false
                    fillColor: loginMA.containsMouse ? root.cAmber : root.cBlack
                    fillOpacity: loginMA.containsMouse ? 0.9 : 0.4
                    Behavior on fillColor { ColorAnimation { duration: 160 } }
                    Behavior on fillOpacity { NumberAnimation { duration: 160 } } }
                Text { anchors.centerIn: parent
                    text: root.isAuthenticating ? "ACCESSING..." : "LOG IN"
                    font.family: fHead.name; font.pixelSize: 11 * s; font.letterSpacing: 3 * s; font.bold: true
                    color: loginMA.containsMouse ? root.cBlack : root.cAmber
                    Behavior on color { ColorAnimation { duration: 160 } } }
                MouseArea { id: loginMA; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.doAuth() }
            }
        }
        Component.onCompleted: panelContainer.height = panelBg.height ? panelBg.height : 0
    }

    Text { anchors.left: parent.left; anchors.bottom: parent.bottom; anchors.leftMargin: 30 * s; anchors.bottomMargin: 24 * s
        text: "SIG " + root.sessionSig; font.family: fMono.name; font.pixelSize: 8 * s; font.letterSpacing: 1 * s; color: root.cGrayDim; z: 4; opacity: root.ui }
    Row { anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.rightMargin: 30 * s; anchors.bottomMargin: 24 * s; spacing: 6 * s; z: 4; opacity: root.ui
        Text { text: "POWERED BY"; font.family: fElectrolize.name; font.capitalization: Font.AllUppercase; font.pixelSize: 8 * s; font.letterSpacing: 1.5 * s; color: root.cAmber; anchors.verticalCenter: parent.verticalCenter }
        Item { width: netwatchText.implicitWidth; height: netwatchText.implicitHeight; anchors.verticalCenter: parent.verticalCenter
            Glow { anchors.fill: netwatchText; source: netwatchText; color: Qt.rgba(1, 42/255, 60/255, 0.75); radius: 10 * s; samples: 18; spread: 0.3; transparentBorder: true }
            Text { id: netwatchText; text: "NETWATCH"; font.family: fEnixe.name; font.capitalization: Font.AllUppercase; font.pixelSize: 11 * s; font.letterSpacing: 1 * s; color: root.cAmber }
        }
    }

    Item { id: tickerClip; anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.bottomMargin: 58 * s; height: 22 * s; z: 4; opacity: root.ui * 0.85; clip: true
        Text { id: tickerText; anchors.verticalCenter: parent.verticalCenter; text: root.tickerFeed
            font.family: fMono.name; font.pixelSize: 11 * s; font.letterSpacing: 1.5 * s; color: root.cAmberSoft
            x: tickerClip.width
            SequentialAnimation on x { loops: Animation.Infinite
                NumberAnimation { from: tickerClip.width; to: -tickerText.paintedWidth; duration: Math.max(14000, tickerText.paintedWidth * 16) }
            }
        }
    }

    property string lockInput: ""
    property bool lockError: false
    property bool isAuthenticating: false

    function doAuth() {
        if(root.lockInput==="" || root.isAuthenticating) return
        var u = (userHelper.currentItem && userHelper.currentItem.uLogin) ? userHelper.currentItem.uLogin : (typeof userModel!=="undefined" ? userModel.lastUser : "")
        root.isAuthenticating = true
        if(typeof sddm!=="undefined") sddm.login(u, root.lockInput, root.sessionIndex)
        else root.lockError = true
    }

    Connections { target: typeof sddm!=="undefined" ? sddm : null
        function onLoginFailed() {
            root.isAuthenticating = false; root.lockError = true; root.lockInput = ""
            pwd.forceActiveFocus(); errTimer.restart(); shake.start()
        }
        function onLoginSucceeded() { root.isAuthenticating = false }
    }
    Timer { id: errTimer; interval: 1800; repeat: false; onTriggered: root.lockError=false }

    NumberAnimation { id: fadeIn; target: panelContainer; property: "opacity"; from: 0; to: 1; duration: 700; easing.type: Easing.InOutQuad }
    NumberAnimation { id: riseIn; target: panelContainer; property: "anchors.verticalCenterOffset"; from: -20 * s; to: 0; duration: 700; easing.type: Easing.OutQuad }

    SequentialAnimation { id: shake
        NumberAnimation{target:panelContainer;property:"anchors.horizontalCenterOffset";from:0;to:-8 * s;duration:45}
        NumberAnimation{target:panelContainer;property:"anchors.horizontalCenterOffset";to:8 * s;duration:60}
        NumberAnimation{target:panelContainer;property:"anchors.horizontalCenterOffset";to:-6 * s;duration:50}
        NumberAnimation{target:panelContainer;property:"anchors.horizontalCenterOffset";to:6 * s;duration:50}
        NumberAnimation{target:panelContainer;property:"anchors.horizontalCenterOffset";to:0;duration:45} }

    Component.onCompleted: {
        root.ui = 1; fadeIn.start(); riseIn.start(); pwd.forceActiveFocus(); focusRetry.restart()
        root.sessionSig = root.genSig()
        root.buildTicker(root.tickerLines)
    }
    Timer { id: focusRetry; interval: 60; repeat: true; property int cnt: 0
        onTriggered: { pwd.forceActiveFocus(); if(++cnt>=6){running=false;cnt=0} } }
}
