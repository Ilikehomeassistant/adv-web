// ADV for the web: starts .NET, then runs the handheld (WebPlayer.cs) 60 times a second,
// draws it on the canvas, plays its sound, and passes keys, touches and pictures to it.
import { dotnet } from './_framework/dotnet.js';

const canvas = document.getElementById('screen');
const draw2d = canvas.getContext('2d');
const message = document.getElementById('message');
const BAR = 30;      // the strip at the bottom with the OPEN button
let image, pixels, indexes, colors, height;

// carts are kept in the browser's local storage, so they're still there next time
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

// if something goes wrong, say so on the page
window.addEventListener('error', e => { message.textContent = 'ADV CRASHED: ' + e.message; message.style.display = 'flex'; });
window.addEventListener('unhandledrejection', e => { message.textContent = 'ADV CRASHED: ' + e.reason; message.style.display = 'flex'; });

const { setModuleImports, getAssemblyExports, getConfig, runMain } = await dotnet.create();
setModuleImports('main.js', {
  draw(view) {
    view.copyTo(indexes);
    for (let i = 0; i < indexes.length; i++) pixels[i] = colors[indexes[i]];
    draw2d.putImageData(image, 0, 0);
  },
  keepCart(name, base64) {
    if (!storage.set('adv-cart:' + name, base64)) console.warn('no room left to keep ' + name);
  },
});
const exports = await getAssemblyExports(getConfig().mainAssemblyName);
const adv = exports.Adv.WebPlayer;
await runMain(getConfig().mainAssemblyName, []);

// the carts from last time, then the handheld itself
const firstVisit = storage.get('adv-started') === null;
for (const key of storage.keys())
  if (key.startsWith('adv-cart:')) adv.AddCart(key.slice(9), storage.get(key));
storage.set('adv-started', '1');
height = adv.Start(window.innerWidth, window.innerHeight - BAR, firstVisit);
canvas.width = 160;
canvas.height = height;
image = draw2d.createImageData(160, height);
pixels = new Uint32Array(image.data.buffer);
indexes = new Uint8Array(160 * height);
colors = Uint32Array.from(adv.Colors(), c => 0xFF000000 | (c & 255) << 16 | (c >> 8 & 255) << 8 | c >> 16 & 255);
message.style.display = 'none';
canvas.style.display = 'block';

// as big as fits, in the middle
function fit() {
  const scale = Math.min(window.innerWidth / 160, (window.innerHeight - BAR) / height);
  canvas.style.width = 160 * scale + 'px';
  canvas.style.height = height * scale + 'px';
  canvas.style.left = (window.innerWidth - 160 * scale) / 2 + 'px';
  canvas.style.top = Math.max(0, (window.innerHeight - BAR - height * scale) / 2) + 'px';
}
window.addEventListener('resize', fit);
fit();

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

// keys
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

// fingers and the mouse, in canvas pixels
function at(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * 160 / r.width, (e.clientY - r.top) * height / r.height];
}
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  adv.Touch(e.pointerId, 0, ...at(e));
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') adv.Touch(e.pointerId, 1, ...at(e)); });
for (const type of ['pointerup', 'pointercancel'])
  canvas.addEventListener(type, e => adv.Touch(e.pointerId, 2, 0, 0));
canvas.addEventListener('contextmenu', e => e.preventDefault());

// a cart picture (or a photo of one): open it, drop it on the page, or paste it
async function openPicture(file) {
  if (!file) return;
  try {
    const blob = file.name && file.name.toLowerCase().endsWith('.adv') ? new Blob([file], { type: 'image/png' }) : file;
    const bitmap = await createImageBitmap(blob);
    const shrink = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)); // big photos: plenty of detail at 2000
    const w = Math.round(bitmap.width * shrink), h = Math.round(bitmap.height * shrink);
    const paper = document.createElement('canvas');
    paper.width = w;
    paper.height = h;
    const p = paper.getContext('2d');
    p.imageSmoothingEnabled = shrink < 1;
    p.drawImage(bitmap, 0, 0, w, h);
    const rgba = p.getImageData(0, 0, w, h).data;
    let text = '';
    for (let i = 0; i < rgba.length; i += 0x8000) text += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
    adv.OpenPicture(w, h, btoa(text));
  } catch (problem) {
    console.warn(problem);
    adv.OpenPicture(1, 1, btoa('\0\0\0\0')); // shows NO CART IN THAT PICTURE
  }
}
const picker = document.getElementById('file');
document.getElementById('open').addEventListener('click', () => picker.click());
picker.addEventListener('change', () => { openPicture(picker.files[0]); picker.value = ''; });
const drop = document.getElementById('drop');
window.addEventListener('dragover', e => { e.preventDefault(); drop.style.display = 'block'; });
window.addEventListener('dragleave', () => { drop.style.display = 'none'; });
window.addEventListener('drop', e => {
  e.preventDefault();
  drop.style.display = 'none';
  openPicture(e.dataTransfer.files[0]);
});
window.addEventListener('paste', e => {
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (item) openPicture(item.getAsFile());
});
