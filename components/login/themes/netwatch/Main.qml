import QtQuick
import QtQuick.Window
import QtMultimedia
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

    readonly property color cAmber:      "#FCDB00"
    readonly property color cAmberSoft:  "#D9B94A"
    readonly property color cAmberDim:   "#7A6620"
    readonly property color cWhite:      "#E6E4D8"
    readonly property color cGray:       "#9A968A"
    readonly property color cGrayDim:    "#5A574B"
    readonly property color cRed:        "#D92027"
    readonly property color cRedDim:     "#7A1E22"
    readonly property color cBlack:      "#0A0A08"
    readonly property color cPanel:      Qt.rgba(10/255,10/255,8/255,0.72)
    readonly property color cLine:       Qt.rgba(252/255,219/255,0/255,0.35)
    readonly property color cLineDim:    Qt.rgba(154/255,150/255,138/255,0.28)

    FontLoader { id: fHead;  source: "font/Rajdhani-Bold.ttf" }
    FontLoader { id: fMono;  source: "font/ShareTechMono-Regular.ttf" }

    ListView { id: sessionHelper; model: typeof sessionModel !== "undefined" ? sessionModel : null; currentIndex: root.sessionIndex; opacity: 0; width: 100; height: 100; z: -100
        delegate: Item { property string sName: model.name || "" } }
    ListView { id: userHelper; model: typeof userModel !== "undefined" ? userModel : null; currentIndex: root.userIndex; opacity: 0; width: 100; height: 100; z: -100
        delegate: Item { property string uName: model.realName || model.name || ""; property string uLogin: model.name || "" } }

    property string hostName: "NC-NET"
    Process { id: hostProc; command: ["sh","-c","hostname"]; running: true
        stdout: SplitParser { onRead: data => { var h=data.trim(); if(h!=="") root.hostName=h.toUpperCase() } } }
    property string district: "WATSON"
    Process { id: distProc; command: ["sh","-c","cat ~/.config/hypr/themes/cyberpunk/district.json 2>/dev/null || echo '{\"district\":\"WATSON\"}'"]; running: true
        stdout: StdioCollector { onStreamFinished: { try{var o=JSON.parse(this.text); root.district=o.district}catch(e){} } } }

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

    Item { anchors.top: parent.top; anchors.left: parent.left; anchors.topMargin: 26 * s; anchors.leftMargin: 30 * s; z: 4; opacity: root.ui
        Row { spacing: 8 * s
            Rectangle { width: 7 * s; height: 7 * s; radius: 3.5 * s; color: root.cRed; anchors.verticalCenter: parent.verticalCenter
                SequentialAnimation on opacity { loops: Animation.Infinite; NumberAnimation{to:0.2;duration:800} NumberAnimation{to:1;duration:800} } }
            Text { text: "SESSION LOCKED"; font.family: fMono.name; font.pixelSize: 9 * s; font.letterSpacing: 2 * s; color: root.cWhite; anchors.verticalCenter: parent.verticalCenter }
        }
        Text { text: "NIGHT CITY · " + root.district; font.family: fMono.name; font.pixelSize: 8 * s; font.letterSpacing: 1 * s; color: root.cGrayDim }
    }

    Column { anchors.top: parent.top; anchors.right: parent.right; anchors.topMargin: 24 * s; anchors.rightMargin: 30 * s; spacing: 2 * s; z: 4; opacity: root.ui
        Text { text: root.clockStr; font.family: fHead.name; font.pixelSize: 34 * s; font.letterSpacing: 2 * s; color: root.cAmber; horizontalAlignment: Text.AlignRight; width: 200 * s }
        Text { text: root.dateStr; font.family: fMono.name; font.pixelSize: 9 * s; font.letterSpacing: 1 * s; color: root.cGray; horizontalAlignment: Text.AlignRight; width: 200 * s }
    }

    Item { id: panelContainer; anchors.centerIn: parent; width: 400 * s; z: 4
        Rectangle { id: panelBg; anchors.fill: parent; color: root.cPanel; border.color: root.cLineDim; border.width: 1 * s
            Rectangle { width: 3 * s; height: 56 * s; color: root.cAmber; anchors.left: parent.left; anchors.top: parent.top; anchors.topMargin: 34 * s }
            Rectangle { width: 3 * s; height: 56 * s; color: root.cLineDim; anchors.left: parent.left; anchors.bottom: parent.bottom; anchors.bottomMargin: 34 * s }
        }

        Column { id: panelCol; width: 340 * s; anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top; anchors.topMargin: 28 * s; spacing: 0
            Item { width: parent.width; height: 26 * s
                Text { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter; text: "NETWATCH // SECURE TERMINAL"
                    font.family: fMono.name; font.pixelSize: 8 * s; font.letterSpacing: 1.5 * s; color: root.cGrayDim }
            }
            Rectangle { width: parent.width; height: 1 * s; color: root.cLineDim }
            Item { width: 1; height: 18 * s }

            Item { width: parent.width; height: 20 * s
                Text { anchors.left: parent.left; text: "USER"; font.family: fMono.name; font.pixelSize: 9 * s; font.letterSpacing: 1.5 * s; color: root.cGrayDim; anchors.verticalCenter: parent.verticalCenter }
                Text { anchors.right: parent.right; text: root.hostName; font.family: fHead.name; font.pixelSize: 11 * s; font.letterSpacing: 1 * s; color: root.cWhite; anchors.verticalCenter: parent.verticalCenter }
            }
            Item { width: 1; height: 14 * s }

            Item { width: parent.width; height: 46 * s
                Rectangle { anchors.fill: parent; color: Qt.rgba(0,0,0,0.35)
                    border.color: pwd.focus ? root.cAmber : root.cLineDim; border.width: 1 * s
                    Behavior on border.color { ColorAnimation { duration: 180 } } }
                Text { anchors.left: parent.left; anchors.leftMargin: 14 * s; anchors.verticalCenter: parent.verticalCenter
                    text: ">"; font.family: fMono.name; font.pixelSize: 14 * s; color: pwd.focus ? root.cAmber : root.cGrayDim
                    Behavior on color { ColorAnimation { duration: 180 } } }
                Item { anchors.left: parent.left; anchors.leftMargin: 34 * s; anchors.right: parent.right; anchors.rightMargin: 14 * s; anchors.verticalCenter: parent.verticalCenter; height: 24 * s; clip: true
                    Text { id: dots; anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                        text: root.lockInput.length ? "●".repeat(root.lockInput.length) : ""
                        font.family: fMono.name; font.pixelSize: 14 * s; font.letterSpacing: 4 * s; color: root.cAmber }
                    Rectangle { id: caret; anchors.left: dots.right; anchors.leftMargin: 6 * s; anchors.verticalCenter: parent.verticalCenter
                        width: 8 * s; height: 18 * s; color: root.cAmber; visible: pwd.focus
                        SequentialAnimation on opacity { loops: Animation.Infinite; NumberAnimation{to:0;duration:520} NumberAnimation{to:1;duration:520} } }
                    Text { anchors.verticalCenter: parent.verticalCenter; anchors.left: parent.left
                        text: "PASSWORD"; visible: root.lockInput.length === 0
                        font.family: fMono.name; font.pixelSize: 10 * s; font.letterSpacing: 1.5 * s; color: root.cGrayDim }
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
                Rectangle { anchors.fill: parent; color: loginMA.containsMouse ? root.cAmber : Qt.rgba(0,0,0,0.35)
                    border.color: root.cLineDim; border.width: 1 * s
                    Behavior on color { ColorAnimation { duration: 160 } } }
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
        text: root.hostName + " · " + root.district; font.family: fMono.name; font.pixelSize: 8 * s; font.letterSpacing: 1 * s; color: root.cGrayDim; z: 4; opacity: root.ui }
    Text { anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.rightMargin: 30 * s; anchors.bottomMargin: 24 * s
        text: "ARASAKA NETWORK"; font.family: fMono.name; font.pixelSize: 8 * s; font.letterSpacing: 1.5 * s; color: root.cRedDim; z: 4; opacity: root.ui }

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
    }
    Timer { id: focusRetry; interval: 60; repeat: true; property int cnt: 0
        onTriggered: { pwd.forceActiveFocus(); if(++cnt>=6){running=false;cnt=0} } }
}
