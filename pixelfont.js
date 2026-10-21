// ADV's own 3x5 pixel font (made from src/Font.cs by tools/make_web_assets.py).
// Any element with a data-px attribute has its text redrawn in it, as crisp pixels:
//   <h2 data-px="4">CART FORGE</h2>   (4 = how big each font pixel is, in screen pixels)
// The color comes from the element's CSS color. Screen readers still get the words.
const GLYPHS = {
  "A": [2, 5, 7, 5, 5],
  "B": [6, 5, 6, 5, 6],
  "C": [3, 4, 4, 4, 3],
  "D": [6, 5, 5, 5, 6],
  "E": [7, 4, 6, 4, 7],
  "F": [7, 4, 6, 4, 4],
  "G": [3, 4, 5, 5, 3],
  "H": [5, 5, 7, 5, 5],
  "I": [7, 2, 2, 2, 7],
  "J": [1, 1, 1, 5, 2],
  "K": [5, 5, 6, 5, 5],
  "L": [4, 4, 4, 4, 7],
  "M": [5, 7, 7, 5, 5],
  "N": [6, 5, 5, 5, 5],
  "O": [2, 5, 5, 5, 2],
  "P": [6, 5, 6, 4, 4],
  "Q": [2, 5, 5, 6, 3],
  "R": [6, 5, 6, 5, 5],
  "S": [3, 4, 2, 1, 6],
  "T": [7, 2, 2, 2, 2],
  "U": [5, 5, 5, 5, 3],
  "V": [5, 5, 5, 2, 2],
  "W": [5, 5, 7, 7, 5],
  "X": [5, 5, 2, 5, 5],
  "Y": [5, 5, 2, 2, 2],
  "Z": [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [6, 1, 2, 4, 7],
  "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 6, 1, 6],
  "6": [3, 4, 7, 5, 7],
  "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7],
  "9": [7, 5, 7, 1, 6],
  " ": [0, 0, 0, 0, 0],
  "!": [2, 2, 2, 0, 2],
  "?": [6, 1, 2, 0, 2],
  ".": [0, 0, 0, 0, 2],
  ",": [0, 0, 0, 2, 4],
  ":": [0, 2, 0, 2, 0],
  ";": [0, 2, 0, 2, 4],
  "-": [0, 0, 7, 0, 0],
  "+": [0, 2, 7, 2, 0],
  "=": [0, 7, 0, 7, 0],
  "/": [1, 1, 2, 4, 4],
  "\\": [4, 4, 2, 1, 1],
  "(": [2, 4, 4, 4, 2],
  ")": [2, 1, 1, 1, 2],
  "[": [6, 4, 4, 4, 6],
  "]": [3, 1, 1, 1, 3],
  "{": [3, 2, 6, 2, 3],
  "}": [6, 2, 3, 2, 6],
  "'": [2, 2, 0, 0, 0],
  "\"": [5, 5, 0, 0, 0],
  "_": [0, 0, 0, 0, 7],
  "*": [0, 5, 2, 5, 0],
  "<": [1, 2, 4, 2, 1],
  ">": [4, 2, 1, 2, 4],
  "#": [5, 7, 5, 7, 5],
  "%": [5, 1, 2, 4, 5],
  "&": [2, 5, 2, 5, 3],
  "~": [0, 1, 7, 4, 0],
  "^": [2, 5, 0, 0, 0],
  "@": [7, 5, 5, 4, 3],
  "$": [3, 6, 2, 3, 6],
  "|": [2, 2, 2, 2, 2]
};

export function drawPixelText(el) {
  const text = (el.dataset.text ?? el.textContent).trim().toUpperCase();
  el.dataset.text = text;
  const scale = Number(el.dataset.px) || 3;
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  const width = Math.max(1, text.length * 4 - 1), height = 5;
  canvas.width = width * scale * ratio;
  canvas.height = height * scale * ratio;
  canvas.style.width = width * scale + 'px';
  canvas.style.height = height * scale + 'px';
  canvas.style.display = 'block';
  canvas.setAttribute('aria-hidden', 'true');
  const g = canvas.getContext('2d');
  g.fillStyle = getComputedStyle(el).color;
  const s = scale * ratio;
  [...text].forEach((ch, i) => {
    const rows = GLYPHS[ch] ?? GLYPHS['?'];
    rows.forEach((bits, y) => {
      for (let x = 0; x < 3; x++) if (bits >> (2 - x) & 1) g.fillRect((i * 4 + x) * s, y * s, s, s);
    });
  });
  el.setAttribute('aria-label', text);
  el.replaceChildren(canvas);
}

export function drawAllPixelText(root = document) {
  root.querySelectorAll('[data-px]').forEach(drawPixelText);
}
