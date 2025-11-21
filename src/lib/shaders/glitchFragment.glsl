varying vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_mouse;
uniform vec2 u_prevMouse;
uniform float u_aberrationIntensity;
uniform float textureAspect;
uniform float planeAspect;
uniform float scale;
uniform float opacity;
uniform bool inverted;

vec3 linearToSRGB(vec3 linear) {
    // Create a boolean condition based on component-wise comparison
    // No need to store in a vec3; use the condition directly in the mix
    vec3 result = mix(
        linear * 12.92, 
        pow(linear, vec3(1.0 / 2.4)) * 1.055 - 0.055, 
        step(0.0031308, linear) // Use step to determine which path to take
    );

    return result;
}

void main() {
    vec2 newUV = v_uv - vec2(0.5);

    // Classic aspect ratio correction: fit shorter side, preserve proportions
    if (planeAspect > textureAspect) {
        // Plane is wider than texture: fit height
        newUV = newUV * vec2(textureAspect / planeAspect, 1.0);
    } else {
        // Plane is taller than texture: fit width
        newUV = newUV * vec2(1.0, planeAspect / textureAspect);
    }
    newUV /= scale;
    newUV += vec2(0.5);

    // Use aspect ratio correction only, no clamping
    vec2 gridUV = floor(newUV * vec2(20.0, 20.0)) / vec2(20.0, 20.0);
    vec2 centerOfPixel = gridUV + vec2(1.0 / 20.0, 1.0 / 20.0);
    
    vec2 mouseDirection = u_mouse - u_prevMouse;
    
    vec2 pixelToMouseDirection = centerOfPixel - u_mouse;
    float pixelDistanceToMouse = length(pixelToMouseDirection);
    float strength = smoothstep(0.3, 0.0, pixelDistanceToMouse);

    vec2 uvOffset = strength * -mouseDirection * 0.2;
    vec2 uv = newUV - uvOffset;

    vec4 colorR = texture2D(u_texture, uv + vec2(strength * u_aberrationIntensity * 0.01, 0.0));
    vec4 colorG = texture2D(u_texture, uv);
    vec4 colorB = texture2D(u_texture, uv - vec2(strength * u_aberrationIntensity * 0.01, 0.0));

    // Use the texture's alpha channel, multiplied by the opacity uniform
    float alpha = colorG.a * opacity;
    
    // Correctly calculate the linear color
    vec4 image;
    if (inverted) {
        image = vec4(1.0 - colorR.r, 1.0 - colorG.g, 1.0 - colorB.b, alpha);
    } else {
        image = vec4(colorR.r, colorG.g, colorB.b, alpha);
    }

    // Debug border: show red border if outside [-0.5,0.5] after aspect correction
    // if (abs(newUV.x - 0.5) > 0.49 || abs(newUV.y - 0.5) > 0.49) {
    //     image.rgb = vec3(1.0, 0.0, 0.0);
    //     image.a = 1.0;
    // }

    gl_FragColor = image;
}
