// Passthrough blit — used for the final screen composite.
// No noise ALU here: the persistence/distortion already happened in Pass 1.
// Replacing the noise shader for Pass 2 halves fragment shader invocations.
uniform sampler2D sampler;
varying vec2 v_uv;
void main() {
    gl_FragColor = texture2D(sampler, v_uv);
}
