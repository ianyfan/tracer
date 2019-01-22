'use strict';
(function() {
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

  function start(vsSource, fsSource) {
    // initialise WebGL
    const canvas = document.getElementsByTagName('canvas')[0];
    const gl = canvas.getContext('webgl2', {alpha: false})

    if (!gl) {
      console.log('No WebGL :(');
      return;
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // clear
    gl.enable(gl.DEPTH_TEST);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    // initialise program
    const shaderProgram = gl.createProgram();

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    gl.attachShader(shaderProgram, vertexShader);

    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(shaderProgram, fragmentShader);

    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.log(`Shader program error:\n${gl.getProgramInfoLog(shaderProgram)}`);
      return;
    }
    gl.useProgram(shaderProgram);

    // input variables
    // render scene to rectangular texture
    const vertices = [-1, -1, -1, 1, 1, -1, 1, 1];
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    const posAttrib = gl.getAttribLocation(shaderProgram, 'position');
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttrib);

    const indices = [0, 1, 2, 1, 2, 3];
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const resUniform = gl.getUniformLocation(shaderProgram, 'resolution');
    gl.uniform2fv(resUniform, [width, height]);

    // texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    // disable mipmaps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texUniform = gl.getUniformLocation(shaderProgram, 'prev');
    gl.uniform1i(shaderProgram.texUniform, 0);

    // frame buffer
    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // draw
    const p = document.getElementsByTagName('p')[0];
    const samplesUniform = gl.getUniformLocation(shaderProgram, 'samples');
    const seedUniform = gl.getUniformLocation(shaderProgram, 'input_seed');
    const start = performance.now();
    let samples = 0;
    let frame = requestAnimationFrame(draw);
    function draw() {
      // set frame-specific variables
      ++samples;
      gl.uniform1f(samplesUniform, samples);
      gl.uniform1ui(seedUniform, Math.random() * 4294967296);

      // draw
      p.textContent = `Samples: ${samples}; FPS: ${1000 * samples / (performance.now() - start)}`;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      // copy to frame buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

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
    let fsSource = null;
    let vsSource = null;

    // get fragment shader source
    const fsReq = new XMLHttpRequest();
    fsReq.open('GET', 'fragment_shader.frag', true);
    fsReq.responseType = 'text';
    fsReq.onload = function(e) {
      if (this.status === 200) fsSource = this.response;
      if (vsSource && fsSource) start(vsSource, fsSource);
    };
    fsReq.send();

    // get vertex shader source
    const vsReq = new XMLHttpRequest();
    vsReq.open('GET', 'vertex_shader.vert', true);
    vsReq.responseType = 'text';
    vsReq.onload = function(e) {
      if (this.status === 200) vsSource = this.response;
      if (vsSource && fsSource) start(vsSource, fsSource);
    };
    vsReq.send();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
