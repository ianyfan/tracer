'use strict';
// (function() {
  function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const typeString = type == gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      console.log(`Compile error for ${typeString} shader:\n${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  function setupProgram(gl, program) {
    gl.useProgram(program);
    // input variables
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
    gl.uniform2fv(resUniform, [gl.canvas.width, gl.canvas.height]);

  }

  const textures = [];
  function createTexture(gl, internalFormat, format, type) {
    const texture = gl.createTexture();
    textures.push(texture);
    gl.activeTexture(textureUnitOf(texture));
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.canvas.width, gl.canvas.height, 0, format, type, null);
    // disable mipmaps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  function textureUnitOf(texture) {
    return gl.TEXTURE0 + textures.indexOf(texture);
  }

  function createColorTexture(gl) {
    return createTexture(gl, gl.RGBA32F, gl.RGBA, gl.FLOAT);
  }

  function createDepthTexture(gl) {
    return createTexture(gl, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
  }

  function setTexture(gl, program, variable, texture) {
    const texUniform = gl.getUniformLocation(program, variable);
    gl.uniform1i(texUniform, textures.indexOf(texture));
  }

  function copyTexture(gl, attachment, texture) {
    gl.readBuffer(attachment);
    gl.activeTexture(textureUnitOf(texture));
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, gl.canvas.width, gl.canvas.height, 0);
  }

  let fsSource = null;
  let fsDrawSource = null;
  let vsSource = null;
  function tryStart() {
    if (fsSource, fsDrawSource, vsSource) {
      start();
    }
  }

  function start() {
    // initialise WebGL
    const canvas = document.getElementsByTagName('canvas')[0];
    const gl = canvas.getContext('webgl2', {alpha: false})
    window.gl = gl;

    if (!gl) {
      console.log('No WebGL :(');
      return;
    }
    gl.getExtension('EXT_color_buffer_float');

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // clear
    gl.enable(gl.DEPTH_TEST);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    // initialise program
    const shaderProgram = gl.createProgram();
    const drawProgram = gl.createProgram();

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(drawProgram, vertexShader);

    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(shaderProgram, fragmentShader);

    const fragmentDrawShader = loadShader(gl, gl.FRAGMENT_SHADER, fsDrawSource);
    gl.attachShader(drawProgram, fragmentDrawShader);

    gl.linkProgram(drawProgram);
    if (!gl.getProgramParameter(drawProgram, gl.LINK_STATUS)) {
      console.log(`Draw program error:\n${gl.getProgramInfoLog(drawProgram)}`);
      return;
    }
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.log(`Shader program error:\n${gl.getProgramInfoLog(shaderProgram)}`);
      return;
    }

    setupProgram(gl, shaderProgram);
    setupProgram(gl, drawProgram);

    // textures
    const textureDepth = createDepthTexture(gl);
    const textureDirect = createColorTexture(gl);
    const textureIndirect = createColorTexture(gl);
    const textureMotion = createColorTexture(gl); // screen-space motion
    const textureQuad = createColorTexture(gl); // quad, not mesh, id
    const textureDepthCopy = createDepthTexture(gl);
    const textureDirectCopy = createColorTexture(gl);
    const textureIndirectCopy = createColorTexture(gl);
    const textureMotionCopy = createColorTexture(gl); // screen-space motion
    const textureQuadCopy = createColorTexture(gl); // quad, not mesh, id

    gl.useProgram(drawProgram);
    setTexture(gl, drawProgram, 'depth', textureDepth);
    setTexture(gl, drawProgram, 'direct', textureDirect);
    setTexture(gl, drawProgram, 'indirect', textureIndirect);
    setTexture(gl, drawProgram, 'motion', textureMotion);
    setTexture(gl, drawProgram, 'quad_id', textureQuad);

    gl.useProgram(shaderProgram);
    setTexture(gl, shaderProgram, 'prev_depth', textureDepthCopy);
    setTexture(gl, shaderProgram, 'prev_direct', textureDirectCopy);
    setTexture(gl, shaderProgram, 'prev_indirect', textureIndirectCopy);
    setTexture(gl, shaderProgram, 'prev_motion', textureMotionCopy);
    setTexture(gl, shaderProgram, 'prev_quad_id', textureQuadCopy);

    // frame buffer
    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, textureDepth, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureDirect, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textureIndirect, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, textureMotion, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, textureQuad, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);

    // camera
    const cameraUniform = gl.getUniformLocation(shaderProgram, 'camera_pos');
    const lastCameraUniform = gl.getUniformLocation(shaderProgram, 'last_camera_pos');

    // draw
    const p = document.getElementsByTagName('p')[0];
    const samplesUniform = gl.getUniformLocation(shaderProgram, 'samples');
    const seedUniform = gl.getUniformLocation(shaderProgram, 'input_seed');
    const start = performance.now();
    let last_t = start;
    let t = start;
    let samples = 0;
    let frame = requestAnimationFrame(draw);
    function draw() {
      last_t = t;
      t = (performance.now() - start) / 1000;

      gl.useProgram(shaderProgram);
      // set frame-specific variables
      ++samples;
      gl.uniform1f(samplesUniform, samples);
      gl.uniform1ui(seedUniform, Math.random() * 4294967296);

      let cameraPos = [0.0, 0.0, Math.sin(t) - 1];
      gl.uniform3fv(cameraUniform, cameraPos);
      let lastCameraPos = [0.0, 0.0, Math.sin(last_t) - 1];
      gl.uniform3fv(lastCameraUniform, lastCameraPos);

      // render
      p.textContent = `Samples: ${samples}; FPS: ${samples / t}`;
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      // copy textures
      copyTexture(gl, gl.DEPTH_ATTACHMENT, textureDepthCopy);
      copyTexture(gl, gl.COLOR_ATTACHMENT0, textureDirectCopy);
      copyTexture(gl, gl.COLOR_ATTACHMENT1, textureIndirectCopy);
      copyTexture(gl, gl.COLOR_ATTACHMENT2, textureMotionCopy);
      copyTexture(gl, gl.COLOR_ATTACHMENT3, textureQuadCopy);

      // draw
      gl.useProgram(drawProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      frame = requestAnimationFrame(draw);
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

  function init() {
    // get fragment shader source
    const fsReq = new XMLHttpRequest();
    fsReq.open('GET', 'fragment_shader.frag', true);
    fsReq.responseType = 'text';
    fsReq.onload = function(e) {
      if (this.status === 200) fsSource = this.response;
      tryStart();
    };
    fsReq.send();

    const fsDrawReq = new XMLHttpRequest();
    fsDrawReq.open('GET', 'fragment_shader_draw.frag', true);
    fsDrawReq.responseType = 'text';
    fsDrawReq.onload = function(e) {
      if (this.status === 200) fsDrawSource = this.response;
      tryStart();
    };
    fsDrawReq.send();

    // get vertex shader source
    const vsReq = new XMLHttpRequest();
    vsReq.open('GET', 'vertex_shader.vert', true);
    vsReq.responseType = 'text';
    vsReq.onload = function(e) {
      if (this.status === 200) vsSource = this.response;
      tryStart();
    };
    vsReq.send();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
// })();
