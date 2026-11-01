// Upload the envelope once. Seeking and scrolling change two uniforms, rather
// than rasterising and uploading a multi-screen bitmap on the UI thread.
export function wavePainter(
  canvas: HTMLCanvasElement,
  values: number[],
  step: number,
  origin: number,
  normal: number,
  color: string,
  width: number,
  height: number,
) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: false });
  const center = (height - 30) / 2,
    available = Math.max(8, height - 62);
  const firstAt = (start: number) => Math.max(0, Math.floor((start - origin) / step) - 1);
  const lastAt = (end: number) => Math.min(values.length - 1, Math.ceil((end - origin) / step) + 1);
  if (!gl) {
    const ctx = canvas.getContext('2d')!;
    return {
      draw(start: number, window: number) {
        ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const first = firstAt(start),
          last = lastAt(start + window);
        const x = (i: number) => ((origin + (i + 0.5) * step - start) / window) * width;
        const h = (i: number) => (Math.min(1, Math.abs(values[i]) / normal) * available) / 2;
        ctx.beginPath();
        for (let i = first; i <= last; i++) {
          if (i === first) ctx.moveTo(x(i), center - h(i));
          else ctx.lineTo(x(i), center - h(i));
        }
        for (let i = last; i >= first; i--) ctx.lineTo(x(i), center + h(i));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.fill();
      },
      dispose() {},
    };
  }
  const shader = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const vertex = shader(
      gl.VERTEX_SHADER,
      `
    attribute vec2 point;
    uniform vec2 view;
    void main() { gl_Position = vec4((point.x-view.x)/view.y*2.0-1.0,point.y,0.0,1.0); }
  `,
    ),
    fragment = shader(
      gl.FRAGMENT_SHADER,
      `
    precision mediump float;
    uniform vec4 color;
    void main() { gl_FragColor = color; }
  `,
    );
  const program = gl.createProgram()!,
    buffer = gl.createBuffer()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const vertices = new Float32Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const x = origin + (i + 0.5) * step,
      h = (Math.min(1, Math.abs(values[i]) / normal) * available) / 2;
    vertices.set([x, 1 - ((center - h) / height) * 2, x, 1 - ((center + h) / height) * 2], i * 4);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const point = gl.getAttribLocation(program, 'point'),
    view = gl.getUniformLocation(program, 'view');
  // Resolve CSS colours once, including light-theme palette substitutions.
  const swatch = document.createElement('canvas').getContext('2d')!;
  swatch.fillStyle = color;
  swatch.fillRect(0, 0, 1, 1);
  const rgba = swatch.getImageData(0, 0, 1, 1).data;
  gl.useProgram(program);
  gl.uniform4f(
    gl.getUniformLocation(program, 'color'),
    rgba[0] / 255,
    rgba[1] / 255,
    rgba[2] / 255,
    0.75,
  );
  return {
    draw(start: number, window: number) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(point);
      gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(view, start, window);
      const first = firstAt(start),
        last = lastAt(start + window);
      if (last > first) gl.drawArrays(gl.TRIANGLE_STRIP, first * 2, (last - first + 1) * 2);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
