#version 300 es
precision mediump float;

uniform vec2 resolution;

uniform sampler2D depth; // TODO remove
uniform sampler2D direct;
uniform sampler2D indirect;
uniform sampler2D quad_id; // TODO remove

out vec4 out_color;

void main() {
	// gamma correct
	const float gamma = 2.2;
	vec3 color = (texture(direct, gl_FragCoord.xy / resolution) + texture(indirect, gl_FragCoord.xy / resolution)).rgb;
	color = pow(color, vec3(1.0 / gamma));
	out_color = vec4(color, 1.0);
}
