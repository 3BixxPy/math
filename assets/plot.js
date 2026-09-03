/* =========================================================================
   Math Curriculum — coordinate-plane plotting helper
   Every graph is produced by sampling a real JS function and mapping
   data coordinates to pixels — nothing is hand-plotted — so a graph is
   as trustworthy as the equation that generated it. Vanilla JS, no deps.
   ========================================================================= */

const MCPlot = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function mapper(opts) {
    const { xMin, xMax, yMin, yMax, width, height, pad } = opts;
    const px = (x) => pad + ((x - xMin) / (xMax - xMin)) * (width - 2 * pad);
    const py = (y) => height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);
    return { px, py };
  }

  // Clears and redraws axes + grid; returns {px, py} for further plotting.
  function drawAxes(svg, opts) {
    const { xMin, xMax, yMin, yMax, xStep = 1, yStep = 1 } = opts;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const { px, py } = mapper(opts);
    const grid = el("g", {});
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep) {
      if (Math.abs(x) < 1e-9) continue;
      grid.appendChild(el("line", { x1: px(x), y1: py(yMin), x2: px(x), y2: py(yMax), class: "plot-grid" }));
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep) {
      if (Math.abs(y) < 1e-9) continue;
      grid.appendChild(el("line", { x1: px(xMin), y1: py(y), x2: px(xMax), y2: py(y), class: "plot-grid" }));
    }
    svg.appendChild(grid);

    const axes = el("g", {});
    axes.appendChild(el("line", { x1: px(xMin), y1: py(0), x2: px(xMax), y2: py(0), class: "plot-axis" }));
    axes.appendChild(el("line", { x1: px(0), y1: py(yMin), x2: px(0), y2: py(yMax), class: "plot-axis" }));
    svg.appendChild(axes);

    const labels = el("g", {});
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep) {
      if (Math.abs(x) < 1e-9) continue;
      const t = el("text", { x: px(x), y: py(0) + 13, class: "plot-label", "text-anchor": "middle" });
      t.textContent = Number(x.toFixed(4));
      labels.appendChild(t);
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep) {
      if (Math.abs(y) < 1e-9) continue;
      const t = el("text", { x: px(0) - 6, y: py(y) + 3, class: "plot-label", "text-anchor": "end" });
      t.textContent = Number(y.toFixed(4));
      labels.appendChild(t);
    }
    const origin = el("text", { x: px(0) - 6, y: py(0) + 13, class: "plot-label", "text-anchor": "end" });
    origin.textContent = "0";
    labels.appendChild(origin);
    svg.appendChild(labels);

    return { px, py };
  }

  // Samples fn(x) across [xMin,xMax]; breaks the path wherever the value
  // leaves the visible range (handles asymptotes/discontinuities cleanly).
  function plotFunction(svg, fn, opts, cls) {
    const { xMin, xMax, yMin, yMax, samples = 260 } = opts;
    const { px, py } = mapper(opts);
    const pad = (yMax - yMin) * 0.6;
    let d = "";
    let drawing = false;
    for (let i = 0; i <= samples; i++) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      let y;
      try {
        y = fn(x);
      } catch (e) {
        y = NaN;
      }
      if (typeof y !== "number" || !isFinite(y) || y < yMin - pad || y > yMax + pad) {
        drawing = false;
        continue;
      }
      d += (drawing ? "L " : "M ") + px(x).toFixed(1) + " " + py(y).toFixed(1) + " ";
      drawing = true;
    }
    const path = el("path", { d: d.trim(), class: cls || "plot-curve" });
    svg.appendChild(path);
    return path;
  }

  function plotPoints(svg, points, opts, cls) {
    const { px, py } = mapper(opts);
    const g = el("g", {});
    points.forEach(([x, y]) => {
      g.appendChild(el("circle", { cx: px(x), cy: py(y), r: 4, class: cls || "plot-point" }));
    });
    svg.appendChild(g);
    return g;
  }

  function dashedLine(svg, x1, y1, x2, y2, opts, cls) {
    const { px, py } = mapper(opts);
    const line = el("line", { x1: px(x1), y1: py(y1), x2: px(x2), y2: py(y2), class: cls || "plot-dashed" });
    svg.appendChild(line);
    return line;
  }

  return { el, mapper, drawAxes, plotFunction, plotPoints, dashedLine };
})();
