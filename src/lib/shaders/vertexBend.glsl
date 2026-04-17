varying vec2 v_uv;
uniform float uBendAmplitude;
uniform float uBendStrength;
uniform float uRotation;
uniform bool uEnableRoll;      // Whether to apply roll rotation
uniform vec2 uScreenPosition; // Card position in screen space
uniform vec2 uScreenCenter;   // Center of the screen

void main () {
  vec3 transformed = position;
  
  // Calculate distance from card to screen center (vertical)
  float distanceFromCenter = uScreenPosition.y - uScreenCenter.y;
  // Normalize to -1 to 1 range based on a reasonable screen height
  // Use a fixed value that represents half viewport height in world units
  float normalizedDistance = abs(distanceFromCenter) > 0.1 ? distanceFromCenter / 500.0 : 0.0;
  
  // Create parabolic curve: edges forward, center back
  float bendOffset = (uv.y - 0.5) * 2.0; // -1 to 1
  transformed.z -= uBendAmplitude * (1.0 - bendOffset * bendOffset) * uBendStrength;
  
  // Apply tilt based on distance from viewport center
  // Determine if card is in top half (positive distanceFromCenter) or bottom half (negative)
  // Top half: tilt down (negative angle)
  // Bottom half: tilt up (positive angle)
  float clampedDistance = clamp(normalizedDistance, -1.0, 1.0);
  float tiltAngle = -clampedDistance * (uBendAmplitude / 50.0) * 1.5; // Increased from 0.5 to 1.5
  float cosTilt = cos(tiltAngle);
  float sinTilt = sin(tiltAngle);
  float newY = transformed.y * cosTilt + transformed.z * sinTilt;
  float newZ = -transformed.y * sinTilt + transformed.z * cosTilt;
  transformed.y = newY;
  transformed.z = newZ;
  
  // Apply rotation around Z-axis (roll), only if enabled (works page only)
  if (uEnableRoll) {
    float rotationAngle = -uRotation * (uBendAmplitude / 50.0);
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
