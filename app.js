/*
  NeoPixel Bluetooth Controller
  Protocol sent to Arduino Nano:
  RRRGGGBBB

  Example:
  R=11, G=22, B=255  -> 011022255

  IMPORTANT:
  The browser side sends ordinary RGB values. The Nano's existing
  working code remains responsible for converting RGB -> GRB for
  your NeoPixel strip.
*/

const state = {
  port: null,
  reader: null,
  writer: null,
  connected: false,
  r: 255,
  g: 0,
  b: 0,
  brightness: 255
};

const els = {
  canvas: document.getElementById("colorWheel"),
  marker: document.getElementById("wheelMarker"),
  preview: document.getElementById("preview"),

  red: document.getElementById("red"),
  green: document.getElementById("green"),
  blue: document.getElementById("blue"),

  redRange: document.getElementById("redRange"),
  greenRange: document.getElementById("greenRange"),
  blueRange: document.getElementById("blueRange"),

  brightness: document.getElementById("brightness"),
  brightnessValue: document.getElementById("brightnessValue"),

  rgbText: document.getElementById("rgbText"),
  serialText: document.getElementById("serialText"),

  connectBtn: document.getElementById("connectBtn"),
  chooseColorBtn: document.getElementById("chooseColorBtn"),
  offBtn: document.getElementById("offBtn"),

  status: document.getElementById("status"),
  statusText: document.getElementById("statusText"),

  log: document.getElementById("log"),
  clearLogBtn: document.getElementById("clearLogBtn")
};

const ctx = els.canvas.getContext("2d");
const TAU = Math.PI * 2;

/* ---------- Color helpers ---------- */

function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function pad3(value) {
  return String(clamp(value)).padStart(3, "0");
}

function makeSerialValue(r, g, b) {
  return `${pad3(r)}${pad3(g)}${pad3(b)}`;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b]
    .map(v => Math.round(v).toString(16).padStart(2, "0"))
    .join("");
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;

  let r1 = 0, g1 = 0, b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255)
  ];
}

function setStateFromRGB(r, g, b, updateWheel = true) {
  state.r = Math.round(clamp(r));
  state.g = Math.round(clamp(g));
  state.b = Math.round(clamp(b));

  els.red.value = state.r;
  els.green.value = state.g;
  els.blue.value = state.b;

  els.redRange.value = state.r;
  els.greenRange.value = state.g;
  els.blueRange.value = state.b;

  updateReadouts();

  if (updateWheel) {
    positionWheelMarkerFromRGB(state.r, state.g, state.b);
  }
}

function updateReadouts() {
  const hex = rgbToHex(state.r, state.g, state.b);
  els.preview.style.background = hex;
  els.rgbText.textContent = `${state.r}, ${state.g}, ${state.b}`;
  els.serialText.textContent = makeSerialValue(state.r, state.g, state.b);

  els.brightnessValue.textContent = state.brightness;
}

function applyBrightness(r, g, b) {
  const factor = state.brightness / 255;
  return [
    Math.round(r * factor),
    Math.round(g * factor),
    Math.round(b * factor)
  ];
}

/* ---------- Wheel rendering ---------- */

function drawColorWheel() {
  const size = els.canvas.width;
  const center = size / 2;
  const radius = size / 2;

  const image = ctx.createImageData(size, size);
  const pixels = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const offset = (y * size + x) * 4;

      if (distance > radius) {
        pixels[offset + 3] = 0;
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const hue = ((angle * 180 / Math.PI) + 360 + 90) % 360;
      const saturation = distance / radius;

      const [r, g, b] = hsvToRgb(hue, saturation, 1);

      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const whiteGradient = ctx.createRadialGradient(
    center, center, 0,
    center, center, radius
  );
  whiteGradient.addColorStop(0, "rgba(255,255,255,0.92)");
  whiteGradient.addColorStop(0.02, "rgba(255,255,255,0.84)");
  whiteGradient.addColorStop(0.18, "rgba(255,255,255,0.34)");
  whiteGradient.addColorStop(0.72, "rgba(255,255,255,0)");
  whiteGradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = whiteGradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, TAU);
  ctx.fill();
}

function pointFromEvent(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;

  const px = x * scaleX;
  const py = y * scaleY;

  const center = els.canvas.width / 2;
  const dx = px - center;
  const dy = py - center;

  const radius = Math.min(center, center);
  const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
  const angle = Math.atan2(dy, dx);

  const hue = ((angle * 180 / Math.PI) + 360 + 90) % 360;
  const saturation = distance / radius;

  return {
    hue,
    saturation,
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance
  };
}

function setWheelColorFromEvent(event) {
  const point = pointFromEvent(event);
  const [r, g, b] = hsvToRgb(point.hue, point.saturation, 1);

  setStateFromRGB(r, g, b, false);
  moveMarker(point.x, point.y);
}

function moveMarker(canvasX, canvasY) {
  const rect = els.canvas.getBoundingClientRect();
  const x = canvasX / els.canvas.width * rect.width;
  const y = canvasY / els.canvas.height * rect.height;

  els.marker.style.left = `${x}px`;
  els.marker.style.top = `${y}px`;
}

function positionWheelMarkerFromRGB(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;

  if (value === 0) {
    moveMarker(els.canvas.width / 2, els.canvas.height / 2);
    return;
  }

  const saturation = max === 0 ? 0 : (max - min) / max;
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  let hue = 0;

  if (max !== min) {
    if (max === rr) hue = 60 * ((gg - bb) / (max - min));
    else if (max === gg) hue = 60 * ((bb - rr) / (max - min) + 2);
    else hue = 60 * ((rr - gg) / (max - min) + 4);
  }

  hue = (hue + 360) % 360;

  // Our drawing uses hue shifted by +90 degrees.
  const angleDeg = hue - 90;
  const angle = angleDeg * Math.PI / 180;

  const radius = els.canvas.width / 2;
  const distance = saturation * radius;

  moveMarker(
    radius + Math.cos(angle) * distance,
    radius + Math.sin(angle) * distance
  );
}

/* ---------- UI ---------- */

function bindChannel(numberInput, rangeInput, channel) {
  const update = (value) => {
    const parsed = clamp(value);
    state[channel] = Math.round(parsed);
    numberInput.value = state[channel];
    rangeInput.value = state[channel];
    updateReadouts();
    positionWheelMarkerFromRGB(state.r, state.g, state.b);
  };

  numberInput.addEventListener("input", e => update(e.target.value));
  rangeInput.addEventListener("input", e => update(e.target.value));
}

function addLog(message, type = "info") {
  const line = document.createElement("div");
  line.className = "log-line";

  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<strong>[${time}]</strong> ${escapeHtml(message)}`;

  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(connected, text) {
  state.connected = connected;
  els.status.classList.toggle("connected", connected);
  els.status.classList.toggle("disconnected", !connected);
  els.statusText.textContent = text;
  els.connectBtn.textContent = connected ? "Disconnect" : "Connect HC-05";
}

/* ---------- Web Serial ---------- */

async function connectSerial() {
  if (!("serial" in navigator)) {
    addLog("Web Serial is not available in this browser.");
    alert(
      "Web Serial is not available here. Use a recent desktop version of Chrome or Edge."
    );
    return;
  }

  try {
    if (state.port) {
      await disconnectSerial();
      return;
    }

    // User must explicitly choose the Bluetooth serial device.
    const port = await navigator.serial.requestPort();

    await port.open({ baudRate: 9600 });

    state.port = port;
    state.writer = port.writable.getWriter();

    setStatus(true, "HC-05 connected");
    addLog("HC-05 serial connection opened at 9600 baud.");

    watchPortDisconnect();
  } catch (error) {
    console.error(error);

    if (error?.name === "NotFoundError") {
      addLog("Connection cancelled.");
      return;
    }

    addLog(`Connection error: ${error.message || error}`);
    setStatus(false, "Connection failed");
    state.port = null;
    state.writer = null;
  }
}

async function watchPortDisconnect() {
  if (!state.port?.readable) return;

  state.reader = state.port.readable.getReader();

  try {
    while (true) {
      const { value, done } = await state.reader.read();

      if (done) break;

      // HC-05 normally only needs outbound data here.
      // We still keep the reader active so disconnects are detected.
      if (value && value.length) {
        const text = new TextDecoder().decode(value);
        addLog(`Arduino: ${text.trim()}`);
      }
    }
  } catch (error) {
    if (state.connected) {
      addLog(`Serial read stopped: ${error.message || error}`);
    }
  } finally {
    try {
      state.reader.releaseLock();
    } catch (_) {}

    state.reader = null;

    if (state.connected) {
      setStatus(false, "Disconnected");
      state.port = null;
      state.writer = null;
    }
  }
}

async function disconnectSerial() {
  try {
    if (state.reader) {
      await state.reader.cancel();
      state.reader = null;
    }

    if (state.writer) {
      state.writer.releaseLock();
      state.writer = null;
    }

    if (state.port) {
      await state.port.close();
      state.port = null;
    }
  } catch (error) {
    console.error(error);
  }

  setStatus(false, "Not connected");
  addLog("HC-05 disconnected.");
}

async function sendColor() {
  if (!state.connected || !state.writer) {
    addLog("Not connected. Connect HC-05 first.");
    alert("Connect the HC-05 first.");
    return;
  }

  const [r, g, b] = applyBrightness(state.r, state.g, state.b);
  const packet = makeSerialValue(r, g, b);

  try {
    // The current Nano code does not require a newline.
    // A newline is harmless because the Nano ignores non-digits.
    await state.writer.write(new TextEncoder().encode(packet));

    addLog(`Sent ${packet} → R${r} G${g} B${b}`);
  } catch (error) {
    addLog(`Send failed: ${error.message || error}`);
    await disconnectSerial();
  }
}

/* ---------- Events ---------- */

els.canvas.addEventListener("pointerdown", event => {
  els.canvas.setPointerCapture(event.pointerId);
  setWheelColorFromEvent(event);
});

els.canvas.addEventListener("pointermove", event => {
  if (event.buttons === 1) {
    setWheelColorFromEvent(event);
  }
});

bindChannel(els.red, els.redRange, "r");
bindChannel(els.green, els.greenRange, "g");
bindChannel(els.blue, els.blueRange, "b");

els.brightness.addEventListener("input", e => {
  state.brightness = Number(e.target.value);
  updateReadouts();
});

els.chooseColorBtn.addEventListener("click", sendColor);

els.offBtn.addEventListener("click", () => {
  state.r = 0;
  state.g = 0;
  state.b = 0;

  els.red.value = 0;
  els.green.value = 0;
  els.blue.value = 0;

  els.redRange.value = 0;
  els.greenRange.value = 0;
  els.blueRange.value = 0;

  updateReadouts();
  positionWheelMarkerFromRGB(0, 0, 0);

  sendColor();
});

document.querySelectorAll(".preset").forEach(button => {
  button.addEventListener("click", () => {
    const hex = button.dataset.color;
    const value = hex.slice(1);

    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);

    setStateFromRGB(r, g, b, true);
    sendColor();
  });
});

els.connectBtn.addEventListener("click", connectSerial);

els.clearLogBtn.addEventListener("click", () => {
  els.log.innerHTML = "";
});

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", async () => {
    if (state.connected) {
      setStatus(false, "Disconnected");
      state.port = null;
      state.writer = null;
      state.reader = null;
      addLog("The serial Bluetooth device disconnected.");
    }
  });
} else {
  setStatus(false, "Web Serial unavailable");
}

drawColorWheel();
setStateFromRGB(255, 0, 0, true);
addLog("Controller ready.");
