'use strict';

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
else init();

function init() {
  Object.keys(shaderSources).forEach(source => {
    const req = new XMLHttpRequest();
    req.open('GET', source, true);
    req.responseType = 'text';
    req.onload = function(e) {
      if (this.status === 200) shaderSources[source] = this.response;
      if (Object.values(shaderSources).every(x => x)) start();

    };
    req.send();
  });

  // initialise WebGL
  const canvas = document.getElementsByTagName('canvas')[0];
  gl = canvas.getContext('webgl2', {alpha: false})
  if (!gl) {
    console.log('No WebGL :(');
    return;
  }

  gl.getExtension('EXT_color_buffer_float');

  // clear
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

const glTextures = [];
function createTexture(internalFormat, format, type) {
  const texture = gl.createTexture();
  glTextures.push(texture);
  gl.activeTexture(textureUnitOf(texture));
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.canvas.width, gl.canvas.height, 0, format, type, null);
  // disable mipmaps
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // wrapping
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function textureUnitOf(texture) {
  return gl.TEXTURE0 + glTextures.indexOf(texture);
}

function createColorTexture() {
  return createTexture(gl.RGBA32F, gl.RGBA, gl.FLOAT);
}

function createDepthTexture() {
  return createTexture(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
}

function createTextureAuto() {
  return (this === 'depth' ? createDepthTexture : createColorTexture)();
}

function setTexture(program, variable, texture) {
  gl.useProgram(program);
  const texUniform = gl.getUniformLocation(program, variable);
  gl.uniform1i(texUniform, glTextures.indexOf(texture));
}

function createFramebuffer(textures, index) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const drawBuffers = [];
  Object.entries(textures).forEach(([k, v], i) => {
    if (k === 'depth') return;
    const b = gl.COLOR_ATTACHMENT0 + i;
    if (index in v) {
      drawBuffers.push(b);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, b, gl.TEXTURE_2D, v[index], 0);
    } else {
      drawBuffers.push(gl.NONE);
    }
  });
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, textures.depth[index], 0);
  gl.drawBuffers(drawBuffers);
  return framebuffer;
}

function loadShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log(`Compile error for shader:\n${gl.getShaderInfoLog(shader)}`);
    return null;
  }

  return shader;
}

let gl;
const shaderSources = {
  'vertex_shader.vert': null,
  'tracer.frag': null,
  'filter.frag': null,
  'draw.frag': null,
};
function start() {
  // load shaders
  const vertexShader = loadShader(gl.VERTEX_SHADER, shaderSources['vertex_shader.vert']);
  const tracerShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['tracer.frag']);
  const filterShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['filter.frag']);
  const drawShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['draw.frag']);

  // create textures
  // as a map of name => list of textures
  // in order (if present): filter, prev, tracer
  const textures = [
    ['history', 2],
    ['direct', 3],
    ['indirect', 3],
    ['mesh_id', 3],
    ['normal', 3],
    ['moment', 2], // second moment
    ['motion', 1], // just tracer
    ['depth', 3]
  ].reduce((textures, [k, l]) => {
    if (k === 'motion') textures.motion = [ , , createColorTexture()];
    else textures[k] = Array.from({length: l}, createTextureAuto, k)
    return textures;
  }, {});

  // create framebuffers
  const filterFramebuffers = [createFramebuffer(textures, 0), createFramebuffer(textures, 1)];
  const tracerFramebuffer = createFramebuffer(textures, 2);

  // initialise programs
  const tracerProgram = gl.createProgram();
  const filterProgram = gl.createProgram();
  const drawProgram = gl.createProgram();

  // attach shaders
  gl.attachShader(tracerProgram, vertexShader);
  gl.attachShader(tracerProgram, tracerShader);

  gl.attachShader(filterProgram, vertexShader);
  gl.attachShader(filterProgram, filterShader);

  gl.attachShader(drawProgram, vertexShader);
  gl.attachShader(drawProgram, drawShader);

  // link programs
  gl.linkProgram(tracerProgram);
  gl.linkProgram(filterProgram);
  gl.linkProgram(drawProgram);

  // setup programs
  for (const program of [tracerProgram, filterProgram, drawProgram]) {
    gl.useProgram(program);

    // render scene to rectangular texture
    const vertices = [-1, -1, -1, 1, 1, -1, 1, 1];
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    const posAttrib = gl.getAttribLocation(program, 'position');
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttrib);

    const indices = [0, 1, 2, 1, 2, 3];
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const resUniform = gl.getUniformLocation(program, 'resolution');
    gl.uniform2fv(resUniform, [gl.drawingBufferWidth, gl.drawingBufferHeight]);

    const resInvUniform = gl.getUniformLocation(program, 'resolution_inverse');
    gl.uniform2fv(resInvUniform, [1/gl.drawingBufferWidth, 1/gl.drawingBufferHeight]);
  }

  // textures
  for (const [k, v] of Object.entries(textures)) {
    if (2 in v) setTexture(filterProgram, 'tracer_' + k, v[2]);
  }

  // camera
  let cameraPos = [0, 0, 0];
  let prevCameraPos = [0, 0, 0];
  const cameraUniform = gl.getUniformLocation(tracerProgram, 'camera_pos');
  const prevCameraUniform = gl.getUniformLocation(filterProgram, 'prev_camera_pos');

  // draw
  const randomUniform = gl.getUniformLocation(tracerProgram, 'random_seed');
  const start = performance.now();
  let currTextureIndex = 0;
  let frame = requestAnimationFrame(draw);
  function draw() {
    frame = requestAnimationFrame(draw);

    const t = (performance.now() - start) / 1000;
    cameraPos = [Math.cos(t), 0.0, Math.sin(t) - 1];

    gl.useProgram(tracerProgram);
    gl.uniform3fv(cameraUniform, cameraPos);
    gl.uniform3fv(prevCameraUniform, prevCameraPos);
    gl.uniform1ui(randomUniform, Math.random() * 4294967296); // TODO texture?
    gl.bindFramebuffer(gl.FRAMEBUFFER, tracerFramebuffer);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(filterProgram);
    for (const [k, v] of Object.entries(textures)) setTexture(filterProgram, 'prev_' + k, v[1 - currTextureIndex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffers[currTextureIndex]);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(drawProgram);
    setTexture(drawProgram, 'direct', textures.direct[currTextureIndex]);
    setTexture(drawProgram, 'indirect', textures.indirect[currTextureIndex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // swap buffers
    prevCameraPos = cameraPos;
    currTextureIndex = 1 - currTextureIndex;
  }

  document.body.onclick = function() {
    if (frame === null) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }
}
