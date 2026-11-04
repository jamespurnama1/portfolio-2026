uniform sampler2D sampler;
uniform float time;
uniform vec2 mousePos;
uniform float noiseFactor;
uniform float noiseScale;
uniform float rgbPersistFactor;
uniform float alphaPersistFactor;

varying vec2 v_uv;

// 2D value noise — time is encoded as a UV offset rather than a 3rd dimension.
// 3D version required 8 hash calls + 7 mixes per sample (×2 samples = 16/14).
// 2D version: 4 hash calls + 3 mixes per sample (×2 samples = 8/6). ~50% cheaper.
// Only fract + multiply + dot: single-cycle Metal ALU ops.
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float fastNoise2D(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i),            hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y) * 2.0 - 1.0;
}

void main() {
    float t = time * 0.1;
    vec2 base = v_uv * noiseFactor;
    float a = fastNoise2D(base + vec2(0.0, t)) * noiseScale;
    float b = fastNoise2D(base + vec2(100.0, t)) * noiseScale;

    vec4 trails = texture2D(sampler, v_uv + vec2(a, b) + mousePos * 0.005);

    // The 1/255 bias stops 8-bit rounding from freezing faint trails at a non-zero value (stuck ghost on iOS).
    vec3 fadedRgb = max(trails.rgb * rgbPersistFactor - 1.0 / 255.0, 0.0);
    float fadedAlpha = max(trails.a * alphaPersistFactor - 1.0 / 255.0, 0.0);
    gl_FragColor = vec4(fadedRgb, fadedAlpha);
}
