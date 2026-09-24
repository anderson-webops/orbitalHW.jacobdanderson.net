(() => {
    "use strict";
    const root = document.getElementById("solar-acceleration-app");
    if (!root || root.dataset.initialized === "true") return;
    root.dataset.initialized = "true";
    const byId = id => root.querySelector("#" + id);
    const initial = Object.freeze({ theta: 35, phi: 80 });
    const state = { ...initial };
    const imported = new URLSearchParams(location.search);
    const incoming = ['theta', 'phi'].map(key => imported.get(key));
    const validImport = incoming.every(value => value !== null && value.trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 180);
    if (validImport) {
      state.theta = Math.round(Number(incoming[0]));
      state.phi = Math.round(Number(incoming[1]));
      document.getElementById('solar-import-status').textContent = 'Imported from orbit, rounded to the nearest degree. Edit the angles to explore independently.';
    } else if (incoming.some(value => value !== null)) {
      document.getElementById('solar-import-status').textContent = 'Invalid imported angles ignored. Showing the default example.';
    }
    const center = { x: 280, y: 239 };
    const orbitRadius = 112;
    const accelerationScale = 155;
    const rad = degrees => degrees * Math.PI / 180;
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const clean = n => Math.abs(n) < 1e-12 ? 0 : n;
    const signed = n => (clean(n) > 0 ? "+" : clean(n) < 0 ? "−" : "") + Math.abs(clean(n)).toFixed(4);
    const degreesText = n => String(clean(n)).replace("-", "−") + "°";
    const formatOperand = n => n < 0 ? "(" + degreesText(n) + ")" : degreesText(n);

    /** Equivalent angle in [-180, 180], preserving +180 for positive turns. */
    function wrapAngle(value) {
      const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
      return clean(wrapped === -180 && value > 0 ? 180 : wrapped);
    }
    /** SVG y points downward; physical positive angles are counterclockwise. */
    function point(origin, angle, length) {
      return { x: origin.x + length * Math.cos(rad(angle)), y: origin.y - length * Math.sin(rad(angle)) };
    }
    function line(id, start, end) {
      const element = byId(id);
      element.setAttribute("x1", start.x.toFixed(4));
      element.setAttribute("y1", start.y.toFixed(4));
      element.setAttribute("x2", end.x.toFixed(4));
      element.setAttribute("y2", end.y.toFixed(4));
    }
    function textPosition(id, x, y, anchor = "middle") {
      const element = byId(id);
      element.setAttribute("x", x.toFixed(2));
      element.setAttribute("y", y.toFixed(2));
      element.setAttribute("text-anchor", anchor);
    }
    function visible(id, show) { byId(id).setAttribute("visibility", show ? "visible" : "hidden"); }
    function arc(origin, radius, startAngle, deltaAngle) {
      if (Math.abs(deltaAngle) < 0.001) return "";
      const start = point(origin, startAngle, radius);
      const end = point(origin, startAngle + deltaAngle, radius);
      return `M${start.x} ${start.y} A${radius} ${radius} 0 ${Math.abs(deltaAngle) > 180 ? 1 : 0} ${deltaAngle >= 0 ? 0 : 1} ${end.x} ${end.y}`;
    }

    /**
     * Nudge only the endpoint labels when their bounding boxes overlap.
     * All arrows and projections keep their exact calculated coordinates.
     */
    function separateLabels(ids, margin = 7) {
      const bounds = { left: 14, right: 546, top: 16, bottom: 450 };
      // Reserve the fixed axis labels and Earth before placing moving labels.
      const svg = byId(ids[0]).ownerSVGElement;
      const placed = Array.from(svg.querySelectorAll('text'))
        .filter(label => !ids.includes(label.id))
        .map(label => label.getBBox());
      const offsets = [[0, 0]];
      // Prefer nearby vertical shifts, then horizontal/diagonal alternatives.
      for (const distance of [22, 44, 66, 88]) {
        offsets.push([0, -distance], [0, distance], [-distance, 0], [distance, 0],
          [-distance, -distance], [distance, -distance], [-distance, distance], [distance, distance]);
      }
      for (const id of ids) {
        const element = byId(id);
        const original = element.getBBox();
        const originalX = Number(element.getAttribute("x"));
        const originalY = Number(element.getAttribute("y"));
        let best = null;
        for (const [offsetX, offsetY] of offsets) {
          const x = clamp(original.x + offsetX, bounds.left, bounds.right - original.width);
          const y = clamp(original.y + offsetY, bounds.top, bounds.bottom - original.height);
          const candidate = { x, y, width: original.width, height: original.height };
          const dx = x - original.x, dy = y - original.y;
          let penalty = dx * dx + dy * dy;
          for (const other of placed) {
            const overlapX = Math.min(x + candidate.width, other.x + other.width) - Math.max(x, other.x) + margin;
            const overlapY = Math.min(y + candidate.height, other.y + other.height) - Math.max(y, other.y) + margin;
            if (overlapX > 0 && overlapY > 0) penalty += 100000 + overlapX * overlapY * 100;
          }
          if (!best || penalty < best.penalty) best = { penalty, dx, dy, box: candidate };
        }
        element.setAttribute("x", (originalX + best.dx).toFixed(2));
        element.setAttribute("y", (originalY + best.dy).toFixed(2));
        placed.push(best.box);
      }
    }

    function sizeDiagramLabels(id) {
      const svg = byId(id);
      const scale = Math.min(1, Math.abs(svg.getScreenCTM()?.a || 1));
      svg.style.setProperty('--diagram-label-size', `${16 / scale}px`);
      svg.style.setProperty('--diagram-small-size', `${14 / scale}px`);
    }

    function drawFixedFrame() {
      sizeDiagramLabels('fixed-svg');
      const sat = point(center, state.theta, orbitRadius);
      const radialEnd = point(sat, state.theta, 75);
      const tangentEnd = point(sat, state.theta + 90, 75);
      const solarEnd = point(sat, state.phi, 108);
      line("earth-to-satellite", center, sat);
      line("fixed-phi-ray", center, point(center, state.phi, 160));
      line("fixed-radial-axis", sat, radialEnd);
      line("fixed-tangent-axis", sat, tangentEnd);
      line("fixed-solar-vector", sat, solarEnd);
      byId("fixed-satellite").setAttribute("cx", sat.x);
      byId("fixed-satellite").setAttribute("cy", sat.y);
      byId("fixed-theta-arc").setAttribute("d", arc(center, 49, 0, state.theta));
      byId("fixed-phi-arc").setAttribute("d", arc(center, 74, 0, state.phi));
      const thetaLabel = point(center, state.theta / 2, 60);
      const phiLabel = point(center, state.phi / 2, 91);
      textPosition("fixed-theta-label", thetaLabel.x, thetaLabel.y + (state.theta >= 0 ? -2 : 13));
      textPosition("fixed-phi-label", phiLabel.x, phiLabel.y + (state.phi >= 0 ? -2 : 13));
      const radialLabel = point(sat, state.theta, 95);
      const tangentLabel = point(sat, state.theta + 90, 95);
      const solarLabel = point(sat, state.phi, 133);
      textPosition("fixed-radial-label", radialLabel.x, radialLabel.y + 5);
      textPosition("fixed-tangent-label", tangentLabel.x, tangentLabel.y + 5);
      textPosition("fixed-solar-label", solarLabel.x, solarLabel.y + 5);
      // The satellite label sits to one side of the inward radial segment.
      const satelliteLabel = point(sat, state.theta - 67, 28);
      textPosition("fixed-satellite-label", satelliteLabel.x, satelliteLabel.y + 5, "start");
      separateLabels(["fixed-solar-label", "fixed-radial-label", "fixed-tangent-label", "fixed-satellite-label", "fixed-theta-label", "fixed-phi-label"]);
      byId("fixed-description").textContent = `Satellite angle ${state.theta} degrees. Solar acceleration direction ${state.phi} degrees from fixed positive x. The outward radial direction follows the Earth-to-satellite line. Positive tangential is 90 degrees counterclockwise from radial. The dashed orange ray is a parallel direction reference, not another acceleration.`;
    }

    function drawLocalFrame(relative, ar, at) {
      sizeDiagramLabels('local-svg');
      // Shared scale is essential: R + T = A exactly, before display rounding.
      const R = { x: center.x + accelerationScale * ar, y: center.y };
      const T = { x: center.x, y: center.y - accelerationScale * at };
      const A = { x: R.x, y: T.y };
      line("local-radial-component", center, R);
      line("local-tangent-component", center, T);
      line("local-solar-vector", center, A);
      line("radial-guide", R, A);
      line("tangent-guide", T, A);
      byId("component-area").setAttribute("d", `M${center.x} ${center.y} L${R.x} ${R.y} L${A.x} ${A.y} L${T.x} ${T.y} Z`);
      visible("local-radial-component", Math.abs(ar) > 1e-10);
      visible("local-tangent-component", Math.abs(at) > 1e-10);
      const hasTriangle = Math.abs(ar) > .08 && Math.abs(at) > .08;
      visible("radial-guide", Math.abs(ar * at) > 1e-10);
      visible("tangent-guide", Math.abs(ar * at) > 1e-10);
      visible("right-angle", hasTriangle);
      const sx = Math.sign(ar) || 1, sy = -(Math.sign(at) || 1);
      byId("right-angle").setAttribute("d", `M${R.x - sx * 10} ${R.y} L${R.x - sx * 10} ${R.y + sy * 10} L${R.x} ${R.y + sy * 10}`);
      byId("relative-arc").setAttribute("d", arc(center, 46, 0, relative));
      const relativeLabel = point(center, relative / 2, 72);
      byId("relative-label").textContent = relative === 0 ? "δ = 0°" : "δ";
      textPosition("relative-label", relativeLabel.x, relativeLabel.y + (relative === 0 ? -14 : 5));

      // Keep component labels on the side opposite their projection rectangle.
      const radialLabelX = Math.abs(ar) < .26 ? center.x + sx * 52 : (center.x + R.x) / 2;
      const tangentLabelY = Math.abs(at) < .26 ? center.y + sy * 53 : (center.y + T.y) / 2;
      byId("local-radial-label").textContent = Math.abs(ar) < 1e-10 ? "a_r = 0" : "a_r";
      byId("local-tangent-label").textContent = Math.abs(at) < 1e-10 ? "a_θ = 0" : "a_θ";
      textPosition("local-radial-label", radialLabelX, center.y + (at >= 0 ? 28 : -18));
      textPosition("local-tangent-label", center.x + (ar >= 0 ? -19 : 19), tangentLabelY + 5, ar >= 0 ? "end" : "start");
      const solarLabel = point(center, relative, 181);
      textPosition("local-solar-label", solarLabel.x, solarLabel.y + 5);
      const originLabelX = center.x + (ar >= 0 ? -14 : 14);
      const originLabelY = center.y + (at >= 0 ? 25 : -15);
      textPosition("local-origin-label", originLabelX, originLabelY, ar >= 0 ? "end" : "start");
      separateLabels(["local-solar-label", "local-radial-label", "local-tangent-label", "local-origin-label", "relative-label"]);
      byId("local-description").textContent = `The same vector in satellite-centered coordinates, rotated by minus theta. Relative angle ${relative} degrees. Normalized radial component ${signed(ar)}. Normalized tangential component ${signed(at)}. Dashed perpendicular guides join the component endpoints to the solar vector tip.`;
    }

    function render() {
      const raw = state.phi - state.theta;
      const relative = wrapAngle(raw);
      const ar = clean(Math.cos(rad(raw)));
      const at = clean(Math.sin(rad(raw)));
      for (const key of ["theta", "phi"]) {
        byId(key + "-slider").value = state[key];
        byId(key + "-number").value = state[key];
        byId(key + "-slider").setAttribute("aria-valuetext", state[key] + " degrees");
      }
      byId("relative-value").textContent = degreesText(relative);
      byId("relative-arithmetic").textContent = `${degreesText(state.phi)} − ${formatOperand(state.theta)} = ${degreesText(raw)}`;
      let relativeNote = relative === 0 ? "Exactly aligned with outward radial."
        : Math.abs(relative) === 180 ? "Exactly opposite outward radial."
        : `${Math.abs(relative)}° ${relative > 0 ? "counterclockwise" : "clockwise"} from outward radial.`;
      if (raw !== relative) relativeNote = `${degreesText(raw)} is equivalent to ${degreesText(relative)}. ` + relativeNote;
      byId("relative-note").textContent = relativeNote;
      byId("radial-value").textContent = signed(ar);
      byId("tangent-value").textContent = signed(at);
      byId("radial-note").textContent = ar > 0 ? "Positive: away from Earth." : ar < 0 ? "Negative: toward Earth." : "No radial component.";
      byId("tangent-note").textContent = at > 0 ? "Positive: toward increasing θ." : at < 0 ? "Negative: toward decreasing θ." : "No tangential component.";
      root.querySelectorAll("[data-relative]").forEach(button => {
        const difference = wrapAngle(relative - Number(button.dataset.relative));
        button.setAttribute("aria-pressed", String(Math.abs(difference) < 1e-9));
      });
      drawFixedFrame();
      drawLocalFrame(relative, ar, at);
      byId("accessible-result").textContent = `Relative angle ${relative} degrees. Radial fraction ${signed(ar)}. Tangential fraction ${signed(at)}.`;
    }

    function setAngle(key, rawValue) {
      const parsed = String(rawValue).trim() === "" ? NaN : Number(rawValue);
      if (!Number.isFinite(parsed)) {
        byId(key + "-number").value = state[key];
        byId("control-feedback").textContent = "Enter an angle between −180° and 180°. The previous value has been kept.";
        return;
      }
      const angle = clamp(Math.round(parsed), -180, 180);
      state[key] = angle;
      byId("control-feedback").textContent = parsed !== angle
        ? `The angle was adjusted to ${degreesText(angle)}. Controls use whole degrees from −180° to 180°.`
        : "Presets keep θ fixed and change the acceleration direction φ.";
      render();
    }

    for (const key of ["theta", "phi"]) {
      const slider = byId(key + "-slider");
      const number = byId(key + "-number");
      slider.addEventListener("input", () => setAngle(key, slider.value));
      number.addEventListener("change", () => setAngle(key, number.value));
      number.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); setAngle(key, number.value); }
      });
    }
    root.querySelectorAll("[data-relative]").forEach(button => {
      button.addEventListener("click", () => {
        state.phi = wrapAngle(state.theta + Number(button.dataset.relative));
        byId("control-feedback").textContent = "θ stayed fixed. φ was changed to set the chosen relative angle.";
        render();
      });
    });
    byId("reset").addEventListener("click", () => {
      Object.assign(state, initial);
      byId("control-feedback").textContent = "Reset to θ = 35° and φ = 80°. Relative angle = 45°.";
      render();
    });

    let diagramWidth = 0;
    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (Math.abs(width - diagramWidth) > .5) {
        diagramWidth = width;
        render();
      }
    }).observe(root);

    // Render before enabling controls. Without JavaScript the SVG starting frame remains useful.
    render();
    root.querySelectorAll("input, button").forEach(control => { control.disabled = false; });
    byId("control-feedback").textContent = "Presets keep θ fixed and change the acceleration direction φ.";
  })();
