#version 300 es
precision mediump float;

// inputs
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

// outputs
layout(location = 0) out vec4 out_history;
layout(location = 1) out vec4 out_direct;
layout(location = 2) out vec4 out_indirect;
layout(location = 3) out vec4 out_mesh_id;
layout(location = 4) out vec4 out_normal;
layout(location = 5) out vec4 out_moment;

bool close(float m, float n) {
	return abs(m - n) < 0.01;
}

bool test_prev(vec2 prev_position) {
	if (any(lessThan(prev_position, vec2(0.0))) || any(greaterThanEqual(prev_position, vec2(1.0)))) return false;

	return close(out_mesh_id.x, texture(prev_mesh_id, prev_position).x)
		&& close(gl_FragDepth, texture(prev_depth, prev_position).x);
}

bool find_close(inout vec2 prev_position) {
	if (test_prev(prev_position)) return true;

	const vec2 first_offset[] = vec2[](
		vec2(-1.0), vec2(-1.0, 0.0), vec2(-1.0, 1.0),
		vec2(0.0, -1.0), vec2(0.0, 1.0),
		vec2(1.0, -1.0), vec2(1.0, 0.0), vec2(1.0)
	);
	for (int i = 0; i < first_offset.length(); ++i) {
		vec2 test_position = prev_position + first_offset[i] * resolution_inverse;
		if (test_prev(test_position)) {
			prev_position = test_position;
			return true;
		}
	}

	const vec2 second_offset[] = vec2[](
		vec2(-2.0), vec2(-2.0, -1.0), vec2(-2.0, 0.0), vec2(-2.0, 1.0), vec2(-2.0, 2.0),
		vec2(-1.0, -2.0), vec2(-1.0, 2.0),
		vec2(0.0, -2.0), vec2(0.0, 2.0),
		vec2(1.0, -2.0), vec2(1.0, 2.0),
		vec2(2.0, -2.0), vec2(2.0, -1.0), vec2(2.0, 0.0), vec2(2.0, 1.0), vec2(2.0)
	);
	for (int i = 0; i < second_offset.length(); ++i) {
		vec2 test_position = prev_position + second_offset[i] * resolution_inverse;
		if (test_prev(test_position)) {
			prev_position = test_position;
			return true;
		}
	}

	return false;
}

float luminance(vec4 color) {
	return dot(vec4(0.2126, 0.7152, 0.0722, 0.0), color);
}

void main() {
	vec2 position = gl_FragCoord.xy * resolution_inverse;

	// pass through geometry buffers
	out_mesh_id = texture(tracer_mesh_id, position);
	out_normal = texture(tracer_normal, position);
	gl_FragDepth = texture(tracer_depth, position).x;

	vec4 color_direct = texture(tracer_direct, position);
	vec4 color_indirect = texture(tracer_indirect, position);
	float luminance_direct = luminance(color_direct);
	float luminance_indirect = luminance(color_indirect);
	vec4 moment = vec4(luminance_direct, luminance_direct*luminance_direct,
			luminance_indirect, luminance_indirect*luminance_indirect);

	vec2 prev_position = (gl_FragCoord + texture(tracer_motion, position)).xy * resolution_inverse;
	float history_len = 1.0;
	if (find_close(prev_position)) {
		history_len += texture(prev_history, prev_position).x;

		vec4 prev_color_direct = texture(prev_direct, prev_position);
		vec4 prev_color_indirect = texture(prev_indirect, prev_position);

		const float default_fade = 0.2;
		float fade = max(1.0 / history_len, default_fade);
		color_direct = mix(prev_color_direct, color_direct, fade);
		color_indirect = mix(prev_color_indirect, color_indirect, fade);
		moment = mix(texture(prev_moment, prev_position), moment, fade);
	}
	out_history = vec4(history_len);

	out_direct = color_direct;
	out_indirect = color_indirect;
	out_moment = moment;

	// store variance as w of color
	out_direct.w = max(0.0, out_moment.y - out_moment.x*out_moment.x);
	out_indirect.w = max(0.0, out_moment.w - out_moment.z*out_moment.z);

}
