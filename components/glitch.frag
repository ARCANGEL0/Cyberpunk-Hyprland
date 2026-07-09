#version 300 es

precision mediump float;
in vec2 v_texcoord;
uniform sampler2D tex;
uniform float u_time;       // animation progress 0.0 to 1.0
uniform float u_seed;       // random seed
out vec4 fragColor;

// Pseudo-random
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float rand(float x) {
    return fract(sin(x * 12.9898) * 43758.5453);
}

void main() {
    vec2 uv = v_texcoord;
    float t = u_time;
    float s = u_seed;
    
    // Envelope: quick ramp up, sustain, fade out
    float env;
    if (t < 0.06) env = t / 0.06;
    else if (t < 0.6) env = 1.0;
    else env = 1.0 - (t - 0.6) / 0.4;
    
    if (env <= 0.0) {
        fragColor = texture(tex, uv);
        return;
    }
    
    vec4 color = texture(tex, uv);
    float alpha = env;
    
    // ──────────────────────────────────
    // HORIZONTAL SCAN LINES (CRT style)
    // ──────────────────────────────────
    float scanLine = sin(uv.y * 800.0) * 0.5 + 0.5;
    scanLine = smoothstep(0.48, 0.52, scanLine);
    float scanIntensity = scanLine * 0.12 * alpha;
    
    // Color the scan lines: alternate between magenta-purple and cyan
    float scanColorRand = rand(floor(uv.y * 400.0) * 17.0 + s);
    vec3 scanColor;
    if (scanColorRand < 0.5) {
        scanColor = vec3(0.74, 0.0, 0.59); // magenta-purple
    } else {
        scanColor = vec3(0.0, 0.0, 0.78); // cyan-blue
    }
    color.rgb = mix(color.rgb, color.rgb + scanColor, scanIntensity);
    
    // ──────────────────────────────────
    // HORIZONTAL SCAN LINE BANDS (groups of bright lines)
    // ──────────────────────────────────
    float bandY = rand(s + 7.0);
    float bandPos = bandY;
    float bandWidth = 0.02 + rand(s + 11.0) * 0.05;
    float bandDist = abs(uv.y - bandPos);
    if (bandDist < bandWidth) {
        float bandAlpha = (1.0 - bandDist / bandWidth) * 0.3 * alpha;
        float bandColorRand = rand(s + 13.0);
        vec3 bandColor;
        if (bandColorRand < 0.35) bandColor = vec3(0.74, 0.0, 0.59);
        else if (bandColorRand < 0.65) bandColor = vec3(1.0, 0.27, 0.03);
        else bandColor = vec3(0.0, 0.0, 0.78);
        color.rgb = mix(color.rgb, bandColor, bandAlpha);
    }
    
    // ──────────────────────────────────
    // VERTICAL STREAKS (magenta/cyan/red/orange)
    // ──────────────────────────────────
    for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float vx = rand(s * 17.0 + fi * 31.0);
        float vw = 0.001 + rand(s * 19.0 + fi * 37.0) * 0.003;
        float vDist = abs(uv.x - vx);
        if (vDist < vw) {
            float vAlpha = (1.0 - vDist / vw) * 0.5 * alpha;
            float vColorRand = rand(s * 23.0 + fi * 41.0);
            vec3 vColor;
            if (vColorRand < 0.3) vColor = vec3(0.74, 0.0, 0.59);
            else if (vColorRand < 0.5) vColor = vec3(0.59, 0.0, 0.09);
            else if (vColorRand < 0.65) vColor = vec3(0.8, 0.2, 0.0);
            else if (vColorRand < 0.8) vColor = vec3(0.0, 0.6, 0.7);
            else vColor = vec3(1.0, 0.8, 0.2);
            color.rgb = mix(color.rgb, vColor, vAlpha);
        }
    }
    
    // ──────────────────────────────────
    // DIAGONAL TEAR LINES
    // ──────────────────────────────────
    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float angle = (rand(s * 47.0 + fi * 59.0) - 0.5) * 1.2;
        float dPos = rand(s * 53.0 + fi * 61.0);
        float dLength = 0.2 + rand(s * 59.0 + fi * 67.0) * 0.4;
        float dThick = 0.002 + rand(s * 61.0 + fi * 71.0) * 0.005;
        
        // Distance to the diagonal line
        float rotU = uv.x * cos(angle) + uv.y * sin(angle);
        float rotV = -uv.x * sin(angle) + uv.y * cos(angle);
        float lineCenter = dPos;
        float lineStart = rand(s * 67.0 + fi * 73.0) * 0.5;
        
        if (rotU > lineStart && rotU < lineStart + dLength) {
            float dDist = abs(rotV - lineCenter);
            if (dDist < dThick) {
                float dAlpha = (1.0 - dDist / dThick) * 0.4 * alpha;
                float dColorRand = rand(s * 71.0 + fi * 79.0);
                vec3 dColor;
                if (dColorRand < 0.4) dColor = vec3(0.6, 0.0, 0.4);
                else if (dColorRand < 0.7) dColor = vec3(0.0, 0.5, 0.6);
                else dColor = vec3(1.0, 0.7, 0.3);
                color.rgb = mix(color.rgb, dColor, dAlpha);
            }
        }
    }
    
    // ──────────────────────────────────
    // DISTORTION BLOCKS (screen tearing / displacement)
    // ──────────────────────────────────
    float blockY = rand(s * 79.0);
    float blockH = 0.01 + rand(s * 83.0) * 0.03;
    float blockDist = abs(uv.y - blockY);
    if (blockDist < blockH / 2.0) {
        float blockAlpha = (1.0 - blockDist / (blockH / 2.0)) * 0.6 * alpha;
        float blockType = rand(s * 89.0);
        
        if (blockType < 0.4) {
            // Displace UV horizontally
            float disp = (rand(s * 97.0) - 0.5) * 0.08 * alpha;
            vec2 dispUV = vec2(uv.x + disp, uv.y);
            dispUV = clamp(dispUV, vec2(0.0), vec2(1.0));
            vec4 dispColor = texture(tex, dispUV);
            color.rgb = mix(color.rgb, dispColor.rgb, blockAlpha);
        } else if (blockType < 0.7) {
            // Red block
            color.rgb = mix(color.rgb, vec3(1.0, 0.15, 0.02), blockAlpha);
        } else {
            // Cyan block
            color.rgb = mix(color.rgb, vec3(0.0, 0.7, 0.8), blockAlpha);
        }
    }
    
    // ──────────────────────────────────
    // CHROMATIC ABERRATION (color channel split)
    // ──────────────────────────────────
    float aberration = (rand(s * 999.0) - 0.5) * 0.015 * alpha;
    float rOffset = aberration;
    float bOffset = -aberration * 0.7;
    vec4 rChannel = texture(tex, clamp(uv + vec2(rOffset, 0.0), vec2(0.0), vec2(1.0)));
    vec4 bChannel = texture(tex, clamp(uv + vec2(bOffset, 0.0), vec2(0.0), vec2(1.0)));
    float origR = color.r;
    float origB = color.b;
    color.r = mix(origR, rChannel.r, 0.5 * alpha);
    color.b = mix(origB, bChannel.b, 0.5 * alpha);
    
    // ──────────────────────────────────
    // NOISE PIXELS (scattered colored pixels)
    // ──────────────────────────────────
    vec2 pixelGrid = floor(uv * 200.0);
    float pixelRand = rand(pixelGrid + s * 101.0);
    if (pixelRand < 0.15) {
        float pixelAlpha = (0.2 + rand(pixelGrid + s * 103.0) * 0.6) * alpha;
        vec3 pixelColor;
        float pcr = rand(pixelGrid + s * 107.0);
        if (pcr < 0.3) pixelColor = vec3(0.74, 0.0, 0.59);
        else if (pcr < 0.5) pixelColor = vec3(0.8, 0.1, 0.02);
        else if (pcr < 0.65) pixelColor = vec3(0.0, 0.6, 0.7);
        else if (pcr < 0.8) pixelColor = vec3(1.0, 0.6, 0.2);
        else if (pcr < 0.9) pixelColor = vec3(1.0, 1.0, 1.0);
        else pixelColor = vec3(0.6, 0.0, 0.4);
        color.rgb = mix(color.rgb, pixelColor, pixelAlpha);
    }
    
    // ──────────────────────────────────
    // WHITE FLASH at peak
    // ──────────────────────────────────
    if (t > 0.03 && t < 0.12) {
        float flashA = (1.0 - (t - 0.03) / 0.09) * 0.08 * alpha;
        color.rgb = mix(color.rgb, vec3(1.0), flashA);
    }
    
    fragColor = color;
}
