#version 300 es
precision mediump float;

// inputs
uniform vec2 resolution_inverse;
uniform float step_size;

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
const float kernel[] = float[](
	0.00390625, 0.015625, 0.0234375, 0.015625, 0.00390625,
	0.015625,   0.0625,   0.09375,   0.0625,   0.015625,
	0.0234375,  0.09375,  0.140625,  0.09375,  0.0234375,
	0.015625,   0.0625,   0.09375,   0.0625,   0.015625,
	0.00390625, 0.015625, 0.0234375, 0.015625, 0.00390625
);

const vec2 offsets[] = vec2[](
	vec2(-2.0, -2.0), vec2(-2.0, -1.0), vec2(-2.0, 0.0), vec2(-2.0, 1.0), vec2(-2.0, 2.0),
	vec2(-1.0, -2.0), vec2(-1.0, -1.0), vec2(-1.0, 0.0), vec2(-1.0, 1.0), vec2(-1.0, 2.0),
	vec2( 0.0, -2.0), vec2( 0.0, -1.0), vec2( 0.0, 0.0), vec2( 0.0, 1.0), vec2( 0.0, 2.0),
	vec2( 1.0, -2.0), vec2( 1.0, -1.0), vec2( 1.0, 0.0), vec2( 1.0, 1.0), vec2( 1.0, 2.0),
	vec2( 2.0, -2.0), vec2( 2.0, -1.0), vec2( 2.0, 0.0), vec2( 2.0, 1.0), vec2( 2.0, 2.0)
);

const float gaussian[] = float[](
	0.0625, 0.125, 0.0625,
	0.125,  0.25,  0.125,
	0.0625, 0.125, 0.0625
);

const vec2 gaussian_offsets[] = vec2[](
	vec2(-1.0, -1.0), vec2(-1.0, 0.0), vec2(-1.0, 1.0),
	vec2( 0.0, -1.0), vec2( 0.0, 0.0), vec2( 0.0, 1.0),
	vec2( 1.0, -1.0), vec2( 1.0, 0.0), vec2( 1.0, 1.0)
);

const float epsilon = 0.00001;
const float depth_parameter = 1.0;
const float normal_parameter = 128.0;
const float luminance_parameter = 4.0;

float luminance(vec4 color) {
	return dot(vec4(0.2126, 0.7152, 0.0722, 0.0), color);
}

void main() {
	vec2 position = gl_FragCoord.xy * resolution_inverse;

	// pass through non-color buffers
	out_history = texture(curr_history, position);
	out_mesh_id = texture(curr_mesh_id, position);
	out_normal = texture(curr_normal, position);
	out_moment = texture(curr_moment, position);
	gl_FragDepth = texture(curr_depth, position).x;

	float variance_direct = 0.0;
	float variance_indirect = 0.0;
	for (int i = 0; i < gaussian.length(); ++i) {
		vec2 sample_pos = position + gaussian_offsets[i] * step_size * resolution_inverse;
		variance_direct += gaussian[i] * texture(curr_direct, sample_pos).w;
		variance_indirect += gaussian[i] * texture(curr_indirect, sample_pos).w;
	}
	float sd_direct = sqrt(variance_direct);
	float sd_indirect = sqrt(variance_indirect);

	float luminance_direct = luminance(texture(curr_direct, position));
	float luminance_indirect = luminance(texture(curr_indirect, position));
	vec2 depth_gradient = vec2((texture(curr_depth, position + vec2(resolution_inverse.x, 0.0)) -
			texture(curr_depth, position - vec2(resolution_inverse.x, 0.0))).x / 2.0,
			(texture(curr_depth, position + vec2(0.0, resolution_inverse.y)) -
			texture(curr_depth, position - vec2(0.0, resolution_inverse.y))).x / 2.0);

	vec2 total = vec2(0.0);
	vec4 color_direct = vec4(0.0);
	vec4 color_indirect = vec4(0.0);
	for (int i = 0; i < kernel.length(); ++i) {
		vec2 sample_pos = position + offsets[i] * step_size * resolution_inverse;
		if (any(lessThan(sample_pos, vec2(0.0))) || any(greaterThanEqual(sample_pos, vec2(1.0)))) continue;

		vec4 sample_moment = texture(curr_moment, sample_pos);

		float depth_weight = exp(-abs(gl_FragDepth - texture(curr_depth, sample_pos).x)/(depth_parameter * abs(dot(depth_gradient, offsets[i])) + epsilon));
		float normal_weight = pow(max(0.0, dot(out_normal.rgb, texture(curr_normal, sample_pos).rgb)), normal_parameter);
		vec2 luminance_weight = exp(-abs(out_moment.xz - sample_moment.xz)/(luminance_parameter * vec2(sd_direct, sd_indirect) + epsilon));

		vec2 weight = kernel[i] * depth_weight * normal_weight * luminance_weight;
		total += weight;

		color_direct += weight.x * vec4(vec3(1.0), weight.x) * texture(curr_direct, sample_pos);
		color_indirect += weight.y * vec4(vec3(1.0), weight.y) * texture(curr_indirect, sample_pos);
	}

	out_direct = color_direct / (total.x * vec4(vec3(1.0), total.x));
	out_indirect = color_indirect / (total.y * vec4(vec3(1.0), total.y));
}
