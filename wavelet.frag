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

	const float gaussian_kernel[] = float[](1.0/2.0, 1.0/4.0);
	vec2 variance = vec2(0.0);
	for (int x = -1; x <= 1; ++x) {
		for (int y = -1; y <= 1; ++y) {
			float weight = gaussian_kernel[abs(x)] * gaussian_kernel[abs(y)];
			vec2 sample_pos = position + vec2(x, y) * step_size * resolution_inverse;
			variance += weight * vec2(texture(curr_direct, sample_pos).w, texture(curr_indirect, sample_pos).w);
		}
	}
	vec2 luminance_multiplier = 1.0/(luminance_parameter * sqrt(variance) + epsilon);
	vec2 luminance_center = vec2(luminance(texture(curr_direct, position)), luminance(texture(curr_indirect, position)));

	vec2 depth_gradient = vec2((texture(curr_depth, position + vec2(resolution_inverse.x, 0.0)) -
			texture(curr_depth, position - vec2(resolution_inverse.x, 0.0))).x / 2.0,
			(texture(curr_depth, position + vec2(0.0, resolution_inverse.y)) -
			texture(curr_depth, position - vec2(0.0, resolution_inverse.y))).x / 2.0);
	float depth_multiplier = depth_parameter * length(depth_gradient);

	const float kernel[] = float[](1.0, 2.0/3.0, 1.0/6.0);
	vec2 total = vec2(1.0);
	vec4 color_direct = texture(curr_direct, position);
	vec4 color_indirect = texture(curr_indirect, position);
	for (int x = -2; x <= 2; ++x) {
		for (int y = -2; y <= 2; ++y) {
			if (x == 0 && y == 0) continue;
			vec2 offset = step_size * vec2(x, y);
			vec2 sample_pos = position + offset * resolution_inverse;
			if (any(lessThan(sample_pos, vec2(0.0))) || any(greaterThanEqual(sample_pos, vec2(1.0)))) continue;

			float depth_weight = exp(-abs(gl_FragDepth - texture(curr_depth, sample_pos).x)/(depth_multiplier * length(offset) + epsilon));
			float normal_weight = pow(max(0.0, dot(out_normal.rgb, texture(curr_normal, sample_pos).rgb)), normal_parameter);
			vec2 luminance_sample = vec2(luminance(texture(curr_direct, sample_pos)), luminance(texture(curr_indirect, sample_pos)));
			vec2 luminance_weight = exp(-abs(luminance_center - luminance_sample) * luminance_multiplier);

			vec2 weight = kernel[abs(x)] * kernel[abs(y)] * depth_weight * normal_weight * luminance_weight;
			total += weight;

			color_direct += weight.x * vec4(vec3(1.0), weight.x) * texture(curr_direct, sample_pos);
			color_indirect += weight.y * vec4(vec3(1.0), weight.y) * texture(curr_indirect, sample_pos);
		}
	}

	out_direct = color_direct / (total.x * vec4(vec3(1.0), total.x));
	out_indirect = color_indirect / (total.y * vec4(vec3(1.0), total.y));
}
