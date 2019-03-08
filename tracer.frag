#version 300 es
precision mediump float;

// inputs
uniform uint random_seed;
uniform vec2 resolution;
uniform vec3 camera_pos;
uniform vec3 prev_camera_pos;

// outputs
layout(location = 1) out vec4 out_direct;
layout(location = 2) out vec4 out_indirect;
layout(location = 3) out vec4 out_mesh_id;
layout(location = 4) out vec4 out_normal;
layout(location = 6) out vec4 out_motion;

// constants
const float max_depth = 10000.0;
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

Ray rand_light_ray(Quad quad, vec3 intersection) {
	vec3 p = quad.corner + rand()*quad.edge1 + rand()*quad.edge2;
	Ray ray = Ray(intersection, normalize(p - intersection));
	return ray;
}

bool quad_intersect(Quad quad, int quad_index, Ray ray, inout float min_lambda,
		inout vec3 closest_intersection, inout Quad closest_quad, inout int closest_quad_index) {
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

void main(void) {
	// initialise rng
	pcg16_init(uint(gl_FragCoord.x + gl_FragCoord.y * resolution.x) + random_seed);

	// create scene
	Material white_light = Material(vec3(10.0), vec3(0.0), 0.0);
	Material yellow_light = Material(vec3(34.0, 20.0, 6.0), vec3(0.0), 0.0);
	Material green_diffuse = Material(vec3(0.0), vec3(0.0, 1.0, 0.0), 0.5);
	Material red_diffuse =   Material(vec3(0.0), vec3(1.0, 0.0, 0.0), 0.5);
	Material white_diffuse = Material(vec3(0.0), vec3(1.0, 1.0, 1.0), 1.0);

	vec3 vertices[] = vec3[](
		// light
		vec3(-343.0, 549.0, -332.0),
		vec3(-343.0, 549.0, -227.0),
		vec3(-213.0, 549.0, -332.0),
		vec3(-213.0, 549.0, -227.0),

		// box
		// ceiling
		vec3(-550.0, 550.0, -550.0),
		vec3(-550.0, 550.0, 0.0),
		vec3(0.0, 550.0, -550.0),
		vec3(0.0, 550.0, 0.0),
		// floor
		vec3(-550.0, 0.0, -550.0),
		vec3(-550.0, 0.0, 0.0),
		vec3(0.0, 0.0, -550.0),
		vec3(0.0, 0.0, 0.0),

		// short block
		// ceiling
		vec3(-130.0, 165.0, -65.0),
		vec3(-82.0, 165.0, -225.0),
		vec3(-240.0, 165.0, -272.0),
		vec3(-290.0, 165.0, -114.0),
		// floor
		vec3(-130.0, 0.0, -65.0),
		vec3(-82.0, 0.0, -225.0),
		vec3(-240.0, 0.0, -272.0),
		vec3(-290.0, 0.0, -114.0),

		// tall block
		// ceiling
		vec3(-423.0, 330.0, -247.0),
		vec3(-265.0, 330.0, -296.0),
		vec3(-314.0, 330.0, -456.0),
		vec3(-472.0, 330.0, -406.0),
		// floor
		vec3(-423.0, 0.0, -247.0),
		vec3(-265.0, 0.0, -296.0),
		vec3(-314.0, 0.0, -456.0),
		vec3(-472.0, 0.0, -406.0)
	);

	Quad light = quad_create(vertices[0], vertices[2], vertices[1], yellow_light);
	Quad scene[] = Quad[](light,
		// box
		quad_create(vertices[4], vertices[6], vertices[5], white_diffuse), // ceiling
		quad_create(vertices[8], vertices[9], vertices[10], white_diffuse), // floor
		quad_create(vertices[4], vertices[5], vertices[8], red_diffuse), // left
		quad_create(vertices[4], vertices[8], vertices[6], white_diffuse), // back
		quad_create(vertices[6], vertices[10], vertices[7], green_diffuse), // right
		// quad_create(vertices[5], vertices[7], vertices[9], white_diffuse), // front

		// short block
		quad_create(vertices[12], vertices[13], vertices[15], white_diffuse), // ceiling
		quad_create(vertices[12], vertices[15], vertices[16], white_diffuse), // front
		quad_create(vertices[12], vertices[16], vertices[13], white_diffuse), // right
		quad_create(vertices[13], vertices[17], vertices[14], white_diffuse), // back
		quad_create(vertices[14], vertices[18], vertices[15], white_diffuse), // left

		// tall block
		quad_create(vertices[20], vertices[21], vertices[23], white_diffuse), // ceiling
		quad_create(vertices[20], vertices[24], vertices[21], white_diffuse), // front
		quad_create(vertices[21], vertices[25], vertices[22], white_diffuse), // right
		quad_create(vertices[22], vertices[26], vertices[23], white_diffuse), // back
		quad_create(vertices[20], vertices[23], vertices[24], white_diffuse) // left
	);
	Quad lights[] = Quad[](light);

	// trace primary ray
	const float focal_multiplier = 1.4; // TODO proper multiplier
	Ray ray = Ray(camera_pos,
			normalize(vec3(gl_FragCoord.xy - resolution / 2.0, -resolution.y * focal_multiplier)));
	vec3 intersection;
	Quad closest_quad;
	int closest_quad_index;
	float min_lambda = max_depth;
	for (int i = 0; i < scene.length(); ++i) {
		quad_intersect(scene[i], i, ray, min_lambda, intersection, closest_quad, closest_quad_index);
	}

	if (min_lambda == max_depth) return;

	// geometry buffer outputs
	out_mesh_id = vec4(float(closest_quad_index), 0.0, 0.0, 1.0);

	out_normal = vec4(closest_quad.normal, 1.0);

	vec3 prev_pos = intersection - prev_camera_pos;
	prev_pos *= (-resolution.y * focal_multiplier) / prev_pos.z;
	out_motion = vec4(prev_pos.xy + resolution / 2.0, 0.0, 0.0) - gl_FragCoord;

	float depth = -(intersection - camera_pos).z;
	gl_FragDepth = depth / max_depth;

	// calculate direct light
	if (length(closest_quad.material.emittance) > 0.0) {
		out_direct = vec4(closest_quad.material.emittance, 1.0);
		return;
	}

	Quad saved_closest_quad = closest_quad;
	vec3 saved_intersection = intersection;

	ray = rand_light_ray(light, intersection + closest_quad.normal * 0.001);
	min_lambda = max_depth;
	for (int i = 0; i < scene.length(); ++i) {
		quad_intersect(scene[i], i, ray, min_lambda, intersection, closest_quad, closest_quad_index);
	}

	if (closest_quad == light) {
		closest_quad = saved_closest_quad;
		vec3 light_vec = light.center - saved_intersection;
		vec3 normed_light_vec = normalize(light_vec);
		float approx_area = abs(length(cross(light.edge1, light.edge2)) / dot(light_vec, light_vec) * dot(normed_light_vec, light.normal));
		out_direct = vec4(approx_area
				* light.material.emittance
				* closest_quad.material.diffuse_color
				* closest_quad.material.diffuse_reflectance
				* dot(closest_quad.normal, normed_light_vec) / pi, 1.0);
	}
	closest_quad = saved_closest_quad;

	// bounce ray
	// cosine-weighted random vector
	float angle = rand() * 2.0 * pi;
	float r = sqrt(rand());
	float x = sin(angle) * r;
	float y = cos(angle) * r;

	vec3 outgoing_dir = x*closest_quad.tangent + y*closest_quad.cotangent + sqrt(1.0 - r*r)*closest_quad.normal;
	ray = Ray(saved_intersection, outgoing_dir);
	ray.origin = ray_project(ray, epsilon);

	vec3 brdf_over_prob = closest_quad.material.diffuse_color * closest_quad.material.diffuse_reflectance;
	// vec3 brdf = closest_quad.material.diffuse_color * closest_quad.material.diffuse_reflectance * dot(outgoing_dir, closest_quad.normal) / pi;
	// float prob = dot(outgoing_dir, closest_quad.normal) / pi;

	min_lambda = max_depth;
	for (int i = 0; i < scene.length(); ++i) {
		quad_intersect(scene[i], i, ray, min_lambda, intersection, closest_quad, closest_quad_index);
	}

	if (min_lambda == max_depth) return;

	// calculate indirect light
	saved_closest_quad = closest_quad;
	saved_intersection = intersection;

	ray = rand_light_ray(light, intersection + closest_quad.normal * 0.001);
	min_lambda = max_depth;
	for (int i = 0; i < scene.length(); ++i) {
		quad_intersect(scene[i], i, ray, min_lambda, intersection, closest_quad, closest_quad_index);
	}

	if (closest_quad == light) {
		closest_quad = saved_closest_quad;
		vec3 light_vec = light.center - saved_intersection;
		vec3 normed_light_vec = normalize(light_vec);
		float approx_area = abs(length(cross(light.edge1, light.edge2)) / dot(light_vec, light_vec) * dot(normed_light_vec, light.normal));
		out_indirect = vec4(approx_area
				* light.material.emittance
				* closest_quad.material.diffuse_color
				* closest_quad.material.diffuse_reflectance
				* dot(closest_quad.normal, normed_light_vec) / pi * brdf_over_prob, 1.0);
	}
	closest_quad = saved_closest_quad;
}
