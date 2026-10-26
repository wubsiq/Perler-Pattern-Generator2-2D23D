const colorSets = {
    mard291: [
        { name: "A1", rgb: [250, 244, 200] },
        { name: "A10", rgb: [247, 124, 49] },
        { name: "A11", rgb: [255, 221, 153] },
        { name: "A12", rgb: [254, 159, 114] },
        { name: "A13", rgb: [255, 195, 101] },
        { name: "A14", rgb: [253, 84, 61] },
        { name: "A15", rgb: [255, 243, 101] },
        { name: "A16", rgb: [255, 255, 159] },
        { name: "A17", rgb: [255, 227, 110] },
        { name: "A18", rgb: [254, 190, 125] },
        { name: "A19", rgb: [253, 124, 114] },
        { name: "A2", rgb: [255, 255, 213] },
        { name: "A20", rgb: [255, 213, 104] },
        { name: "A21", rgb: [255, 227, 149] },
        { name: "A22", rgb: [244, 245, 125] },
        { name: "A23", rgb: [230, 201, 183] },
        { name: "A24", rgb: [247, 248, 162] },
        { name: "A25", rgb: [255, 214, 125] },
        { name: "A26", rgb: [255, 200, 48] },
        { name: "A3", rgb: [254, 255, 139] },
        { name: "A4", rgb: [251, 237, 86] },
        { name: "A5", rgb: [244, 215, 56] },
        { name: "A6", rgb: [254, 172, 76] },
        { name: "A7", rgb: [254, 139, 76] },
        { name: "A8", rgb: [255, 218, 69] },
        { name: "A9", rgb: [255, 153, 91] },
        { name: "B1", rgb: [230, 238, 49] },
        { name: "B10", rgb: [149, 211, 194] },
        { name: "B11", rgb: [93, 114, 42] },
        { name: "B12", rgb: [22, 111, 65] },
        { name: "B13", rgb: [202, 235, 123] },
        { name: "B14", rgb: [173, 233, 70] },
        { name: "B15", rgb: [46, 81, 50] },
        { name: "B16", rgb: [197, 237, 156] },
        { name: "B17", rgb: [155, 177, 58] },
        { name: "B18", rgb: [230, 238, 73] },
        { name: "B19", rgb: [36, 184, 140] },
        { name: "B2", rgb: [99, 243, 71] },
        { name: "B20", rgb: [194, 240, 204] },
        { name: "B21", rgb: [21, 106, 107] },
        { name: "B22", rgb: [11, 60, 67] },
        { name: "B23", rgb: [48, 58, 33] },
        { name: "B24", rgb: [238, 252, 165] },
        { name: "B25", rgb: [78, 132, 109] },
        { name: "B26", rgb: [141, 122, 53] },
        { name: "B27", rgb: [204, 225, 175] },
        { name: "B28", rgb: [158, 229, 185] },
        { name: "B29", rgb: [197, 226, 84] },
        { name: "B3", rgb: [158, 247, 128] },
        { name: "B30", rgb: [226, 252, 177] },
        { name: "B31", rgb: [176, 231, 146] },
        { name: "B32", rgb: [156, 171, 90] },
        { name: "B4", rgb: [93, 224, 53] },
        { name: "B5", rgb: [53, 227, 82] },
        { name: "B6", rgb: [101, 226, 166] },
        { name: "B7", rgb: [61, 175, 128] },
        { name: "B8", rgb: [28, 156, 79] },
        { name: "B9", rgb: [39, 82, 58] },
        { name: "C1", rgb: [232, 255, 231] },
        { name: "C10", rgb: [62, 188, 226] },
        { name: "C11", rgb: [40, 221, 222] },
        { name: "C12", rgb: [28, 51, 77] },
        { name: "C13", rgb: [205, 232, 255] },
        { name: "C14", rgb: [213, 253, 255] },
        { name: "C15", rgb: [34, 196, 198] },
        { name: "C16", rgb: [21, 87, 168] },
        { name: "C17", rgb: [4, 209, 246] },
        { name: "C18", rgb: [29, 51, 68] },
        { name: "C19", rgb: [24, 135, 162] },
        { name: "C2", rgb: [169, 249, 252] },
        { name: "C20", rgb: [23, 109, 175] },
        { name: "C21", rgb: [190, 221, 255] },
        { name: "C22", rgb: [103, 180, 190] },
        { name: "C23", rgb: [200, 226, 255] },
        { name: "C24", rgb: [124, 196, 255] },
        { name: "C25", rgb: [169, 229, 229] },
        { name: "C26", rgb: [60, 174, 216] },
        { name: "C27", rgb: [211, 223, 250] },
        { name: "C28", rgb: [187, 207, 237] },
        { name: "C29", rgb: [52, 72, 142] },
        { name: "C3", rgb: [160, 226, 251] },
        { name: "C4", rgb: [65, 204, 255] },
        { name: "C5", rgb: [1, 172, 235] },
        { name: "C6", rgb: [80, 170, 240] },
        { name: "C7", rgb: [54, 119, 210] },
        { name: "C8", rgb: [15, 84, 192] },
        { name: "C9", rgb: [50, 75, 202] },
        { name: "D1", rgb: [174, 180, 242] },
        { name: "D10", rgb: [54, 24, 81] },
        { name: "D11", rgb: [185, 186, 225] },
        { name: "D12", rgb: [222, 154, 212] },
        { name: "D13", rgb: [185, 0, 149] },
        { name: "D14", rgb: [139, 39, 155] },
        { name: "D15", rgb: [47, 31, 144] },
        { name: "D16", rgb: [227, 225, 238] },
        { name: "D17", rgb: [196, 212, 246] },
        { name: "D18", rgb: [164, 94, 199] },
        { name: "D19", rgb: [216, 195, 215] },
        { name: "D2", rgb: [133, 142, 221] },
        { name: "D20", rgb: [156, 50, 178] },
        { name: "D21", rgb: [154, 0, 155] },
        { name: "D22", rgb: [51, 58, 149] },
        { name: "D23", rgb: [235, 218, 252] },
        { name: "D24", rgb: [119, 134, 229] },
        { name: "D25", rgb: [73, 79, 199] },
        { name: "D26", rgb: [223, 194, 248] },
        { name: "D3", rgb: [47, 84, 175] },
        { name: "D4", rgb: [24, 42, 132] },
        { name: "D5", rgb: [184, 67, 197] },
        { name: "D6", rgb: [172, 123, 222] },
        { name: "D7", rgb: [136, 84, 179] },
        { name: "D8", rgb: [226, 211, 255] },
        { name: "D9", rgb: [213, 185, 248] },
        { name: "E1", rgb: [253, 211, 204] },
        { name: "E10", rgb: [211, 55, 147] },
        { name: "E11", rgb: [252, 221, 210] },
        { name: "E12", rgb: [247, 143, 195] },
        { name: "E13", rgb: [181, 0, 109] },
        { name: "E14", rgb: [255, 209, 186] },
        { name: "E15", rgb: [248, 199, 201] },
        { name: "E16", rgb: [255, 243, 235] },
        { name: "E17", rgb: [255, 226, 234] },
        { name: "E18", rgb: [255, 199, 219] },
        { name: "E19", rgb: [254, 186, 213] },
        { name: "E2", rgb: [254, 192, 223] },
        { name: "E20", rgb: [216, 199, 209] },
        { name: "E21", rgb: [189, 157, 161] },
        { name: "E22", rgb: [183, 133, 161] },
        { name: "E23", rgb: [147, 122, 141] },
        { name: "E24", rgb: [225, 188, 232] },
        { name: "E3", rgb: [255, 183, 231] },
        { name: "E4", rgb: [232, 100, 158] },
        { name: "E5", rgb: [245, 81, 162] },
        { name: "E6", rgb: [241, 61, 116] },
        { name: "E7", rgb: [198, 52, 120] },
        { name: "E8", rgb: [255, 219, 233] },
        { name: "E9", rgb: [233, 112, 204] },
        { name: "F1", rgb: [253, 149, 123] },
        { name: "F10", rgb: [138, 69, 38] },
        { name: "F11", rgb: [90, 33, 33] },
        { name: "F12", rgb: [253, 78, 106] },
        { name: "F13", rgb: [243, 87, 68] },
        { name: "F14", rgb: [255, 169, 173] },
        { name: "F15", rgb: [211, 0, 34] },
        { name: "F16", rgb: [254, 194, 166] },
        { name: "F17", rgb: [230, 156, 121] },
        { name: "F18", rgb: [211, 124, 70] },
        { name: "F19", rgb: [193, 68, 74] },
        { name: "F2", rgb: [252, 61, 70] },
        { name: "F20", rgb: [205, 147, 145] },
        { name: "F21", rgb: [247, 180, 198] },
        { name: "F22", rgb: [253, 192, 208] },
        { name: "F23", rgb: [246, 126, 102] },
        { name: "F24", rgb: [230, 152, 170] },
        { name: "F25", rgb: [229, 75, 79] },
        { name: "F3", rgb: [247, 73, 65] },
        { name: "F4", rgb: [252, 40, 60] },
        { name: "F5", rgb: [231, 0, 47] },
        { name: "F6", rgb: [148, 54, 48] },
        { name: "F7", rgb: [151, 25, 55] },
        { name: "F8", rgb: [188, 0, 40] },
        { name: "F9", rgb: [226, 103, 122] },
        { name: "G1", rgb: [255, 226, 206] },
        { name: "G10", rgb: [217, 140, 57] },
        { name: "G11", rgb: [224, 197, 147] },
        { name: "G12", rgb: [255, 200, 144] },
        { name: "G13", rgb: [183, 113, 74] },
        { name: "G14", rgb: [141, 97, 76] },
        { name: "G15", rgb: [252, 249, 224] },
        { name: "G16", rgb: [242, 217, 186] },
        { name: "G17", rgb: [120, 82, 75] },
        { name: "G18", rgb: [255, 228, 204] },
        { name: "G19", rgb: [224, 121, 53] },
        { name: "G2", rgb: [255, 196, 170] },
        { name: "G20", rgb: [169, 64, 35] },
        { name: "G21", rgb: [184, 133, 88] },
        { name: "G3", rgb: [244, 195, 165] },
        { name: "G4", rgb: [225, 179, 131] },
        { name: "G5", rgb: [237, 176, 69] },
        { name: "G6", rgb: [233, 156, 23] },
        { name: "G7", rgb: [157, 91, 62] },
        { name: "G8", rgb: [117, 56, 50] },
        { name: "G9", rgb: [230, 180, 131] },
        { name: "H1", rgb: [253, 251, 255] },
        { name: "H10", rgb: [238, 233, 234] },
        { name: "H11", rgb: [206, 205, 213] },
        { name: "H12", rgb: [255, 245, 237] },
        { name: "H13", rgb: [245, 236, 210] },
        { name: "H14", rgb: [207, 215, 211] },
        { name: "H15", rgb: [152, 166, 168] },
        { name: "H16", rgb: [29, 20, 20] },
        { name: "H17", rgb: [241, 237, 237] },
        { name: "H18", rgb: [255, 253, 240] },
        { name: "H19", rgb: [246, 239, 226] },
        { name: "H2", rgb: [254, 255, 255] },
        { name: "H20", rgb: [148, 159, 163] },
        { name: "H21", rgb: [255, 251, 225] },
        { name: "H22", rgb: [202, 202, 212] },
        { name: "H23", rgb: [154, 157, 148] },
        { name: "H3", rgb: [182, 177, 186] },
        { name: "H4", rgb: [137, 133, 140] },
        { name: "H5", rgb: [72, 70, 78] },
        { name: "H6", rgb: [47, 43, 47] },
        { name: "H7", rgb: [0, 0, 0] },
        { name: "H8", rgb: [231, 214, 219] },
        { name: "H9", rgb: [237, 237, 237] },
        { name: "M1", rgb: [188, 198, 184] },
        { name: "M10", rgb: [197, 178, 188] },
        { name: "M11", rgb: [159, 117, 148] },
        { name: "M12", rgb: [100, 71, 73] },
        { name: "M13", rgb: [209, 144, 102] },
        { name: "M14", rgb: [199, 115, 98] },
        { name: "M15", rgb: [117, 125, 120] },
        { name: "M2", rgb: [138, 163, 134] },
        { name: "M3", rgb: [105, 125, 128] },
        { name: "M4", rgb: [227, 210, 188] },
        { name: "M5", rgb: [208, 204, 170] },
        { name: "M6", rgb: [176, 167, 130] },
        { name: "M7", rgb: [180, 164, 151] },
        { name: "M8", rgb: [179, 130, 129] },
        { name: "M9", rgb: [165, 135, 103] },
        { name: "P1", rgb: [252, 247, 248] },
        { name: "P10", rgb: [217, 199, 234] },
        { name: "P11", rgb: [243, 236, 201] },
        { name: "P12", rgb: [230, 238, 242] },
        { name: "P13", rgb: [170, 203, 239] },
        { name: "P14", rgb: [51, 118, 128] },
        { name: "P15", rgb: [102, 133, 117] },
        { name: "P16", rgb: [254, 191, 69] },
        { name: "P17", rgb: [254, 163, 36] },
        { name: "P18", rgb: [254, 184, 159] },
        { name: "P19", rgb: [255, 254, 236] },
        { name: "P2", rgb: [176, 169, 172] },
        { name: "P20", rgb: [254, 190, 207] },
        { name: "P21", rgb: [236, 190, 191] },
        { name: "P22", rgb: [228, 168, 159] },
        { name: "P23", rgb: [165, 98, 104] },
        { name: "P3", rgb: [175, 220, 171] },
        { name: "P4", rgb: [254, 164, 159] },
        { name: "P5", rgb: [238, 140, 62] },
        { name: "P6", rgb: [95, 208, 167] },
        { name: "P7", rgb: [235, 146, 112] },
        { name: "P8", rgb: [240, 217, 88] },
        { name: "P9", rgb: [217, 217, 217] },
        { name: "Q1", rgb: [242, 165, 232] },
        { name: "Q2", rgb: [233, 236, 145] },
        { name: "Q3", rgb: [255, 255, 0] },
        { name: "Q4", rgb: [255, 235, 250] },
        { name: "Q5", rgb: [118, 206, 222] },
        { name: "R1", rgb: [213, 13, 33] },
        { name: "R10", rgb: [255, 219, 76] },
        { name: "R11", rgb: [255, 235, 250] },
        { name: "R12", rgb: [216, 213, 206] },
        { name: "R13", rgb: [85, 81, 76] },
        { name: "R14", rgb: [159, 228, 223] },
        { name: "R15", rgb: [119, 206, 233] },
        { name: "R16", rgb: [62, 207, 202] },
        { name: "R17", rgb: [74, 134, 122] },
        { name: "R18", rgb: [127, 205, 157] },
        { name: "R19", rgb: [205, 229, 93] },
        { name: "R2", rgb: [249, 47, 131] },
        { name: "R20", rgb: [232, 199, 180] },
        { name: "R21", rgb: [173, 111, 60] },
        { name: "R22", rgb: [108, 55, 47] },
        { name: "R23", rgb: [254, 184, 114] },
        { name: "R24", rgb: [243, 193, 192] },
        { name: "R25", rgb: [201, 103, 94] },
        { name: "R26", rgb: [210, 147, 190] },
        { name: "R27", rgb: [234, 140, 177] },
        { name: "R28", rgb: [156, 135, 214] },
        { name: "R3", rgb: [253, 131, 36] },
        { name: "R4", rgb: [248, 236, 49] },
        { name: "R5", rgb: [53, 199, 91] },
        { name: "R6", rgb: [35, 136, 145] },
        { name: "R7", rgb: [25, 119, 157] },
        { name: "R8", rgb: [26, 96, 195] },
        { name: "R9", rgb: [154, 86, 180] },
        { name: "T1", rgb: [255, 255, 255] },
        { name: "Y1", rgb: [253, 111, 180] },
        { name: "Y2", rgb: [254, 180, 129] },
        { name: "Y3", rgb: [215, 250, 160] },
        { name: "Y4", rgb: [139, 219, 250] },
        { name: "Y5", rgb: [233, 135, 234] },
        { name: "ZG1", rgb: [218, 171, 179] },
        { name: "ZG2", rgb: [214, 170, 135] },
        { name: "ZG3", rgb: [193, 189, 141] },
        { name: "ZG4", rgb: [150, 134, 159] },
        { name: "ZG5", rgb: [132, 144, 166] },
        { name: "ZG6", rgb: [148, 191, 226] },
        { name: "ZG7", rgb: [226, 169, 210] },
        { name: "ZG8", rgb: [171, 145, 192] }
    ],
    mard24: [
        { name: "A1", rgb: [250, 244, 200] },
        { name: "H7", rgb: [0, 0, 0] },
        { name: "F5", rgb: [231, 0, 47] },
        { name: "A10", rgb: [247, 124, 49] },
        { name: "A5", rgb: [244, 215, 56] },
        { name: "B5", rgb: [53, 227, 82] },
        { name: "C5", rgb: [1, 172, 235] },
        { name: "D5", rgb: [184, 67, 197] },
        { name: "E8", rgb: [255, 219, 233] },
        { name: "G7", rgb: [157, 91, 62] },
        { name: "C13", rgb: [205, 232, 255] },
        { name: "B13", rgb: [202, 235, 123] },
        { name: "C16", rgb: [21, 87, 168] },
        { name: "B15", rgb: [46, 81, 50] },
        { name: "H3", rgb: [182, 177, 186] },
        { name: "H17", rgb: [241, 237, 237] },
        { name: "E1", rgb: [253, 211, 204] },
        { name: "D13", rgb: [185, 0, 149] },
        { name: "Q1", rgb: [242, 165, 232] },
        { name: "F13", rgb: [243, 87, 68] },
        { name: "C2", rgb: [169, 249, 252] },
        { name: "B22", rgb: [11, 60, 67] },
        { name: "B19", rgb: [36, 184, 140] },
        { name: "A14", rgb: [253, 84, 61] }
    ],
    mard48: [
        { name: "T1", rgb: [255, 255, 255] },
        { name: "H7", rgb: [0, 0, 0] },
        { name: "R1", rgb: [213, 13, 33] },
        { name: "R3", rgb: [253, 131, 36] },
        { name: "A5", rgb: [244, 215, 56] },
        { name: "B5", rgb: [53, 227, 82] },
        { name: "C5", rgb: [1, 172, 235] },
        { name: "D5", rgb: [184, 67, 197] },
        { name: "Y1", rgb: [253, 111, 180] },
        { name: "G7", rgb: [157, 91, 62] },
        { name: "C13", rgb: [205, 232, 255] },
        { name: "B13", rgb: [202, 235, 123] },
        { name: "C16", rgb: [21, 87, 168] },
        { name: "B15", rgb: [46, 81, 50] },
        { name: "H3", rgb: [182, 177, 186] },
        { name: "H17", rgb: [241, 237, 237] },
        { name: "E1", rgb: [253, 211, 204] },
        { name: "D13", rgb: [185, 0, 149] },
        { name: "D15", rgb: [47, 31, 144] },
        { name: "Q1", rgb: [242, 165, 232] },
        { name: "F13", rgb: [243, 87, 68] },
        { name: "F5", rgb: [231, 0, 47] },
        { name: "C2", rgb: [169, 249, 252] },
        { name: "B19", rgb: [36, 184, 140] },
        { name: "R10", rgb: [255, 219, 76] },
        { name: "H16", rgb: [29, 20, 20] },
        { name: "R8", rgb: [26, 96, 195] },
        { name: "D3", rgb: [47, 84, 175] },
        { name: "R5", rgb: [53, 199, 91] },
        { name: "Y2", rgb: [254, 180, 129] },
        { name: "E5", rgb: [245, 81, 162] },
        { name: "G19", rgb: [224, 121, 53] },
        { name: "B8", rgb: [28, 156, 79] },
        { name: "C8", rgb: [15, 84, 192] },
        { name: "D18", rgb: [164, 94, 199] },
        { name: "E13", rgb: [181, 0, 109] },
        { name: "F15", rgb: [211, 0, 34] },
        { name: "A10", rgb: [247, 124, 49] },
        { name: "A14", rgb: [253, 84, 61] },
        { name: "Q5", rgb: [118, 206, 222] },
        { name: "Y4", rgb: [139, 219, 250] },
        { name: "Y3", rgb: [215, 250, 160] },
        { name: "R4", rgb: [248, 236, 49] },
        { name: "Q3", rgb: [255, 255, 0] },
        { name: "Q4", rgb: [255, 235, 250] },
        { name: "Y5", rgb: [233, 135, 234] },
        { name: "Q2", rgb: [233, 236, 145] }
    ],
    mard72: [],
    mard120: [],
    perler24: [
        { name: "白色", rgb: [255, 255, 255] },
        { name: "黑色", rgb: [0, 0, 0] },
        { name: "红色", rgb: [237, 28, 36] },
        { name: "橙色", rgb: [255, 127, 39] },
        { name: "黄色", rgb: [255, 242, 0] },
        { name: "绿色", rgb: [34, 177, 76] },
        { name: "蓝色", rgb: [0, 162, 232] },
        { name: "紫色", rgb: [163, 73, 164] },
        { name: "粉色", rgb: [255, 174, 201] },
        { name: "棕色", rgb: [109, 57, 20] },
        { name: "浅蓝", rgb: [153, 204, 255] },
        { name: "浅绿", rgb: [181, 230, 29] },
        { name: "深蓝", rgb: [0, 83, 155] },
        { name: "深绿", rgb: [0, 104, 55] },
        { name: "灰色", rgb: [128, 128, 128] },
        { name: "浅灰", rgb: [195, 195, 195] },
        { name: "肤色", rgb: [255, 219, 172] },
        { name: "紫罗兰", rgb: [144, 61, 145] },
        { name: "青柠", rgb: [210, 242, 0] },
        { name: "亮粉", rgb: [255, 0, 128] },
        { name: "珊瑚红", rgb: [255, 127, 80] },
        { name: "天蓝", rgb: [135, 206, 235] },
        { name: "橄榄绿", rgb: [128, 128, 0] },
        { name: "品红", rgb: [255, 0, 255] }
    ],
    perler48: [
        { name: "白色", rgb: [255, 255, 255] },
        { name: "黑色", rgb: [0, 0, 0] },
        { name: "红色", rgb: [237, 28, 36] },
        { name: "橙色", rgb: [255, 127, 39] },
        { name: "黄色", rgb: [255, 242, 0] },
        { name: "绿色", rgb: [34, 177, 76] },
        { name: "蓝色", rgb: [0, 162, 232] },
        { name: "紫色", rgb: [163, 73, 164] },
        { name: "粉色", rgb: [255, 174, 201] },
        { name: "棕色", rgb: [109, 57, 20] },
        { name: "浅蓝", rgb: [153, 204, 255] },
        { name: "浅绿", rgb: [181, 230, 29] },
        { name: "深蓝", rgb: [0, 83, 155] },
        { name: "深绿", rgb: [0, 104, 55] },
        { name: "灰色", rgb: [128, 128, 128] },
        { name: "浅灰", rgb: [195, 195, 195] },
        { name: "肤色", rgb: [255, 219, 172] },
        { name: "紫罗兰", rgb: [144, 61, 145] },
        { name: "青柠", rgb: [210, 242, 0] },
        { name: "亮粉", rgb: [255, 0, 128] },
        { name: "珊瑚红", rgb: [255, 127, 80] },
        { name: "天蓝", rgb: [135, 206, 235] },
        { name: "橄榄绿", rgb: [128, 128, 0] },
        { name: "品红", rgb: [255, 0, 255] },
        { name: "靛蓝", rgb: [75, 0, 130] },
        { name: "青绿色", rgb: [0, 255, 255] },
        { name: "金色", rgb: [255, 215, 0] },
        { name: "银色", rgb: [192, 192, 192] },
        { name: "青铜色", rgb: [205, 127, 50] },
        { name: "酒红", rgb: [128, 0, 0] },
        { name: "海军蓝", rgb: [0, 0, 128] },
        { name: "森林绿", rgb: [34, 139, 34] },
        { name: "薰衣草", rgb: [230, 230, 250] },
        { name: "桃色", rgb: [255, 218, 185] },
        { name: "薄荷绿", rgb: [152, 251, 152] },
        { name: "卡其色", rgb: [240, 230, 140] },
        { name: "橘黄", rgb: [255, 165, 0] },
        { name: "洋红", rgb: [255, 0, 128] },
        { name: "靛青", rgb: [0, 128, 128] },
        { name: "栗色", rgb: [128, 0, 0] },
        { name: "蓝绿色", rgb: [64, 224, 208] },
        { name: "深紫", rgb: [128, 0, 128] },
        { name: "橄榄", rgb: [85, 107, 47] },
        { name: "橙红", rgb: [255, 69, 0] },
        { name: "淡紫", rgb: [216, 191, 216] },
        { name: "鲑鱼色", rgb: [250, 128, 114] },
        { name: "海绿", rgb: [46, 139, 87] }
    ],
    perler72: [
        { name: "白色", rgb: [255, 255, 255] },
        { name: "黑色", rgb: [0, 0, 0] },
        { name: "红色", rgb: [237, 28, 36] },
        { name: "橙色", rgb: [255, 127, 39] },
        { name: "黄色", rgb: [255, 242, 0] },
        { name: "绿色", rgb: [34, 177, 76] },
        { name: "蓝色", rgb: [0, 162, 232] },
        { name: "紫色", rgb: [163, 73, 164] },
        { name: "粉色", rgb: [255, 174, 201] },
        { name: "棕色", rgb: [109, 57, 20] },
        { name: "浅蓝", rgb: [153, 204, 255] },
        { name: "浅绿", rgb: [181, 230, 29] },
        { name: "深蓝", rgb: [0, 83, 155] },
        { name: "深绿", rgb: [0, 104, 55] },
        { name: "灰色", rgb: [128, 128, 128] },
        { name: "浅灰", rgb: [195, 195, 195] },
        { name: "肤色", rgb: [255, 219, 172] },
        { name: "紫罗兰", rgb: [144, 61, 145] },
        { name: "青柠", rgb: [210, 242, 0] },
        { name: "亮粉", rgb: [255, 0, 128] },
        { name: "珊瑚红", rgb: [255, 127, 80] },
        { name: "天蓝", rgb: [135, 206, 235] },
        { name: "橄榄绿", rgb: [128, 128, 0] },
        { name: "品红", rgb: [255, 0, 255] },
        { name: "靛蓝", rgb: [75, 0, 130] },
        { name: "青绿色", rgb: [0, 255, 255] },
        { name: "金色", rgb: [255, 215, 0] },
        { name: "银色", rgb: [192, 192, 192] },
        { name: "青铜色", rgb: [205, 127, 50] },
        { name: "酒红", rgb: [128, 0, 0] },
        { name: "海军蓝", rgb: [0, 0, 128] },
        { name: "森林绿", rgb: [34, 139, 34] },
        { name: "薰衣草", rgb: [230, 230, 250] },
        { name: "桃色", rgb: [255, 218, 185] },
        { name: "薄荷绿", rgb: [152, 251, 152] },
        { name: "卡其色", rgb: [240, 230, 140] },
        { name: "橘黄", rgb: [255, 165, 0] },
        { name: "洋红", rgb: [255, 0, 128] },
        { name: "靛青", rgb: [0, 128, 128] },
        { name: "栗色", rgb: [128, 0, 0] },
        { name: "蓝绿色", rgb: [64, 224, 208] },
        { name: "深紫", rgb: [128, 0, 128] },
        { name: "橄榄", rgb: [85, 107, 47] },
        { name: "橙红", rgb: [255, 69, 0] },
        { name: "淡紫", rgb: [216, 191, 216] },
        { name: "鲑鱼色", rgb: [250, 128, 114] },
        { name: "海绿", rgb: [46, 139, 87] },
        { name: "褐红色", rgb: [178, 34, 34] },
        { name: "深红色", rgb: [139, 0, 0] },
        { name: "浅珊瑚", rgb: [240, 128, 128] },
        { name: "番茄红", rgb: [255, 99, 71] },
        { name: "深橙", rgb: [255, 140, 0] },
        { name: "金菊黄", rgb: [218, 165, 32] },
        { name: "暗黄色", rgb: [189, 183, 107] },
        { name: "橄榄绿2", rgb: [107, 142, 35] },
        { name: "酸橙绿", rgb: [50, 205, 50] },
        { name: "春绿色", rgb: [0, 255, 127] },
        { name: "蓝绿色2", rgb: [0, 139, 139] },
        { name: "深天蓝", rgb: [0, 191, 255] },
        { name: "中蓝", rgb: [0, 0, 205] },
        { name: "午夜蓝", rgb: [25, 25, 112] },
        { name: "暗紫色", rgb: [75, 0, 130] },
        { name: "中紫色", rgb: [147, 112, 219] },
        { name: "蓟色", rgb: [216, 191, 216] },
        { name: "李子色", rgb: [221, 160, 221] }
    ],
    hama: [
        { name: "白色", rgb: [255, 255, 255] },
        { name: "黑色", rgb: [0, 0, 0] },
        { name: "红色", rgb: [200, 30, 40] },
        { name: "橙色", rgb: [255, 130, 40] },
        { name: "黄色", rgb: [255, 245, 50] },
        { name: "绿色", rgb: [30, 180, 80] },
        { name: "蓝色", rgb: [0, 170, 240] },
        { name: "紫色", rgb: [150, 70, 160] },
        { name: "粉色", rgb: [255, 180, 205] },
        { name: "棕色", rgb: [100, 50, 20] }
    ]
};

class PixelArtGenerator {
    constructor() {
        this.originalImage = null;
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.perlerMode = false;
        this.colorCounts = {};
        
        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadSection = document.getElementById('uploadSection');
        this.workspace = document.getElementById('workspace');
        this.previewContainer = document.querySelector('.preview-container');
        
        this.originalCanvas = document.getElementById('originalCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d', { willReadFrequently: true });
        
        this.pixelatedCanvas = document.getElementById('pixelatedCanvas');
        this.pixelatedCtx = this.pixelatedCanvas.getContext('2d', { willReadFrequently: true });
        
        this.perlerCanvas = document.getElementById('perlerCanvas');
        this.perlerCtx = this.perlerCanvas.getContext('2d', { willReadFrequently: true });
        
        this.originalSize = document.getElementById('originalSize');
        this.pixelatedSize = document.getElementById('pixelatedSize');
        this.perlerSize = document.getElementById('perlerSize');
        
        this.pixelSizeSlider = document.getElementById('pixelSizeSlider');
        this.pixelSizeValue = document.getElementById('pixelSizeValue');
        
        this.widthInput = document.getElementById('widthInput');
        this.heightInput = document.getElementById('heightInput');
        this.keepRatioCheckbox = document.getElementById('keepRatioCheckbox');
        
        this.perlerModeCheckbox = document.getElementById('perlerModeCheckbox');
        this.perlerOptions = document.getElementById('perlerOptions');
        this.perlerPanel = document.getElementById('perlerPanel');
        this.colorSetSelect = document.getElementById('colorSetSelect');
        this.chartStyle = document.getElementById('chartStyle');
        
        this.clearBtn = document.getElementById('clearBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadPerlerBtn = document.getElementById('downloadPerlerBtn');
        
        this.presetBtns = document.querySelectorAll('.preset-btn');
    }

    initEventListeners() {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadImage(files[0]);
            }
        });
        
        this.pixelSizeSlider.addEventListener('input', () => {
            this.pixelSizeValue.textContent = this.pixelSizeSlider.value + 'px';
            this.updatePixelatedImage();
        });
        
        this.widthInput.addEventListener('input', () => {
            if (this.keepRatioCheckbox.checked && this.originalWidth > 0) {
                const ratio = this.originalHeight / this.originalWidth;
                this.heightInput.value = Math.round(this.widthInput.value * ratio);
            }
            this.updatePixelatedImage();
        });
        
        this.heightInput.addEventListener('input', () => {
            if (this.keepRatioCheckbox.checked && this.originalHeight > 0) {
                const ratio = this.originalWidth / this.originalHeight;
                this.widthInput.value = Math.round(this.heightInput.value * ratio);
            }
            this.updatePixelatedImage();
        });
        
        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const width = parseInt(btn.dataset.width);
                const height = parseInt(btn.dataset.height);
                this.widthInput.value = width;
                if (this.keepRatioCheckbox.checked && this.originalWidth > 0) {
                    const ratio = this.originalHeight / this.originalWidth;
                    this.heightInput.value = Math.round(width * ratio);
                } else {
                    this.heightInput.value = height;
                }
                this.updatePixelatedImage();
            });
        });
        
        this.perlerModeCheckbox.addEventListener('change', () => {
            this.perlerMode = this.perlerModeCheckbox.checked;
            if (this.perlerMode) {
                this.previewContainer.classList.add('has-perler');
                this.perlerOptions.style.display = 'block';
                this.perlerPanel.style.display = 'block';
                this.downloadPerlerBtn.style.display = 'block';
                this.showPerlerPlaceholder();
            } else {
                this.previewContainer.classList.remove('has-perler');
                this.perlerOptions.style.display = 'none';
                this.perlerPanel.style.display = 'none';
                this.downloadPerlerBtn.style.display = 'none';
            }
        });
        
        this.colorSetSelect.addEventListener('change', () => this.showPerlerPlaceholder());
        this.chartStyle.addEventListener('change', () => this.showPerlerPlaceholder());
        this.renderPerlerBtn = document.getElementById('renderPerlerBtn');
        this.renderPerlerBtn.addEventListener('click', () => this.updatePerlerChart());
        
        this.clearBtn.addEventListener('click', () => this.clear());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
        this.downloadPerlerBtn.addEventListener('click', () => this.downloadPerlerChart());
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadImage(file);
        }
    }

    loadImage(file) {
        if (!file.type.startsWith('image/')) {
            alert('请选择有效的图片文件！');
            return;
        }
        
        if (file.size > 20 * 1024 * 1024) {
            alert('文件大小不能超过 20MB！');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.originalWidth = img.width;
                this.originalHeight = img.height;
                this.showWorkspace();
                this.drawOriginalImage();
                this.resetInputs();
                this.updatePixelatedImage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    showWorkspace() {
        this.uploadSection.style.display = 'none';
        this.workspace.style.display = 'block';
    }

    drawOriginalImage() {
        this.originalCanvas.width = this.originalWidth;
        this.originalCanvas.height = this.originalHeight;
        this.originalCtx.drawImage(this.originalImage, 0, 0);
        this.originalSize.textContent = `原始尺寸: ${this.originalWidth} × ${this.originalHeight} px`;
    }

    resetInputs() {
        this.pixelSizeSlider.value = 16;
        this.pixelSizeValue.textContent = '16px';
        this.widthInput.value = Math.min(this.originalWidth, 512);
        this.heightInput.value = Math.round(Math.min(this.originalWidth, 512) * (this.originalHeight / this.originalWidth));
        this.keepRatioCheckbox.checked = true;
        this.perlerModeCheckbox.checked = false;
        this.previewContainer.classList.remove('has-perler');
        this.perlerOptions.style.display = 'none';
        this.perlerPanel.style.display = 'none';
        this.downloadPerlerBtn.style.display = 'none';
        this.perlerMode = false;
    }

    pixelate(imageData, blockSize) {
        const width = imageData.width;
        const height = imageData.height;
        const newData = new ImageData(width, height);
        
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                
                for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
                    for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
                        const index = ((y + dy) * width + (x + dx)) * 4;
                        r += imageData.data[index];
                        g += imageData.data[index + 1];
                        b += imageData.data[index + 2];
                        a += imageData.data[index + 3];
                        count++;
                    }
                }
                
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);
                a = Math.round(a / count);
                
                for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
                    for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
                        const index = ((y + dy) * width + (x + dx)) * 4;
                        newData.data[index] = r;
                        newData.data[index + 1] = g;
                        newData.data[index + 2] = b;
                        newData.data[index + 3] = a;
                    }
                }
            }
        }
        
        return newData;
    }

    rgbToXyz(r, g, b) {
        r = r / 255;
        g = g / 255;
        b = b / 255;
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        r *= 100;
        g *= 100;
        b *= 100;
        
        const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
        const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
        
        return [x, y, z];
    }

    xyzToLab(x, y, z) {
        x = x / 95.047;
        y = y / 100.000;
        z = z / 108.883;
        
        x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + (16/116);
        y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + (16/116);
        z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + (16/116);
        
        const l = (116 * y) - 16;
        const a = 500 * (x - y);
        const b = 200 * (y - z);
        
        return [l, a, b];
    }

    colorDistance(lab1, lab2) {
        const dl = lab1[0] - lab2[0];
        const da = lab1[1] - lab2[1];
        const db = lab1[2] - lab2[2];
        return Math.sqrt(dl * dl + da * da + db * db);
    }

    findClosestColor(rgb, colorSet) {
        const xyz1 = this.rgbToXyz(rgb[0], rgb[1], rgb[2]);
        const lab1 = this.xyzToLab(xyz1[0], xyz1[1], xyz1[2]);
        let closest = null;
        let minDistance = Infinity;
        
        for (const color of colorSet) {
            const xyz2 = this.rgbToXyz(color.rgb[0], color.rgb[1], color.rgb[2]);
            const lab2 = this.xyzToLab(xyz2[0], xyz2[1], xyz2[2]);
            const distance = this.colorDistance(lab1, lab2);
            
            if (distance < minDistance) {
                minDistance = distance;
                closest = color;
            }
        }
        
        return closest;
    }

    updatePixelatedImage() {
        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        tempCtx.drawImage(this.originalImage, 0, 0, targetWidth, targetHeight);
        
        const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        const pixelatedData = this.pixelate(imageData, pixelSize);
        
        this.pixelatedCanvas.width = targetWidth;
        this.pixelatedCanvas.height = targetHeight;
        this.pixelatedCtx.putImageData(pixelatedData, 0, 0);
        
        this.pixelatedSize.textContent = `像素化尺寸: ${targetWidth} × ${targetHeight} px`;
        
        if (this.perlerMode) {
            this.showPerlerPlaceholder();
        }
    }

    showPerlerPlaceholder() {
        this.perlerCtx.clearRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#f0f0f0';
        this.perlerCtx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#666';
        this.perlerCtx.font = '14px sans-serif';
        this.perlerCtx.textAlign = 'center';
        this.perlerCtx.fillText('点击"渲染拼豆图纸"按钮生成图纸', this.perlerCanvas.width / 2, this.perlerCanvas.height / 2);
        this.perlerSize.textContent = '拼豆尺寸: 等待渲染';
    }

    updatePerlerChart() {
        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        
        const perlerWidth = Math.ceil(targetWidth / pixelSize);
        const perlerHeight = Math.ceil(targetHeight / pixelSize);
        
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = perlerWidth;
        tempCanvas.height = perlerHeight;
        tempCtx.drawImage(this.originalImage, 0, 0, perlerWidth, perlerHeight);
        const imageData = tempCtx.getImageData(0, 0, perlerWidth, perlerHeight);
        
        this.colorCounts = {};
        const perlerColors = [];
        
        for (let y = 0; y < perlerHeight; y++) {
            const row = [];
            for (let x = 0; x < perlerWidth; x++) {
                const index = (y * perlerWidth + x) * 4;
                const r = imageData.data[index];
                const g = imageData.data[index + 1];
                const b = imageData.data[index + 2];
                const closestColor = this.findClosestColor([r, g, b], colorSet);
                row.push(closestColor);
                
                if (this.colorCounts[closestColor.name]) {
                    this.colorCounts[closestColor.name]++;
                } else {
                    this.colorCounts[closestColor.name] = 1;
                }
            }
            perlerColors.push(row);
        }
        
        this.drawPerlerChart(perlerColors, perlerWidth, perlerHeight, colorSetName);
        this.perlerSize.textContent = `拼豆尺寸: ${perlerWidth} × ${perlerHeight} 颗`;
    }

    drawPerlerChart(perlerColors, perlerWidth, perlerHeight, colorSetName) {
        const cellSize = 20;
        const coordSize = 30;
        const chartStyle = this.chartStyle.value;
        
        this.perlerCanvas.width = coordSize + perlerWidth * cellSize;
        this.perlerCanvas.height = coordSize + perlerHeight * cellSize;
        
        const ctx = this.perlerCtx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#333';
        
        for (let x = 0; x < perlerWidth; x++) {
            ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, coordSize / 2);
        }
        
        for (let y = 0; y < perlerHeight; y++) {
            ctx.fillText(y + 1, coordSize / 2, coordSize + y * cellSize + cellSize / 2);
        }
        
        for (let y = 0; y < perlerHeight; y++) {
            for (let x = 0; x < perlerWidth; x++) {
                const color = perlerColors[y][x];
                const px = coordSize + x * cellSize;
                const py = coordSize + y * cellSize;
                
                if (chartStyle === 'color') {
                    ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                    ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                    ctx.strokeStyle = '#999';
                    ctx.strokeRect(px, py, cellSize - 1, cellSize - 1);
                    ctx.fillStyle = '#333';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                }
            }
        }
        
        this.drawColorLegend();
    }

    drawColorLegend() {
        const legendCanvas = document.createElement('canvas');
        const legendCtx = legendCanvas.getContext('2d');
        const colorNames = Object.keys(this.colorCounts).sort();
        
        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        
        const columns = Math.min(4, Math.ceil(colorNames.length / 15));
        const itemsPerColumn = Math.ceil(colorNames.length / columns);
        const columnWidth = 200;
        const rectWidth = 150;
        const rectHeight = 28;
        
        legendCanvas.width = columns * columnWidth + 20;
        legendCanvas.height = 70 + itemsPerColumn * (rectHeight + 5);
        legendCtx.fillStyle = '#ffffff';
        legendCtx.fillRect(0, 0, legendCanvas.width, legendCanvas.height);
        
        legendCtx.font = 'bold 14px sans-serif';
        legendCtx.fillStyle = '#333';
        legendCtx.fillText('颜色统计:', 10, 25);
        
        legendCtx.font = 'bold 13px sans-serif';
        legendCtx.fillStyle = '#667eea';
        legendCtx.fillText(`总计: ${totalBeans} 颗拼豆`, 10, 45);
        
        let col = 0, row = 0;
        
        for (const name of colorNames) {
            const count = this.colorCounts[name];
            const colorSetName = this.colorSetSelect.value;
            const colorSet = colorSets[colorSetName];
            const color = colorSet.find(c => c.name === name);
            
            const x = 10 + col * columnWidth;
            const y = 65 + row * (rectHeight + 5);
            
            if (color) {
                legendCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                legendCtx.fillRect(x, y, rectWidth, rectHeight);
                legendCtx.strokeStyle = '#999';
                legendCtx.strokeRect(x, y, rectWidth, rectHeight);
                
                const r = color.rgb[0], g = color.rgb[1], b = color.rgb[2];
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                legendCtx.fillStyle = luminance > 0.5 ? '#000' : '#fff';
                legendCtx.font = 'bold 12px sans-serif';
                legendCtx.textAlign = 'center';
                legendCtx.textBaseline = 'middle';
                legendCtx.fillText(`${name} x ${count}`, x + rectWidth / 2, y + rectHeight / 2);
                legendCtx.textAlign = 'left';
                legendCtx.textBaseline = 'alphabetic';
            }
            
            row++;
            if (row >= itemsPerColumn) {
                row = 0;
                col++;
            }
        }
        
        const existingLegend = document.getElementById('colorLegend');
        if (existingLegend) {
            existingLegend.remove();
        }
        
        const legendDiv = document.createElement('div');
        legendDiv.id = 'colorLegend';
        legendDiv.style.marginTop = '20px';
        legendDiv.style.padding = '15px';
        legendDiv.style.background = '#f8f9fa';
        legendDiv.style.borderRadius = '8px';
        legendDiv.appendChild(legendCanvas);
        this.perlerPanel.appendChild(legendDiv);
    }

    clear() {
        this.originalImage = null;
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.perlerMode = false;
        this.colorCounts = {};
        
        this.uploadSection.style.display = 'block';
        this.workspace.style.display = 'none';
        
        const existingLegend = document.getElementById('colorLegend');
        if (existingLegend) {
            existingLegend.remove();
        }
    }

    reset() {
        this.resetInputs();
        this.drawOriginalImage();
        this.updatePixelatedImage();
        
        const existingLegend = document.getElementById('colorLegend');
        if (existingLegend) {
            existingLegend.remove();
        }
    }

    downloadImage() {
        const link = document.createElement('a');
        link.download = 'pixelated-image.png';
        link.href = this.pixelatedCanvas.toDataURL('image/png');
        link.click();
    }

    downloadPerlerChart() {
        const perlerWidth = parseInt(this.widthInput.value) / parseInt(this.pixelSizeSlider.value);
        const perlerHeight = parseInt(this.heightInput.value) / parseInt(this.pixelSizeSlider.value);
        
        const cellSize = 20;
        const coordSize = 30;
        const colorNames = Object.keys(this.colorCounts).sort();
        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        
        const columns = Math.min(4, Math.ceil(colorNames.length / 15));
        const itemsPerColumn = Math.ceil(colorNames.length / columns);
        const columnWidth = 200;
        const legendHeight = 80 + itemsPerColumn * 30;
        
        const canvasWidth = Math.max(coordSize + Math.ceil(perlerWidth) * cellSize, columns * columnWidth + 40);
        const canvasHeight = coordSize + Math.ceil(perlerHeight) * cellSize + legendHeight + 40;
        
        const downloadCanvas = document.createElement('canvas');
        const downloadCtx = downloadCanvas.getContext('2d');
        downloadCanvas.width = canvasWidth;
        downloadCanvas.height = canvasHeight;
        
        downloadCtx.fillStyle = '#ffffff';
        downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);
        
        downloadCtx.drawImage(this.perlerCanvas, 0, 0);
        
        const legendY = this.perlerCanvas.height + 20;
        
        downloadCtx.font = 'bold 16px sans-serif';
        downloadCtx.fillStyle = '#333';
        downloadCtx.fillText('颜色统计:', 20, legendY + 25);
        
        downloadCtx.font = 'bold 15px sans-serif';
        downloadCtx.fillStyle = '#667eea';
        downloadCtx.fillText(`总计: ${totalBeans} 颗拼豆`, 20, legendY + 50);
        
        downloadCtx.font = '14px sans-serif';
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        
        let col = 0, row = 0;
        
        for (const name of colorNames) {
            const count = this.colorCounts[name];
            const color = colorSet.find(c => c.name === name);
            
            const x = 20 + col * columnWidth;
            const y = legendY + 75 + row * 30;
            
            if (color) {
                downloadCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                downloadCtx.fillRect(x, y - 12, 24, 24);
                downloadCtx.strokeStyle = '#999';
                downloadCtx.strokeRect(x, y - 12, 24, 24);
            }
            
            downloadCtx.fillStyle = '#333';
            downloadCtx.fillText(`${name} (${count})`, x + 34, y + 5);
            
            row++;
            if (row >= itemsPerColumn) {
                row = 0;
                col++;
            }
        }
        
        const link = document.createElement('a');
        link.download = 'perler-chart.png';
        link.href = downloadCanvas.toDataURL('image/png');
        link.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PixelArtGenerator();
});