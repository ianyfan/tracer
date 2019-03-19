#version 300 es
precision mediump float;

uniform vec2 resolution_inverse;

uniform sampler2D direct;
uniform sampler2D indirect;

out vec4 out_color;

void main() {
	// gamma compress
	const float gamma = 1.0 / 2.2;
	vec2 position = gl_FragCoord.xy * resolution_inverse;
	vec4 color = texture(direct, position) + texture(indirect, position);
	out_color = pow(color, vec4(vec3(gamma), 0.0));
}
