import QtQuick
import QtQuick.Shapes

Item {
    id: cp

    property color fillColor: "#150a0e"
    property color strokeColor: "#ff2a3c"
    property real fillOpacity: 0.85
    property real strokeWidth: 1
    property real cut: 8

    property bool cutTopLeft: false
    property bool cutTopRight: true
    property bool cutBottomRight: false
    property bool cutBottomLeft: true

    readonly property real ctl: cutTopLeft ? cut : 0
    readonly property real ctr: cutTopRight ? cut : 0
    readonly property real cbr: cutBottomRight ? cut : 0
    readonly property real cbl: cutBottomLeft ? cut : 0

    Shape {
        anchors.fill: parent
        antialiasing: true

        ShapePath {
            fillColor: Qt.rgba(cp.fillColor.r, cp.fillColor.g, cp.fillColor.b, cp.fillOpacity)
            strokeColor: cp.strokeColor
            strokeWidth: cp.strokeWidth
            joinStyle: ShapePath.MiterJoin

            startX: cp.ctl
            startY: 0
            PathLine { x: cp.width - cp.ctr; y: 0 }
            PathLine { x: cp.width;          y: cp.ctr }
            PathLine { x: cp.width;          y: cp.height - cp.cbr }
            PathLine { x: cp.width - cp.cbr; y: cp.height }
            PathLine { x: cp.cbl;            y: cp.height }
            PathLine { x: 0;                 y: cp.height - cp.cbl }
            PathLine { x: 0;                 y: cp.ctl }
            PathLine { x: cp.ctl;            y: 0 }
        }
    }
}
