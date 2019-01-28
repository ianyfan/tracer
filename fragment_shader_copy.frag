#version 300 es
precision mediump float;

uniform vec2 resolution;

uniform sampler2D depth;
uniform sampler2D direct;
uniform sampler2D indirect;
uniform sampler2D motion;
uniform sampler2D quad_id;

layout(location = 0) out vec4 out_direct;
layout(location = 1) out vec4 out_indirect;
layout(location = 2) out vec4 out_motion;
layout(location = 3) out vec4 out_quad_id;

void main() {
	gl_FragDepth = texture(depth, gl_FragCoord.xy / resolution).x;
	out_direct = texture(direct, gl_FragCoord.xy / resolution);
	out_indirect = texture(indirect, gl_FragCoord.xy / resolution);
	out_motion = texture(motion, gl_FragCoord.xy / resolution);
	out_quad_id = texture(quad_id, gl_FragCoord.xy / resolution);
}
