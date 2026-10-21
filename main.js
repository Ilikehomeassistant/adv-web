// ADV for the web: starts .NET, then runs ADV (WebPlayer.cs) 60 times a second, draws it,
// plays its sound, and passes keys, the mouse, touches and pictures to it.
// Phones (going by the browser's user agent) get the handheld; PCs get the console and
// its cart library. Add ?mode=phone or ?mode=pc to the address to choose.
import { dotnet } from './_framework/dotnet.js';

const message = document.getElementById('message');
const BAR = 30;      // the strip at the bottom with the OPEN button

const asked = new URLSearchParams(location.search).get('mode');
const ua = navigator.userAgent;
const phone = asked ? asked === 'phone'
  : /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
document.body.classList.add(phone ? 'phone' : 'pc');

// if something goes wrong, say so on the page
window.addEventListener('error', e => { message.textContent = 'ADV CRASHED: ' + e.message; message.style.display = 'flex'; });
window.addEventListener('unhandledrejection', e => { message.textContent = 'ADV CRASHED: ' + e.reason; message.style.display = 'flex'; });

// carts are kept in the browser's local storage, so they're still there next time
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch { } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

// the canvases ADV draws on: 0 the handheld, 1 the console, 2 the library
const screens = [];
let colors;
function screen(id, width, height) {
  const canvas = document.getElementById(id);
  canvas.width = width;
  canvas.height = height;
  const draw2d = canvas.getContext('2d');
  const image = draw2d.createImageData(width, height);
  canvas.style.display = 'block';
  return { canvas, draw2d, image, pixels: new Uint32Array(image.data.buffer), indexes: new Uint8Array(width * height), width, height };
}

const { setModuleImports, getAssemblyExports, getConfig, runMain } = await dotnet.create();
setModuleImports('main.js', {
  draw(which, view) {
    const s = screens[which];
    view.copyTo(s.indexes);
    for (let i = 0; i < s.indexes.length; i++) s.pixels[i] = colors[s.indexes[i]];
    s.draw2d.putImageData(s.image, 0, 0);
  },
  keepCart(name, base64) {
    if (!storage.set('adv-cart:' + name, base64)) console.warn('no room left to keep ' + name);
  },
  forgetCart(name) { storage.remove('adv-cart:' + name); },
});
const exports = await getAssemblyExports(getConfig().mainAssemblyName);
const adv = exports.Adv.WebPlayer;
await runMain(getConfig().mainAssemblyName, []);
colors = Uint32Array.from(adv.Colors(), c => 0xFF000000 | (c & 255) << 16 | (c >> 8 & 255) << 8 | c >> 16 & 255);

// the carts from last time, then ADV itself
const firstVisit = storage.get('adv-started') === null;
for (const key of storage.keys())
  if (key.startsWith('adv-cart:')) adv.AddCart(key.slice(9), storage.get(key));
storage.set('adv-started', '1');
if (phone) startPhone(); else startPc();
message.style.display = 'none';

// 60 frames a second, whatever the screen's speed
let last = performance.now(), behind = 0;
const speed = window.advSpeed = { frames: 0, ms: 0 }; // how hard it's working (for testing)
function frame(now) {
  behind = Math.min(behind + now - last, 100);
  last = now;
  for (let steps = 0; behind >= 1000 / 60 && steps < 4; steps++) {
    const start = performance.now();
    adv.Step();
    speed.frames++;
    speed.ms += performance.now() - start;
    behind -= 1000 / 60;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// sound: browsers only allow it after a key or a tap
let audio = null;
function startSound() {
  if (audio) { if (audio.state !== 'running') audio.resume(); return; }
  try { audio = new AudioContext({ sampleRate: 22050 }); } catch { audio = new AudioContext(); }
  const step = 22050 / audio.sampleRate;
  const speaker = audio.createScriptProcessor(2048, 0, 1);
  speaker.onaudioprocess = e => {
    const out = e.outputBuffer.getChannelData(0);
    const samples = adv.Sound(Math.ceil(out.length * step) + 1);
    for (let i = 0; i < out.length; i++) {
      const p = i * step, k = Math.floor(p);
      out[i] = samples[k] + (samples[k + 1] - samples[k]) * (p - k);
    }
  };
  speaker.connect(audio.destination);
}
window.addEventListener('keydown', startSound);
window.addEventListener('pointerdown', startSound);

// where a pointer is on a canvas, in its pixels
function at(s, e) {
  const r = s.canvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) * s.width / r.width), Math.floor((e.clientY - r.top) * s.height / r.height)];
}
function inside(s, e) {
  const r = s.canvas.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
}
function place(canvas, left, top, width, height) {
  Object.assign(canvas.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
}

// ---------------------------------------------------------------
// The phone: the handheld, worked with fingers (or keys)
// ---------------------------------------------------------------

function startPhone() {
  const height = adv.StartHandheld(window.innerWidth, window.innerHeight - BAR, firstVisit);
  const s = screens[0] = screen('screen', 160, height);
  function fit() {
    const scale = Math.min(window.innerWidth / 160, (window.innerHeight - BAR) / height);
    place(s.canvas, (window.innerWidth - 160 * scale) / 2, Math.max(0, (window.innerHeight - BAR - height * scale) / 2), 160 * scale, height * scale);
  }
  window.addEventListener('resize', fit);
  fit();

  const buttons = {
    ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3,
    KeyZ: 4, KeyC: 4, Space: 4, KeyX: 5, KeyV: 5,
    ShiftLeft: 6, ShiftRight: 6, Enter: 7, Escape: 7,
  };
  for (const [type, down] of [['keydown', true], ['keyup', false]])
    window.addEventListener(type, e => {
      const b = buttons[e.code];
      if (b === undefined || e.ctrlKey || e.metaKey) return;
      adv.Key(b, down);
      e.preventDefault();
    });
  window.addEventListener('blur', () => { for (let b = 0; b < 8; b++) adv.Key(b, false); });

  s.canvas.addEventListener('pointerdown', e => {
    s.canvas.setPointerCapture(e.pointerId);
    adv.Touch(e.pointerId, 0, ...at(s, e));
    e.preventDefault();
  });
  s.canvas.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') adv.Touch(e.pointerId, 1, ...at(s, e)); });
  for (const type of ['pointerup', 'pointercancel'])
    s.canvas.addEventListener(type, e => adv.Touch(e.pointerId, 2, 0, 0));
  s.canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------------------------------------------------------------
// The PC: the console and the cart library, side by side
// ---------------------------------------------------------------

function startPc() {
  adv.StartConsole(firstVisit);
  const con = screens[1] = screen('console', 160, 204);
  const lib = screens[2] = screen('library', 112, 204);
  let zoom = 1;
  function fit() {
    const room = Math.min(window.innerWidth * 0.94 / (160 + 4 + 112), (window.innerHeight - BAR) * 0.96 / 204);
    zoom = room >= 2 ? Math.floor(room) : room; // a whole-number zoom when there's room, so the pixels stay even
    const width = (160 + 4 + 112) * zoom, left = (window.innerWidth - width) / 2;
    const top = Math.max(0, (window.innerHeight - BAR - 204 * zoom) / 2);
    place(con.canvas, left, top, 160 * zoom, 204 * zoom);
    place(lib.canvas, left + 164 * zoom, top, 112 * zoom, 204 * zoom);
  }
  window.addEventListener('resize', fit);
  fit();

  // the keyboard: game buttons for both players, and typing for the terminal
  const players = [
    { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, KeyZ: 4, KeyX: 5 },
    { KeyA: 0, KeyD: 1, KeyW: 2, KeyS: 3, KeyF: 4, KeyG: 5 },
  ];
  const names = { // the browser's key -> Windows' name for it
    Escape: 'Escape', Enter: 'Return', NumpadEnter: 'Return', Backspace: 'Back', Tab: 'Tab', Space: 'Space',
    ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Delete: 'Delete',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  };
  for (const [type, down] of [['keydown', true], ['keyup', false]])
    window.addEventListener(type, e => {
      players.forEach((keys, p) => { if (keys[e.code] !== undefined) adv.GameKey(p, keys[e.code], down); });
      if (!down || e.metaKey || e.altKey) return;
      const name = names[e.code] ?? (/^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^F\d+$/.test(e.code) ? e.code : null);
      if (name && /^F(5|11|12)$/.test(name)) return; // leave the browser's own keys alone
      let used = name !== null && adv.ConsoleKey(name, e.ctrlKey, e.shiftKey);
      if (!used && !e.ctrlKey) {
        const ch = e.key === 'Enter' ? 13 : e.key === 'Backspace' ? 8 : e.key.length === 1 ? e.key.charCodeAt(0) : 0;
        if (ch) { adv.ConsoleChar(ch); used = true; }
      }
      if (used || name) e.preventDefault();
    });
  window.addEventListener('blur', () => players.forEach((keys, p) => { for (let b = 0; b < 6; b++) adv.GameKey(p, b, false); }));

  // the mouse on the console and the library; pressing on a cart and moving drags it
  const dragged = document.getElementById('drag');
  let drag = null; // the file of the cart being dragged
  const buttonsOf = e => (e.buttons & 1 ? 1 : 0) | (e.buttons & 2 ? 2 : 0) | (e.buttons & 4 ? 4 : 0);
  const target = e => inside(con, e) ? 1 : inside(lib, e) ? 2 : 0;
  function startDrag(path, e) {
    drag = path;
    const art = adv.DragArt(path);
    const size = Math.max(2, Math.round(zoom / 2));
    dragged.width = 30;
    dragged.height = 38;
    const g = dragged.getContext('2d'), image = g.createImageData(30, 38), px = new Uint32Array(image.data.buffer);
    art.forEach((c, i) => { px[i] = c === 16 ? 0 : colors[c]; });
    g.putImageData(image, 0, 0);
    dragged.style.width = 30 * size + 'px';
    dragged.style.height = 38 * size + 'px';
    dragged.style.display = 'block';
    moveDrag(e);
  }
  function moveDrag(e) {
    const r = dragged.getBoundingClientRect();
    dragged.style.left = e.clientX - r.width / 2 + 'px';  // held by the top middle
    dragged.style.top = e.clientY - 6 * r.height / 38 + 'px';
    const where = target(e);
    adv.DragOver(where, drag, ...at(where === 2 ? lib : con, e));
  }
  function endDrag(where, e) {
    adv.DragDrop(where, drag, ...(e ? at(where === 2 ? lib : con, e) : [0, 0]));
    dragged.style.display = 'none';
    drag = null;
  }

  for (const s of [con, lib]) {
    const mouse = (what, e) => s === con ? adv.ConsoleMouse(what, ...at(s, e), buttonsOf(e)) : adv.LibraryMouse(what, ...at(s, e));
    s.canvas.addEventListener('pointerdown', e => {
      s.canvas.setPointerCapture(e.pointerId);
      const path = mouse(0, e);
      if (path) startDrag(path, e);
      e.preventDefault();
    });
    s.canvas.addEventListener('pointermove', e => {
      if (drag) { moveDrag(e); return; }
      const path = mouse(1, e);
      if (path) startDrag(path, e);
    });
    s.canvas.addEventListener('pointerup', e => {
      if (drag) endDrag(target(e), e);
      else mouse(2, e);
    });
    s.canvas.addEventListener('pointercancel', () => { if (drag) endDrag(0, null); });
    s.canvas.addEventListener('wheel', e => {
      const notches = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (s === con) adv.ConsoleWheel(notches); else adv.LibraryWheel(notches);
      e.preventDefault();
    }, { passive: false });
    s.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  lib.canvas.addEventListener('pointerleave', () => { if (!drag) adv.LibraryMouse(3, 0, 0); });
  lib.canvas.addEventListener('dblclick', e => adv.LibraryMouse(4, ...at(lib, e)));
}

// ---------------------------------------------------------------
// Carts from the computer: a cart file, or a picture (or photo) of one.
// Open one with the button, drop it on the page, or paste it.
// ---------------------------------------------------------------

function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function openFile(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  // a cart file (on the PC it goes straight into the slot)
  if (!phone && /\.(adv|advt|lua)$/.test(name)) {
    adv.CartFromComputer(file.name, base64(new Uint8Array(await file.arrayBuffer())));
    return;
  }
  try {
    const blob = name.endsWith('.adv') ? new Blob([file], { type: 'image/png' }) : file;
    const bitmap = await createImageBitmap(blob);
    const shrink = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)); // big photos: plenty of detail at 2000
    const w = Math.round(bitmap.width * shrink), h = Math.round(bitmap.height * shrink);
    const paper = document.createElement('canvas');
    paper.width = w;
    paper.height = h;
    const p = paper.getContext('2d');
    p.imageSmoothingEnabled = shrink < 1;
    p.drawImage(bitmap, 0, 0, w, h);
    adv.OpenPicture(w, h, base64(p.getImageData(0, 0, w, h).data));
  } catch (problem) {
    console.warn(problem);
    adv.OpenPicture(1, 1, btoa('\0\0\0\0')); // says there's no cart in it
  }
}
const picker = document.getElementById('file');
document.getElementById('open').addEventListener('click', () => picker.click());
picker.addEventListener('change', () => { openFile(picker.files[0]); picker.value = ''; });
const drop = document.getElementById('drop');
window.addEventListener('dragover', e => { e.preventDefault(); drop.style.display = 'block'; });
window.addEventListener('dragleave', () => { drop.style.display = 'none'; });
window.addEventListener('drop', e => {
  e.preventDefault();
  drop.style.display = 'none';
  openFile(e.dataTransfer.files[0]);
});
window.addEventListener('paste', e => {
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (item) openFile(item.getAsFile());
});
