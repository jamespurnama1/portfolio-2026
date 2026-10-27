varying vec2 v_uv;
uniform sampler2D u_texture;
// Packed uniforms — reduces gl.uniform*() calls from 14→5 per card.
// On Safari, each WebGL API call goes through WebKit’s validation layer to Metal.
// Packing cuts ~9 calls/card/frame × 5 visible cards = 45 fewer calls (~11ms saved).
// xy = current mouse,  zw = previous mouse
uniform vec4 u_mouse4;
// x = textureAspect,  y = planeAspect,  z = scale,  w = opacity
uniform vec4 u_params1;
// x = aberrationIntensity,  y = textureZoom,  z = textureRotation,  w = coverTexture (0.0 or 1.0)
uniform vec4 u_params2;
// x = inverted (0.0/1.0),  y = applyOutputColorSpace (0.0/1.0),  z = invertAfterOutputColorSpace (0.0/1.0)
uniform vec3 u_flags;

void main() {
    vec2 newUV = v_uv - vec2(0.5);

    // Apply texture rotation first
    float cosRot = cos(u_params2.z);
    float sinRot = sin(u_params2.z);
    vec2 rotatedUV = vec2(
        newUV.x * cosRot - newUV.y * sinRot,
        newUV.x * sinRot + newUV.y * cosRot
    );

    rotatedUV /= u_params2.y; // textureZoom

    // Branchless cover/fit aspect correction.
    float pa = u_params1.y; // planeAspect
    float ta = u_params1.x; // textureAspect
    vec2 coverScale = vec2(min(1.0, pa / ta), min(1.0, ta / pa));
    vec2 fitScale   = vec2(min(1.0, ta / pa), min(1.0, pa / ta));
    rotatedUV *= mix(fitScale, coverScale, u_params2.w); // coverTexture already 0.0 or 1.0

    rotatedUV /= u_params1.z; // scale
    rotatedUV += vec2(0.5);

    vec2 gridUV = floor(rotatedUV * 20.0) / 20.0;
    vec2 centerOfPixel = gridUV + vec2(0.05);

    vec2 mouseDirection = u_mouse4.xy - u_mouse4.zw;

    vec2 pixelToMouseDirection = centerOfPixel - u_mouse4.xy;
    float pixelDistanceToMouse = length(pixelToMouseDirection);
    float strength = smoothstep(0.3, 0.0, pixelDistanceToMouse);

    vec2 uv = rotatedUV - strength * -mouseDirection * 0.2;

    vec4 colorR, colorG, colorB;
    colorG = texture2D(u_texture, uv);
    if (u_params2.x > 0.001) { // aberrationIntensity
        float offset = strength * u_params2.x * 0.01;
        colorR = texture2D(u_texture, uv + vec2(offset, 0.0));
        colorB = texture2D(u_texture, uv - vec2(offset, 0.0));
    } else {
        colorR = colorG;
        colorB = colorG;
    }

    float alpha = colorG.a * u_params1.w; // opacity

    vec3 col = vec3(colorR.r, colorG.g, colorB.b);
    col = mix(col, 1.0 - col, u_flags.x); // inverted (0.0 or 1.0)
    vec4 image = vec4(col, alpha);

    gl_FragColor = image;
    if (u_flags.y > 0.5) { // applyOutputColorSpace
        #include <colorspace_fragment>
    }
    if (u_flags.z > 0.5) { // invertAfterOutputColorSpace
        gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
    }
}

