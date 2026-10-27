varying vec2 v_uv;
// Packed uniforms — reduces gl.uniform*() calls from 6→2 per card.
// x = bendAmplitude,  y = bendStrength,  z = rotation,  w = enableRoll (0.0 or 1.0)
uniform vec4 u_bend;
// xy = screen position,  zw = screen center
uniform vec4 u_screen;

void main () {
  vec3 transformed = position;

  // Calculate distance from card to screen center (vertical)
  float distanceFromCenter = u_screen.y - u_screen.w;
  // Normalize to -1 to 1 range based on a reasonable screen height
  float normalizedDistance = abs(distanceFromCenter) > 0.1 ? distanceFromCenter / 500.0 : 0.0;

  // Create parabolic curve: edges forward, center back
  float bendOffset = (uv.y - 0.5) * 2.0; // -1 to 1
  transformed.z -= u_bend.x * (1.0 - bendOffset * bendOffset) * u_bend.y;

  // Apply tilt based on distance from viewport center
  float clampedDistance = clamp(normalizedDistance, -1.0, 1.0);
  float tiltAngle = -clampedDistance * (u_bend.x / 50.0) * 1.5;
  float cosTilt = cos(tiltAngle);
  float sinTilt = sin(tiltAngle);
  float newY = transformed.y * cosTilt + transformed.z * sinTilt;
  float newZ = -transformed.y * sinTilt + transformed.z * cosTilt;
  transformed.y = newY;
  transformed.z = newZ;

  // Apply rotation around Z-axis (roll), only if enabled (works page only)
  if (u_bend.w > 0.5) { // enableRoll
    float rotationAngle = -u_bend.z * (u_bend.x / 50.0);
    float cosR = cos(rotationAngle);
    float sinR = sin(rotationAngle);
    float newX = transformed.x * cosR - transformed.y * sinR;
    newY = transformed.x * sinR + transformed.y * cosR;
    transformed.x = newX;
    transformed.y = newY;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  v_uv = uv;
}

