'use strict';

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
else init();

function init() {
  Object.keys(shaderSources).forEach(source => {
    const req = new XMLHttpRequest();
    req.open('GET', source);
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

function setTextures(program, prefix, textures, index) {
  for (const [k, v] of Object.entries(textures)) {
    if (index in v) setTexture(program, `${prefix}_${k}`, v[index]);
  }
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

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.log('Failed to create framebuffer');
  }

  return framebuffer;
}

function loadShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log(`Failed to compile shader:\n${gl.getShaderInfoLog(shader)}`);
    return null;
  }

  return shader;
}

let gl;
const shaderSources = {
  'vertex_shader.vert': null,
  'tracer.frag': null,
  'accumulate.frag': null,
  'variance.frag': null,
  'wavelet.frag': null,
  'draw.frag': null,
};
function start() {
  // load shaders
  const vertexShader = loadShader(gl.VERTEX_SHADER, shaderSources['vertex_shader.vert']);
  const tracerShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['tracer.frag']);
  const accumulateShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['accumulate.frag']);
  const varianceShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['variance.frag']);
  const waveletShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['wavelet.frag']);
  const drawShader = loadShader(gl.FRAGMENT_SHADER, shaderSources['draw.frag']);

  // initialise programs
  const tracerProgram = gl.createProgram();
  const accumulateProgram = gl.createProgram();
  const varianceProgram = gl.createProgram();
  const waveletProgram = gl.createProgram();
  const drawProgram = gl.createProgram();

  // attach fragment shaders
  gl.attachShader(tracerProgram, tracerShader);
  gl.attachShader(accumulateProgram, accumulateShader);
  gl.attachShader(varianceProgram, varianceShader);
  gl.attachShader(waveletProgram, waveletShader);
  gl.attachShader(drawProgram, drawShader);

  // setup programs
  const programs = [tracerProgram, accumulateProgram, varianceProgram, waveletProgram, drawProgram];
  for (const program of programs) {
    // finish attaching shaders
    gl.attachShader(program, vertexShader);
    gl.linkProgram(program);

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

  // create textures
  // as a map of name => list of textures
  // in order (if present): prev, filter1, filter2, tracer
  const textures = [
    ['history', 3],
    ['direct', 4], // w = variance
    ['indirect', 4], // w = variance
    ['mesh_id', 4],
    ['normal', 4],
    ['moment', 3], // x = 1st dir, y = 2nd dir, z = 1st indir, w = 2nd indir
    ['motion', 1], // just tracer
    ['depth', 4]
  ].reduce((textures, [k, l]) => {
    if (k === 'motion') textures.motion = [ , , , createColorTexture()];
    else textures[k] = Array.from({length: l}, createTextureAuto, k)
    return textures;
  }, {});

  // create framebuffers
  const prevFramebuffer = createFramebuffer(textures, 0); // holds the previous result
  const filterFramebuffer1 = createFramebuffer(textures, 1); // used during filtering
  const filterFramebuffer2 = createFramebuffer(textures, 2); // used during filtering
  const tracerFramebuffer = createFramebuffer(textures, 3);

  // set fixed textures
  setTextures(accumulateProgram, 'prev', textures, 0);
  setTextures(accumulateProgram, 'tracer', textures, 3);
  setTextures(varianceProgram, 'curr', textures, 1);
  setTexture(drawProgram, 'direct', textures.direct[2]);
  setTexture(drawProgram, 'indirect', textures.indirect[2]);

  // camera
  const cameraOrigin = [-278, 273, 800];
  let cameraPos = cameraOrigin;
  let cameraRot = [0, 0, 0];
  const cameraPosUniform = gl.getUniformLocation(tracerProgram, 'camera_pos');
  const prevCameraPosUniform = gl.getUniformLocation(tracerProgram, 'prev_camera_pos');
  const cameraRotUniform = gl.getUniformLocation(tracerProgram, 'camera_rot');
  const prevCameraRotUniform = gl.getUniformLocation(tracerProgram, 'prev_camera_rot');

  // draw
  const p = document.getElementsByTagName('p')[0];
  const stepUniform = gl.getUniformLocation(waveletProgram, 'step_size');
  const randomUniform = gl.getUniformLocation(tracerProgram, 'random_seed');
  const start = performance.now();
  let frame = requestAnimationFrame(draw);
  const prevTimes = [];
  let frameNo = 0;
  function draw() {
    frame = requestAnimationFrame(draw);
    const t = (performance.now() - start) / 1000;
    p.textContent = `Frame: ${frameNo}; FPS: ${prevTimes.length / (t - prevTimes[0])}`;

    // camera
    // cameraRot = [-Math.sin(frameNo * Math.PI/32)/8, frameNo * Math.PI/64, 0];
    cameraRot = [0, 0, 0];
    const cameraRotMatrix = [
      Math.cos(cameraRot[1]), 0, -Math.sin(cameraRot[1]),
      Math.sin(cameraRot[1])*Math.sin(cameraRot[0]), Math.cos(cameraRot[0]), Math.cos(cameraRot[1])*Math.sin(cameraRot[0]),
      Math.sin(cameraRot[1])*Math.cos(cameraRot[0]), -Math.sin(cameraRot[0]), Math.cos(cameraRot[1])*Math.cos(cameraRot[0])];
    // cameraPos = [cameraOrigin[0] + 1100*cameraRotMatrix[6], cameraOrigin[1] + 1100*cameraRotMatrix[7], cameraOrigin[2] + (550/2 + 800)*(cameraRotMatrix[8] - 1)];
    cameraPos = cameraOrigin;

    // render
    gl.useProgram(tracerProgram);
    gl.uniform3fv(cameraPosUniform, cameraPos);
    gl.uniformMatrix3fv(cameraRotUniform, false, cameraRotMatrix);
    gl.uniform1ui(randomUniform, Math.random() * 4294967296); // TODO texture?
    gl.bindFramebuffer(gl.FRAMEBUFFER, tracerFramebuffer);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(accumulateProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(varianceProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer2);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(waveletProgram);
    setTextures(waveletProgram, 'curr', textures, 2);
    gl.uniform1f(stepUniform, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    setTextures(waveletProgram, 'curr', textures, 0);
    gl.uniform1f(stepUniform, 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    setTextures(waveletProgram, 'curr', textures, 1);
    gl.uniform1f(stepUniform, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer2);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    setTextures(waveletProgram, 'curr', textures, 2);
    gl.uniform1f(stepUniform, 8);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    setTextures(waveletProgram, 'curr', textures, 1);
    gl.uniform1f(stepUniform, 16);
    gl.bindFramebuffer(gl.FRAMEBUFFER, filterFramebuffer2);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(drawProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // push history
    gl.useProgram(tracerProgram);
    gl.uniform3fv(prevCameraPosUniform, cameraPos);
    const invCameraRotMatrix = [
      Math.cos(cameraRot[1]), Math.sin(cameraRot[0])*Math.sin(cameraRot[1]), Math.cos(cameraRot[0])*Math.sin(cameraRot[1]),
      0, Math.cos(cameraRot[0]), -Math.sin(cameraRot[0]),
      -Math.sin(cameraRot[1]), Math.sin(cameraRot[0])*Math.cos(cameraRot[1]), Math.cos(cameraRot[0])*Math.cos(cameraRot[1])];
    gl.uniformMatrix3fv(prevCameraRotUniform, false, invCameraRotMatrix);
    prevTimes.push(t);
    if (prevTimes.length > 100) prevTimes.shift();
    frameNo++;
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
