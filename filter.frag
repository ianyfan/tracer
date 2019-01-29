#version 300 es
precision mediump float;

uniform vec2 resolution;
uniform vec2 resolution_inverse;

uniform sampler2D tracer_direct;
uniform sampler2D tracer_indirect;
uniform sampler2D tracer_mesh_id;
uniform sampler2D tracer_normal;
uniform sampler2D tracer_motion;
uniform sampler2D tracer_depth;

uniform sampler2D prev_history;
uniform sampler2D prev_direct;
uniform sampler2D prev_indirect;
uniform sampler2D prev_mesh_id;
uniform sampler2D prev_normal;
uniform sampler2D prev_moment;
uniform sampler2D prev_depth;

layout(location = 0) out vec4 out_history;
layout(location = 1) out vec4 out_color_direct;
layout(location = 2) out vec4 out_color_indirect;
layout(location = 3) out vec4 out_mesh_id;
layout(location = 4) out vec4 out_normal;
layout(location = 5) out vec4 out_moment;

bool close(float m, float n) {
	return abs(m - n) < 0.01;
}

bool test_prev(vec2 FragCoord) {
	if (any(lessThan(FragCoord, vec2(0.0))) || any(greaterThanEqual(FragCoord, resolution))) return false;
	return true;

	vec2 position = FragCoord * resolution_inverse;
	return close(out_mesh_id.x,  texture(prev_mesh_id, position).x)
		&& close(gl_FragDepth, texture(prev_depth, position).x);
}

bool find_close(inout vec2 prev_FragCoord) {
	if (test_prev(prev_FragCoord)) return true;
	vec2 two_filter[] = vec2[](
		vec2(-1.0, -1.0), vec2(-1.0, 0.0), vec2(-1.0, 1.0),
		vec2(0.0, -1.0), vec2(0.0, 1.0),
		vec2(1.0, -1.0), vec2(1.0, 0.0), vec2(1.0, 1.0));
	for (int i = 0; i < two_filter.length(); ++i) {
		vec2 test_FragCoord = prev_FragCoord + two_filter[i];
		if (test_prev(test_FragCoord)) {
			prev_FragCoord = test_FragCoord;
			return true;
		}
	}
	vec2 three_filter[] = vec2[](
		vec2(-2.0, -2.0), vec2(-2.0, -1.0), vec2(-2.0, 0.0), vec2(-2.0, 1.0), vec2(-2.0, 2.0),
		vec2(-1.0, -2.0), vec2(-1.0, 2.0),
		vec2(0.0, -2.0), vec2(0.0, 2.0),
		vec2(1.0, -2.0), vec2(1.0, 2.0),
		vec2(2.0, -2.0), vec2(2.0, -1.0), vec2(2.0, 0.0), vec2(2.0, 1.0), vec2(2.0, 2.0));
	for (int i = 0; i < three_filter.length(); ++i) {
		vec2 test_FragCoord = prev_FragCoord + three_filter[i];
		if (test_prev(test_FragCoord)) {
			prev_FragCoord = test_FragCoord;
			return true;
		}
	}
	return false;
}

void main() {
	vec2 position = gl_FragCoord.xy * resolution_inverse;

	// pass through geometry buffers
	out_mesh_id = texture(tracer_mesh_id, position);
	out_normal = texture(tracer_normal, position);
	gl_FragDepth = texture(tracer_depth, position).x;

	vec4 color_direct = texture(tracer_direct, position);
	vec4 color_indirect = texture(tracer_indirect, position);

	vec2 prev_FragCoord = (gl_FragCoord + texture(tracer_motion, position)).xy;
	if (find_close(prev_FragCoord)) {
		vec4 prev_color_direct = texture(prev_direct, prev_FragCoord / resolution);
		vec4 prev_color_indirect = texture(prev_indirect, prev_FragCoord / resolution);

		const float fade = 0.2;
		color_direct = mix(prev_color_direct, color_direct, fade);
		color_indirect = mix(prev_color_indirect, color_indirect, fade);
	} else {
	}

	out_color_direct = color_direct;
	out_color_indirect = color_indirect;
}
