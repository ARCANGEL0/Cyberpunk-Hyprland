import QtQuick

Item {
    id: br

    property color strokeColor: "#ff2a3c"
    property real thickness: 2
    property real arm: 26
    property int corner: 0

    readonly property bool atRight: corner === 1 || corner === 2
    readonly property bool atBottom: corner === 2 || corner === 3

    Rectangle {
        color: br.strokeColor
        width: br.arm
        height: br.thickness
        x: br.atRight ? br.width - br.arm : 0
        y: br.atBottom ? br.height - br.thickness : 0
    }

    Rectangle {
        color: br.strokeColor
        width: br.thickness
        height: br.arm
        x: br.atRight ? br.width - br.thickness : 0
        y: br.atBottom ? br.height - br.arm : 0
    }
}
