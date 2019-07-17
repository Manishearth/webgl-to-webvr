var cubeRotation = 0.0;
var inVR = false;
var xrSession;
var xrReferenceSpace;
var xr_frame;
var enterVR;
const canvas = document.querySelector('#canvas');

main();

//
// Start here
//
function main() {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  // If we don't have a GL context, give up now

  if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // Vertex shader program

  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying lowp vec4 vColor;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;

  // Fragment shader program

  const fsSource = `
    varying lowp vec4 vColor;

    void main(void) {
      gl_FragColor = vColor;
    }
  `;

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attributes our shader program is using
  // for aVertexPosition, aVevrtexColor and also
  // look up uniform locations.
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexColor: gl.getAttribLocation(shaderProgram, 'aVertexColor'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
    },
  };

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  const buffers = initBuffers(gl);

  var then = 0;


  // Draw the scene repeatedly
  function renderCallback(now) {
    if (inVR) {
      return;
    }

    now *= 0.001;  // convert to seconds
    const deltaTime = now - then;
    then = now;

    render(gl, programInfo, buffers, deltaTime);

    requestAnimationFrame(renderCallback);
  }

  // Ensure VR is all set up
  vrSetup(gl, programInfo, buffers, renderCallback);
  // Start rendering
  requestAnimationFrame(renderCallback);


  enterVR = function enterVR() {
    navigator.xr.requestSession({mode: "immersive-vr"}).then((s) => {
      xrSession = s;
      xrSession.requestReferenceSpace("local")
      .then((referenceSpace) => {
        xrReferenceSpace = referenceSpace;
      })
      inVR = true;
      // hand the canvas to the WebVR API
      const xrLayer = new XRWebGLLayer(xrSession, gl);
      xrSession.updateRenderState({"baseLayer": xrLayer});
      gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);

      const vrCallback = (now, frame) => {
          if (xrSession == null || !inVR) {
              return;
          }

          xr_frame = frame;

          // reregister callback if we're still in VR
          xrSession.requestAnimationFrame(vrCallback);

          // calculate time delta for rotation
          now *= 0.001;  // convert to seconds
          const deltaTime = now - then;
          then = now;

          // render scene
          renderVR(gl, programInfo, buffers, deltaTime);
      };
      // register callback
      xrSession.requestAnimationFrame(vrCallback);
    });
  };
}



// Set up the VR display and callbacks
function vrSetup(gl, programInfo, buffers, noVRRender) {
  if (!navigator.xr) {
    alert("Your browser does not support WebVR");
    return;
  }
}

//
// initBuffers
//
// Initialize the buffers we'll need. For this demo, we just
// have one object -- a simple three-dimensional cube.
//
function initBuffers(gl) {

  // Create a buffer for the cube's vertex positions.

  const positionBuffer = gl.createBuffer();

  // Select the positionBuffer as the one to apply buffer
  // operations to from here out.

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Now create an array of positions for the triangle.

  const positions = [
    -1.0, -0.57, -0.5,
     1.0, -0.57, -0.5,
     0,    0.86, -0.5,
  ];

  // Now pass the list of positions into WebGL to build the
  // shape. We do this by creating a Float32Array from the
  // JavaScript array, then use it to fill the current buffer.

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Convert the array of colors into a table for all the vertices.

  var colors = [
      1, 0, 0, 1,
      0, 1, 0, 1,
      0, 0, 0, 1,
  ];

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);


  return {
    position: positionBuffer,
    color: colorBuffer,
  };
}


// entry point for WebVR, called by vrCallback()
function renderVR(gl, programInfo, buffers, deltaTime) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.5, 0.5, 0.5, 1.0);  // Clear to grey, fully opaque
    gl.clearDepth(1.0);                 // Clear everything
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    cubeRotation += deltaTime;
    let pose = xr_frame.getViewerPose(xrReferenceSpace);

    for (eye of pose.views) {
      renderEye(gl, programInfo, buffers, eye)
    }
}

// entry point for non-WebVR rendering
// called by whatever mechanism (likely keyboard/mouse events)
// you used before to trigger redraws
function render(gl, programInfo, buffers, deltaTime) {
    gl.clearColor(0.5, 0.5, 0.5, 1.0);  // Clear to grey, fully opaque
    gl.clearDepth(1.0);                 // Clear everything
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    const fieldOfView = 45 * Math.PI / 180;   // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    mat4.perspective(projectionMatrix,
                     fieldOfView,
                     aspect,
                     zNear,
                     zFar);

    // In non-VR mode the triangle just rotates,
    // so we make that part of the view matrix
    viewMatrix = mat4.create();


    cubeRotation += deltaTime;


    drawScene(gl, programInfo, buffers, projectionMatrix, viewMatrix);
}

function renderEye(gl, programInfo, buffers, eye) {
    let width = canvas.width;
    let height = canvas.height;
    let projection, view;
    let vp = xrSession.renderState.baseLayer.getViewport(eye);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    projection = eye.projectionMatrix;
    view = eye.transform.inverse.matrix;

    // choose which half of the canvas to draw on
    // if (isLeft) {
    //     gl.viewport(0, 0, width / 2, height);
    //     projection = frameData.leftProjectionMatrix;
    //     view = frameData.leftViewMatrix;
    // } else {
    //     gl.viewport(width / 2, 0, width / 2, height);
    //     projection = frameData.rightProjectionMatrix;
    //     view = frameData.rightViewMatrix;
    // }
    // we don't want auto-rotation in VR mode, so we directly
    // use the view matrix
    drawScene(gl, programInfo, buffers, projection, view);
}

//
// Draw the scene.
//
function drawScene(gl, programInfo, buffers, projectionMatrix, viewMatrix) {


  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  const modelViewMatrix = mat4.create();


  // Now move the drawing position a bit to where we want to
  // start drawing the square.

  mat4.translate(modelViewMatrix,     // destination matrix
                 modelViewMatrix,     // matrix to translate
                 [-0.0, 0.0, -6.0]);  // amount to translate

  mat4.rotate(modelViewMatrix,  // destination matrix
              modelViewMatrix,  // matrix to rotate
              cubeRotation,     // amount to rotate in radians
              [0, 0, 1]);       // axis to rotate around (Z)
  mat4.rotate(modelViewMatrix,  // destination matrix
              modelViewMatrix,  // matrix to rotate
              cubeRotation * .7     ,// amount to rotate in radians
              [0, 1, 0]);       // axis to rotate around (X)

  // Premultiply the view matrix
  mat4.multiply(modelViewMatrix, viewMatrix, modelViewMatrix);


  // Tell WebGL how to pull out the positions from the position
  // buffer into the vertexPosition attribute
  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
  }

  // Tell WebGL how to pull out the colors from the color buffer
  // into the vertexColor attribute.
  {
    const numComponents = 4;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexColor,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexColor);
  }

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);

  // Set the shader uniforms

  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);

  {
    const vertexCount = 3;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawArrays(gl.TRIANGLES, offset, vertexCount);
  }

}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

