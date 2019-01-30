#version 300 es
precision mediump float;

// inputs
uniform vec2 resolution_inverse;

uniform sampler2D curr_history;
uniform sampler2D curr_direct;
uniform sampler2D curr_indirect;
uniform sampler2D curr_mesh_id;
uniform sampler2D curr_normal;
uniform sampler2D curr_moment;
uniform sampler2D curr_depth;

// outputs
layout(location = 0) out vec4 out_history;
layout(location = 1) out vec4 out_direct;
layout(location = 2) out vec4 out_indirect;
layout(location = 3) out vec4 out_mesh_id;
layout(location = 4) out vec4 out_normal;
layout(location = 5) out vec4 out_moment;

// constants
const float epsilon = 0.00001;
const float depth_parameter = 1.0;
const float normal_parameter = 128.0;
const float luminance_parameter = 4.0;

const vec2 offsets[] = vec2[](
	vec2(-3.0, -3.0), vec2(-3.0, -2.0), vec2(-3.0, -1.0), vec2(-3.0, 0.0), vec2(-3.0, 1.0), vec2(-3.0, 2.0), vec2(-3.0, 3.0),
	vec2(-2.0, -3.0), vec2(-2.0, -2.0), vec2(-2.0, -1.0), vec2(-2.0, 0.0), vec2(-2.0, 1.0), vec2(-2.0, 2.0), vec2(-2.0, 3.0),
	vec2(-1.0, -3.0), vec2(-1.0, -2.0), vec2(-1.0, -1.0), vec2(-1.0, 0.0), vec2(-1.0, 1.0), vec2(-1.0, 2.0), vec2(-1.0, 3.0),
	vec2( 0.0, -3.0), vec2( 0.0, -2.0), vec2( 0.0, -1.0), vec2( 0.0, 0.0), vec2( 0.0, 1.0), vec2( 0.0, 2.0), vec2( 0.0, 3.0),
	vec2( 1.0, -3.0), vec2( 1.0, -2.0), vec2( 1.0, -1.0), vec2( 1.0, 0.0), vec2( 1.0, 1.0), vec2( 1.0, 2.0), vec2( 1.0, 3.0),
	vec2( 2.0, -3.0), vec2( 2.0, -2.0), vec2( 2.0, -1.0), vec2( 2.0, 0.0), vec2( 2.0, 1.0), vec2( 2.0, 2.0), vec2( 2.0, 3.0),
	vec2( 3.0, -3.0), vec2( 3.0, -2.0), vec2( 3.0, -1.0), vec2( 3.0, 0.0), vec2( 3.0, 1.0), vec2( 3.0, 2.0), vec2( 3.0, 3.0)
);

float luminance(vec4 color) {
	return dot(vec4(0.2126, 0.7152, 0.0722, 0.0), color);
}

void main() {
	vec2 position = gl_FragCoord.xy * resolution_inverse;

	// pass through buffers
	out_history = texture(curr_history, position);
	out_direct = texture(curr_direct, position);
	out_indirect = texture(curr_indirect, position);
	out_mesh_id = texture(curr_mesh_id, position);
	out_normal = texture(curr_normal, position);
	out_moment = texture(curr_moment, position);
	gl_FragDepth = texture(curr_depth, position).x;

	vec2 depth_gradient = vec2((texture(curr_depth, position + vec2(resolution_inverse.x, 0.0)) -
			texture(curr_depth, position - vec2(resolution_inverse.x, 0.0))).x / 2.0,
			(texture(curr_depth, position + vec2(0.0, resolution_inverse.y)) -
			texture(curr_depth, position - vec2(0.0, resolution_inverse.y))).x / 2.0);

	vec2 total = vec2(0.0);
	vec3 color_direct = vec3(0.0);
	vec3 color_indirect = vec3(0.0);
	vec4 moment = vec4(0.0);
	if (out_history.x < 4.0 - epsilon) {
		for (int i = 0; i < offsets.length(); ++i) {
			vec2 sample_pos = position + offsets[i] * resolution_inverse;
			if (any(lessThan(sample_pos, vec2(0.0))) || any(greaterThanEqual(sample_pos, vec2(1.0)))) continue;

			vec3 sample_direct = texture(curr_direct, sample_pos).rgb;
			vec3 sample_indirect = texture(curr_indirect, sample_pos).rgb;
			vec4 sample_moment = texture(curr_moment, sample_pos);

			float depth_weight = exp(-abs(gl_FragDepth - texture(curr_depth, sample_pos).x)/(depth_parameter * abs(dot(depth_gradient, offsets[i])) + epsilon));
			float normal_weight = pow(max(0.0, dot(out_normal.rgb, texture(curr_normal, sample_pos).rgb)), normal_parameter);
			vec2 luminance_weight = exp(-abs(out_moment.xz - sample_moment.xz)/luminance_parameter);

			vec2 weight = depth_weight * normal_weight * luminance_weight;
			total += weight;

			color_direct += weight.x * sample_direct;
			color_indirect += weight.y * sample_indirect;

			moment += sample_moment * weight.xxyy;
		}

		total = max(total, vec2(epsilon));
		moment /= total.xxyy;

		out_direct = vec4(color_direct / total.x, max(0.0, moment.y - moment.x*moment.x));
		out_indirect = vec4(color_indirect / total.y, max(0.0, moment.w - moment.z*moment.z));
	}
}
