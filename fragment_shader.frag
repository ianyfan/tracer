#version 300 es
precision mediump float;

// constants
const float max_depth = 100000.0;
const float epsilon = 0.00001;
const float pi = 3.1415926535897932384626433832795;

// random number generator
const uint multiplier = 747796405u;
const uint increment = 2891336453u;
uint state;

// returns an unsigned integer between 0 and 2^16-1 (65535)
uint pcg16(void) {
	uint x = state;
	uint count = x >> 28u;
	state = x * multiplier + increment;
	x ^= x >> 10u;
	// rotr16
	x = x >> 12u & 65535u;
	return x >> count | x << (-count & 15u) & 65535u;
}

// returns a floating-point number in [0,1)
float rand(void) {
	return float(pcg16()) / 65536.0;
}

// initialises random number generator
void pcg16_init(uint s) {
	state = s + increment;
	pcg16();
}

struct Material {
	vec3 emittance;
	vec3 diffuse_color;
	float diffuse_reflectance;
};

struct Ray {
	vec3 origin;
	vec3 dir;
};

// returns the point along the ray by the given lambda
vec3 ray_project(Ray ray, float lambda) {
	return ray.origin + lambda * ray.dir;
}

struct Quad {
	vec3 corner;
	vec3 edge1;
	vec3 edge2;
	vec3 edge1norm;
	vec3 edge2norm;
	vec3 normal;
	vec3 tangent;
	vec3 cotangent;
	vec3 center;
	Material material;
};

Quad quad_create(vec3 p1, vec3 p2, vec3 p3, Material mat) {
	vec3 edge1 = p2 - p1;
	vec3 edge2 = p3 - p1;
	vec3 normal = normalize(cross(edge1, edge2));
	vec3 edge1norm = cross(normal, edge1);
	vec3 edge2norm = cross(normal, edge2);
	return Quad(p1, edge1, edge2, edge1norm / dot(edge1norm, edge2),
		edge2norm / dot(edge2norm, edge1), normal, normalize(edge1),
		normalize(edge1norm), p1 + (edge1 + edge2) / 2.0, mat);
}

bool quad_intersect(Quad quad, int quad_index, Ray ray,
		inout float min_lambda, inout vec3 closest_intersection, inout Quad closest_quad, inout int closest_quad_index) {
	float denom = dot(ray.dir, quad.normal);
	if (denom > -epsilon) return false; // parallel ray or back of face

	vec3 offset = quad.corner - ray.origin;
	float lambda = dot(offset, quad.normal) / denom;
	if (lambda < 0.0 || lambda > min_lambda) return false;

	vec3 intersection = ray_project(ray, lambda);

	vec3 point = intersection - quad.corner;
	float dot1 = dot(point, quad.edge1norm);
	float dot2 = dot(point, quad.edge2norm);
	bool in_quad = dot1 > -epsilon && dot1 < 1.0 + epsilon && dot2 > -epsilon && dot2 < 1.0 + epsilon;
	if (in_quad) {
		min_lambda = lambda;
		closest_intersection = intersection;
		closest_quad = quad;
		closest_quad_index = quad_index;
	}
	return in_quad;
}

bool same_plane(Quad q1, Quad q2) {
	return 1.0 - dot(q1.normal, q2.normal) < epsilon
		&& abs(dot(q1.normal, q1.corner) - dot(q2.normal, q2.corner)) < epsilon;
}

// returns a cosine-weighted random vector in the hemisphere with the given normal
vec3 rand_hemi_vec(Quad q) {
	float angle = rand() * 2.0 * pi;
	float z = rand();
	float r = sqrt(1.0 - z*z);
	// float r = sqrt(rand());
	float x = sin(angle) * r;
	float y = cos(angle) * r;

	return x*q.tangent + y*q.cotangent + z*q.normal;
	// return x*q.tangent + y*q.cotangent + sqrt(1.0 - r*r)*q.normal;
}

vec3 ray_bounce(Quad q, vec3 incoming, vec3 intersection, Quad light, out vec3 brdf) {
	float prob_light = 0.0;
	if (rand() < prob_light) { // TODO: sample importance towards light
		vec3 outgoing_dir = normalize(light.center - intersection);
		brdf = q.material.diffuse_color * q.material.diffuse_reflectance * dot(q.normal, outgoing_dir) / pi;
		brdf /= prob_light / 0.1;
		return outgoing_dir;
	} else {
		vec3 outgoing_dir = rand_hemi_vec(q);

		// assume perfectly diffuse material for now
		brdf = q.material.diffuse_color * q.material.diffuse_reflectance * dot(q.normal, outgoing_dir) / pi;
		brdf /= (1.0 - prob_light) / (2.0 * pi);
		return outgoing_dir;
	}
}

uniform uint input_seed;
uniform float samples;
uniform vec2 resolution;
uniform vec3 camera_pos;
uniform vec3 last_camera_pos;

uniform sampler2D prev_direct;
uniform sampler2D prev_indirect;
uniform sampler2D prev_depth;
uniform sampler2D prev_motion;
uniform sampler2D prev_quad_id;

layout(location = 0) out vec4 out_color_direct;
layout(location = 1) out vec4 out_color_indirect;
layout(location = 2) out vec4 out_motion;
layout(location = 3) out vec4 out_quad_id;

void main(void) {
	// initialise rng
	pcg16_init(uint(gl_FragCoord.x + gl_FragCoord.y * resolution.x) + input_seed);

	// create scene
	Material white_light = Material(vec3(4.0, 4.0, 3.0), vec3(0.0), 0.0);
	Material green_diffuse = Material(vec3(0.0), vec3(0.0, 1.0, 0.0), 0.9);
	Material red_diffuse =   Material(vec3(0.0), vec3(1.0, 0.0, 0.0), 0.9);
	Material white_diffuse = Material(vec3(0.0), vec3(1.0, 1.0, 1.0), 0.9);

	vec3 vertices[] = vec3[](
		vec3(-1.0, 1.99, -6.0),
		vec3(-1.0, 1.99, -4.0),
		vec3(1.0, 1.99, -6.0),
		vec3(1.0, 1.99, -4.0),
		vec3(-5.0, 2.0, -10.0),
		vec3(-5.0, 2.0, 1.0),
		vec3(5.0, 2.0, -10.0),
		vec3(5.0, 2.0, 1.0),
		vec3(-5.0, -2.0, -10.0),
		vec3(-5.0, -2.0, 1.0),
		vec3(5.0, -2.0, -10.0),
		vec3(5.0, -2.0, 1.0)
	);

	Quad light = quad_create(vertices[0], vertices[2], vertices[1], white_light);
	Quad scene[] = Quad[](light,
		quad_create(vertices[4], vertices[6], vertices[5], white_diffuse),
		quad_create(vertices[8], vertices[9], vertices[10], white_diffuse),
		quad_create(vertices[4], vertices[5], vertices[8], red_diffuse),
		quad_create(vertices[4], vertices[8], vertices[6], white_diffuse),
		quad_create(vertices[6], vertices[10], vertices[7], green_diffuse),
		quad_create(vertices[5], vertices[9], vertices[7], white_diffuse)
	);
	Quad lights[] = Quad[](light);

	// trace
#define MAX_BOUNCES 8
	vec3 gather_emittance[MAX_BOUNCES];
	vec3 gather_brdf[MAX_BOUNCES];
	vec3 gather_intersections[MAX_BOUNCES];

	Ray ray = Ray(camera_pos,
			normalize(vec3(gl_FragCoord.x - resolution.x / 2.0, gl_FragCoord.y - resolution.y / 2.0, -resolution.y / 2.0))); // fov 90 TODO change
	int gather_bounces = 0;
	for (; gather_bounces < MAX_BOUNCES; ++gather_bounces) {
		Quad closest_quad;
		int closest_quad_index;
		vec3 intersection;
		float min_lambda = max_depth;
		for (int i = 0; i < scene.length(); ++i) {
			Quad quad = scene[i];
			quad_intersect(quad, i, ray, min_lambda, intersection, closest_quad, closest_quad_index);
		}

		if (min_lambda == max_depth) break;

		if (gather_bounces == 0) {
			// geometry buffer outputs
			float depth = -(intersection - camera_pos).z;
			gl_FragDepth = depth / 10.0;

			vec3 last_frame_vec = intersection - last_camera_pos;
			last_frame_vec *= (-resolution.y / 2.0) / last_frame_vec.z;
			out_motion = vec4(last_frame_vec.x + resolution.x / 2.0 - gl_FragCoord.x, last_frame_vec.y + resolution.y / 2.0 - gl_FragCoord.y, 0.0, 1.0);

			out_quad_id = vec4(float(closest_quad_index), 0.0, 0.0, 1.0);
		}

		gather_emittance[gather_bounces] = closest_quad.material.emittance;
		vec3 outgoing_dir = ray_bounce(closest_quad, ray.dir, intersection, light, gather_brdf[gather_bounces]);

		ray = Ray(intersection, outgoing_dir);
		ray.origin = ray_project(ray, epsilon);
	}

	vec3 indirect_color = vec3(0.0);
	while (--gather_bounces >= 2) {
		indirect_color = indirect_color * gather_brdf[gather_bounces] + gather_emittance[gather_bounces];
	}

	vec3 direct_color = vec3(0.0);
	for (++gather_bounces; --gather_bounces >= 0;) {
		indirect_color *= gather_brdf[gather_bounces];
		direct_color = direct_color * gather_brdf[gather_bounces] + gather_emittance[gather_bounces];
	}

	// mix
	direct_color = mix(texture(prev_direct, gl_FragCoord.xy / resolution).rgb, direct_color, 1.0 / samples);
	indirect_color = mix(texture(prev_indirect, gl_FragCoord.xy / resolution).rgb, indirect_color, 1.0 / samples);

	out_color_direct = vec4(direct_color, 1.0);
	out_color_indirect = vec4(indirect_color, 1.0);
}
