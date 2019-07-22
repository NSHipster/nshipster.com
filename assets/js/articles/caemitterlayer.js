// Credit: https://jsfiddle.net/subzey/52sowezj/

'use strict';

(function() {
var canvas = document.querySelector('#webgl-confetti canvas');
var gl = canvas.getContext('webgl', {alpha: true});

var vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, `
precision lowp float;

attribute vec2 a_position;
attribute float a_startAngle;
attribute float a_angularVelocity;
attribute float a_rotationAxisAngle;
attribute float a_particleDistance;
attribute float a_particleAngle;
attribute float a_particleY;
uniform float u_time;

varying vec2 v_position;
varying vec3 v_color;
varying float v_overlight;

void main() {
  float angle = a_startAngle + a_angularVelocity * u_time;
  float vertPosition = 1.1 - mod(u_time * .25 + a_particleY, 2.2);
  float viewAngle = a_particleAngle + mod(u_time * .25, 6.28);

  mat4 vMatrix = mat4(1.3, 0.0, 0.0, 0.0, 0.0, 1.3, 0.0, 0.0, 0.0, 0.0, 1.0,
                      1.0, 0.0, 0.0, 0.0, 1.0);

  mat4 shiftMatrix =
      mat4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0,
           a_particleDistance * sin(viewAngle), vertPosition,
           a_particleDistance * cos(viewAngle), 1.0);

  mat4 pMatrix = mat4(cos(a_rotationAxisAngle), sin(a_rotationAxisAngle), 0.0,
                      0.0, -sin(a_rotationAxisAngle), cos(a_rotationAxisAngle),
                      0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0) *
                 mat4(1.0, 0.0, 0.0, 0.0, 0.0, cos(angle), sin(angle), 0.0, 0.0,
                      -sin(angle), cos(angle), 0.0, 0.0, 0.0, 0.0, 1.0);

  gl_Position =
      vMatrix * shiftMatrix * pMatrix * vec4(a_position * 0.03, 0.0, 1.0);
  vec4 normal = vec4(0.0, 0.0, 1.0, 0.0);
  vec4 transformedNormal = normalize(pMatrix * normal);

  float dotNormal = abs(dot(normal.xyz, transformedNormal.xyz));
  float regularLighting = dotNormal / 2.0 + 0.5;
  float glanceLighting = smoothstep(0.92, 0.98, dotNormal);
  v_color = vec3(mix((0.5 - transformedNormal.z / 2.0) * regularLighting, 1.0,
                     glanceLighting),
                 mix(0.5 * regularLighting, 1.0, glanceLighting),
                 mix((0.5 + transformedNormal.z / 2.0) * regularLighting, 1.0,
                     glanceLighting));

  v_position = a_position;
  v_overlight = 0.9 + glanceLighting * 0.1;
}
`);
gl.compileShader(vertexShader);

var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, `
precision lowp float;
varying vec2 v_position;
varying vec3 v_color;
varying float v_overlight;

void main() {
  gl_FragColor =
      vec4(v_color, 1.0 - smoothstep(0.8, v_overlight, length(v_position)));
}
`);
gl.compileShader(fragmentShader);

var shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);
gl.useProgram(shaderProgram);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());

var STRIDE = 8;
var attrs = [
  {name: 'a_position', length: 2, offset: 0},
  {name: 'a_startAngle', length: 1, offset: 2},
  {name: 'a_angularVelocity', length: 1, offset: 3},
  {name: 'a_rotationAxisAngle', length: 1, offset: 4},
  {name: 'a_particleDistance', length: 1, offset: 5},
  {name: 'a_particleAngle', length: 1, offset: 6},
  {name: 'a_particleY', length: 1, offset: 7}
];
for (var i = 0; i < attrs.length; i++) {
  var name = attrs[i].name;
  var length = attrs[i].length;
  var offset = attrs[i].offset;
  var attribLocation = gl.getAttribLocation(shaderProgram, name);
  gl.vertexAttribPointer(
      attribLocation, length, gl.FLOAT, false, STRIDE * 4, offset * 4);
  gl.enableVertexAttribArray(attribLocation);
}

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());

var NUM_PARTICLES = 150;
var NUM_VERTICES = 4;
var NUM_INDICES = 6;

var vertices = new Float32Array(NUM_PARTICLES * STRIDE * NUM_VERTICES);
var indices = new Uint16Array(NUM_PARTICLES * NUM_INDICES);
for (var i = 0; i < NUM_PARTICLES; i++) {
  var axisAngle = Math.random() * Math.PI * 2;
  var startAngle = Math.random() * Math.PI * 2;
  var groupPtr = i * STRIDE * NUM_VERTICES;

  var particleDistance = Math.sqrt(Math.random());
  var particleAngle = Math.random() * Math.PI * 2;
  var particleY = Math.random() * 2.2;
  var angularVelocity = Math.random() * 2 + 1;

  for (var j = 0; j < 4; j++) {
    var vertexPtr = groupPtr + j * STRIDE;
    vertices[vertexPtr + 2] = startAngle;
    vertices[vertexPtr + 3] = angularVelocity;
    vertices[vertexPtr + 4] = axisAngle;
    vertices[vertexPtr + 5] = particleDistance;
    vertices[vertexPtr + 6] = particleAngle;
    vertices[vertexPtr + 7] = particleY;
  }

  vertices[groupPtr] = vertices[groupPtr + STRIDE * 2] = -1;
  vertices[groupPtr + STRIDE] = vertices[groupPtr + STRIDE * 3] = 1;
  vertices[groupPtr + 1] = vertices[groupPtr + STRIDE + 1] = -1;
  vertices[groupPtr + STRIDE * 2 + 1] = vertices[groupPtr + STRIDE * 3 + 1] = 1;

  var indicesPtr = i * NUM_INDICES;
  var vertexPtr = i * NUM_VERTICES;
  indices[indicesPtr] = vertexPtr;
  indices[indicesPtr + 4] = indices[indicesPtr + 1] = vertexPtr + 1;
  indices[indicesPtr + 3] = indices[indicesPtr + 2] = vertexPtr + 2;
  indices[indicesPtr + 5] = vertexPtr + 3;
}

gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

var timeUniformLocation = gl.getUniformLocation(shaderProgram, 'u_time');
var startTime = (window.performance || Date).now();
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
gl.viewport(0, 0, canvas.width, canvas.height);

function frame() {
  gl.uniform1f(
      timeUniformLocation,
      ((window.performance || Date).now() - startTime) / 1000);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(
      gl.TRIANGLES, NUM_INDICES * NUM_PARTICLES, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(frame);
}

frame();
})();
