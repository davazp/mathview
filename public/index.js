"use strict";

// User interface

var meter = new FPSMeter({heat: 1, graph: 1, left: 'auto', right: 0});
meter.pause();

function evaluate (code) {
  var geval = eval;
  tick = 0;

  var lines = code.split('\n');
  for (var i=0; i<lines.length; i++)
    console.log(GLSLcompile(lines[i]));

  // geval(code);
  draw();
}

var cm = CodeMirror(document.getElementById('editor'), {
  value: localStorage.getItem('editor') || "// Welcome\n\n",
  mode: "javascript",
  autofocus: true,
  theme: 'vibrant-ink',
  keyMap: 'emacs',
  lineWrapping: true,
  extraKeys: {
    "Alt-Enter": function(cm) {
      var code = cm.getValue();
      evaluate(code);
    }
  }
});

// The editor should not loose the focus
cm.on('blur', function(){ 
  setTimeout(function(){ cm.focus(); }, 0); 
});

cm.on('change', function(){
  localStorage.setItem('editor', cm.getValue());
});


var canvas = document.getElementById('canvas');

canvas.width = canvas.height = Math.min(window.innerWidth, window.innerHeight);
canvas.style.position = 'fixed';
canvas.style.top = (window.innerHeight - canvas.height)/2 + 'px';
canvas.style.right = '0px';

cm.setSize(window.innerWidth-canvas.width, '100%');

canvas.addEventListener('click', toggleAnimation);

canvas.addEventListener('wheel', function(event){
  var p = 1 - event.wheelDeltaY/12000;
  mat4.scale(transformationMatrix, transformationMatrix, [p, p, p]);

  var a = event.wheelDeltaX/12000;
  mat4.rotateZ(transformationMatrix, transformationMatrix, a);

  updateTransformationMatrix();
  draw();
});

// WebGL Initialization

var glopts = {
  antialias: true,
  preserveDrawingBuffer: true
};

var gl = canvas.getContext('webgl', glopts)
    ||   canvas.getContext('webgl-experimental', glopts)
    ||   canvas.getContext('moz-webgl', glopts);

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

// Shaders

function getShaderSource (id) {
  return document.getElementById(id).text;
}

var vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, getShaderSource('vertex-shader'));
gl.compileShader(vertexShader);

var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, getShaderSource('fragment-shader'));
gl.compileShader(fragmentShader);

var program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);


// Function

function generateMesh (options){
  var h=0.0001;

  var data = [];
  var indices = [];

  var xfrom = options.x.from;
  var yfrom = options.y.from;
  var xto = options.x.to;
  var yto = options.y.to;
  var xstep = options.x.step;
  var ystep = options.y.step;

  var width = (xto - xfrom) / xstep;
  var height = (yto - yfrom) / ystep;

  for (var n=0, x=xfrom; n<width; n++, x+=xstep){
    for (var m=0, y=yfrom; m<height; m++, y+=ystep){
      data.push(x);
      data.push(y);

      if (m<height-1 && n<width-1){
        indices.push(n*height + m);
        indices.push(n*height + m+1);
        indices.push((n+1)*height + m+1);

        indices.push(n*height + m);
        indices.push((n+1)*height + m+1);
        indices.push((n+1)*height + m);
      }

    }
  }

  return {data: data, indices: indices};
}


// Buffers

var buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

var aPosition = gl.getAttribLocation(program, 'aPosition');
if (aPosition >= 0){
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
}

var indicesBuffer = gl.createBuffer();


// Plotting

var meshLength;

(function(mesh){
  meshLength = mesh.indices.length;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.data), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.DYNAMIC_DRAW);
})(generateMesh({
  x: {from: -10, to: 10, step: 0.1},
  y: {from: -10, to: 10, step: 0.1}
}));




// Uniforms

// Set the most usual mathematical frame of reference
var transformationMatrix = mat4.clone([
  0, 0, 1, 0,
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 0, 1
]);
var uTransformationMatrix = gl.getUniformLocation(program, 'uTransformationMatrix');

function updateTransformationMatrix() {
  gl.uniformMatrix4fv(uTransformationMatrix, false, transformationMatrix);
}
updateTransformationMatrix();


var resolution = gl.getUniformLocation(program, 'uResolution');
gl.uniform2f(resolution, canvas.width, canvas.height);

var tick = 0;
var uTime = gl.getUniformLocation(program, 'uTime');
gl.uniform1f(uTime, 0.0);

var animationFrame;

mat4.scale(transformationMatrix, transformationMatrix, [0.1, 0.1, 0.1]);
mat4.rotateY(transformationMatrix, transformationMatrix, -0.5);

function draw () {
  updateTransformationMatrix();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, meshLength, gl.UNSIGNED_SHORT, 0);
}

function animate(){
  meter.tickStart();
  tick += 0.1;
  gl.uniform1f(uTime, tick);
  draw();
  animationFrame = requestAnimationFrame(animate);
  meter.tick();
}

function toggleAnimation () {
  if (animationFrame){
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    meter.pause();
  } else {
    meter.resume();
    animate();
  }
}


evaluate(cm.getValue());
