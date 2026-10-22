// ADV for the web: starts .NET, then runs ADV (WebPlayer.cs) 60 times a second, draws it,
// plays its sound, and passes keys, the mouse, touches and pictures to it.
//   the website (index.html): phones get the handheld; PCs get the desk - the console
//     wired to a screen of online carts. Add ?mode=phone or ?mode=pc to choose.
//   the Developer Kit (devkit.html, PCs only): the dev kit console, its editors, your carts.
//   ADV Lite (lite.html, for other people's sites): the handheld with just the online carts.
import { dotnet } from './_framework/dotnet.js';
import { drawAllPixelText } from './pixelfont.js';

drawAllPixelText(); // headings and labels in ADV's own lettering

const app = document.body.dataset.app ?? 'site';
const message = document.getElementById('message');
const asked = new URLSearchParams(location.search).get('mode');
const ua = navigator.userAgent;
const phone = app === 'lite' || asked ? app === 'lite' || asked === 'phone'
  : /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
document.body.classList.add(phone ? 'phone' : 'pc');

function say(text) { message.textContent = text; message.style.display = 'flex'; }
window.addEventListener('error', e => say('ADV CRASHED: ' + e.message));
window.addEventListener('unhandledrejection', e => say('ADV CRASHED: ' + e.reason));
if (app === 'devkit' && phone) { say('THE DEVELOPER KIT NEEDS A PC (A KEYBOARD AND A MOUSE).'); throw new Error('the dev kit needs a PC'); }

// carts are kept in the browser's local storage, so they're still there next time
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch { } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

// the one canvas ADV draws on
const canvas = document.getElementById('screen');
const draw2d = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, image, pixels, indexes, colors;
function setSize(width, height) {
  W = width; H = height;
  canvas.width = W;
  canvas.height = H;
  image = draw2d.createImageData(W, H);
  pixels = new Uint32Array(image.data.buffer);
  indexes = new Uint8Array(W * H);
  indexes.fill(255); // (nothing drawn yet, so the first frame draws everything)
  canvas.style.display = 'block';
}

const { setModuleImports, getAssemblyExports, getConfig, runMain } = await dotnet.create();
const fresh = new Uint8Array(1024 * 1024);
let uploader = null; // (the dev kit) the upload form, once it's loaded
setModuleImports('main.js', {
  // only the rows that changed get turned into colors and put on the screen
  draw(view) {
    const now = fresh.subarray(0, W * H);
    view.copyTo(now);
    let first = -1, last = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        if (now[row + x] !== indexes[row + x]) {
          if (first < 0) first = y;
          last = y;
          for (let i = row; i < row + W; i++) pixels[i] = colors[indexes[i] = now[i]];
          break;
        }
      }
    }
    if (first >= 0) draw2d.putImageData(image, 0, 0, 0, first, W, last - first + 1);
  },
  keepCart(name, base64) {
    if (!storage.set('adv-cart:' + name, base64)) console.warn('no room left to keep ' + name);
  },
  forgetCart(name) { storage.remove('adv-cart:' + name); },
  // what each game has saved (high scores...), as a bit of JSON
  readSave(id) { return storage.get('adv-save:' + id); },
  writeSave(id, json) {
    if (json == null) storage.remove('adv-save:' + id);
    else storage.set('adv-save:' + id, json);
  },
  // the dev kit's modem: typing UPLOAD opens the upload form with the cart in the slot
  async uploadCart(json) {
    if (!uploader) return 'NO MODEM ON THIS PAGE';
    return (await uploader).ask(json);
  },
});
const exports = await getAssemblyExports(getConfig().mainAssemblyName);
const adv = window.adv = exports.Adv.WebPlayer;
await runMain(getConfig().mainAssemblyName, []);
colors = Uint32Array.from(adv.Colors(), c => 0xFF000000 | (c & 255) << 16 | (c >> 8 & 255) << 8 | c >> 16 & 255);

// the carts from last time, then ADV itself
const firstVisit = storage.get('adv-started') === null;
for (const key of storage.keys())
  if (key.startsWith('adv-cart:')) adv.AddCart(key.slice(9), storage.get(key));
storage.set('adv-started', '1');
if (app === 'devkit') startDesk(true);
else if (app === 'lite') startPhone(true);
else if (phone) startPhone();
else startDesk(false);
message.style.display = 'none';

// 60 frames a second, whatever the screen's speed (and none while the page is hidden)
let last = performance.now(), behind = 0;
const speed = window.advSpeed = { frames: 0, ms: 0 }; // how hard it's working (for testing)
// (it rests while you've scrolled away to read the rest of the page)
let onScreen = true;
const stage = document.getElementById('stage');
if (stage && 'IntersectionObserver' in window)
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(stage);
function frame(now) {
  behind = onScreen ? Math.min(behind + now - last, 100) : 0;
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

// where a pointer is on the canvas, in its pixels
function at(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) * W / r.width), Math.floor((e.clientY - r.top) * H / r.height)];
}
function place(left, top, width, height) {
  Object.assign(canvas.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
}

// ---------------------------------------------------------------
// The phone: the handheld, worked with fingers (or keys)
// ---------------------------------------------------------------

function startPhone(lite = false) {
  const BAR = lite ? 22 : 44; // (lite: room for the credit underneath)
  setSize(160, lite ? adv.StartLite(window.innerWidth, window.innerHeight - BAR)
                    : adv.StartHandheld(window.innerWidth, window.innerHeight - BAR, firstVisit));
  function fit() {
    const scale = Math.min(window.innerWidth / W, (window.innerHeight - BAR) / H);
    place((window.innerWidth - W * scale) / 2, Math.max(0, (window.innerHeight - BAR - H * scale) / 2), W * scale, H * scale);
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

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    adv.Touch(e.pointerId, 0, ...at(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') adv.Touch(e.pointerId, 1, ...at(e)); });
  for (const type of ['pointerup', 'pointercancel'])
    canvas.addEventListener(type, e => adv.Touch(e.pointerId, 2, 0, 0));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------------------------------------------------------------
// A desk (the website on a PC, or the Developer Kit): one canvas, keys and the mouse
// ---------------------------------------------------------------

function startDesk(devKit) {
  setSize(...adv.StartDesk(firstVisit, devKit));
  const stage = document.getElementById('stage');
  function fit() {
    const room = Math.min(stage.clientWidth / W, window.innerHeight * 0.82 / H);
    const zoom = room >= 2 ? Math.floor(room) : room; // a whole-number zoom when there's room, so the pixels stay even
    stage.style.height = H * zoom + 'px';
    place((stage.clientWidth - W * zoom) / 2, 0, W * zoom, H * zoom);
  }
  window.addEventListener('resize', fit);
  fit();

  // the keyboard: game buttons for both players, and typing for the terminal and the editors
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // typing in a form
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

  // the mouse: carts are dragged around inside the desk itself
  const buttonsOf = e => (e.buttons & 1 ? 1 : 0) | (e.buttons & 2 ? 2 : 0) | (e.buttons & 4 ? 4 : 0);
  const send = (what, e) => { canvas.style.cursor = adv.DeskMouse(what, ...at(e), buttonsOf(e)) ? 'grabbing' : ''; };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); send(0, e); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => send(1, e));
  canvas.addEventListener('pointerup', e => send(2, e));
  canvas.addEventListener('pointercancel', e => send(2, e));
  canvas.addEventListener('pointerleave', () => adv.DeskMouse(3, 0, 0, 0));
  canvas.addEventListener('dblclick', e => send(4, e));
  canvas.addEventListener('wheel', e => {
    adv.DeskWheel(...at(e), e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  if (!devKit) return;
  // the dev kit's buttons: download the cart you're making as a picture, or upload it
  document.getElementById('download')?.addEventListener('click', () => {
    const made = adv.KitPicture();
    if (!made) { note('MAKE OR INSERT A CART FIRST'); return; }
    const [name, data] = made.split('\n');
    const link = document.createElement('a');
    link.href = 'data:image/png;base64,' + data;
    link.download = name;
    link.click();
  });
  uploader = import('./upload.js').then(m => m.setUp(adv, note));
}

function note(text) {
  const box = document.getElementById('note');
  if (!box) return;
  box.textContent = text;
  box.style.visibility = 'visible';
  clearTimeout(note.timer);
  note.timer = setTimeout(() => { box.style.visibility = 'hidden'; }, 4000);
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
  // a cart file (on a PC it goes straight into the slot)
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
const drop = document.getElementById('drop');
if (picker && drop) { // (not on ADV Lite: that's online carts only)
  document.querySelectorAll('.open').forEach(b => b.addEventListener('click', () => picker.click()));
  picker.addEventListener('change', () => { openFile(picker.files[0]); picker.value = ''; });
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
}
