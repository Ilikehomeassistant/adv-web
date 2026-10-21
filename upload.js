// The Developer Kit's UPLOAD button: sends your cart to ADV's online carts as a pull request
// from YOUR OWN GitHub account. The owner of ADV looks at it, and once it's accepted it
// shows up for everyone. Your GitHub token only ever goes to api.github.com, and it's
// kept in this browser only if you tick "remember". Commits use GitHub's private
// "noreply" address, so your email isn't shown.
const OWNER = 'Ilikehomeassistant', REPO = 'adv-carts', TOKEN_KEY = 'adv-github-token';

export function setUp(adv, note) {
  const dialog = document.getElementById('upload-dialog');
  const form = dialog.querySelector('form');
  const field = name => form.elements.namedItem(name);
  const status = text => { form.querySelector('.status').innerHTML = text; };
  let cart = null;
  let finish = null; // tells the console's UPLOAD command how it went
  const done = text => { if (finish) { finish(text); finish = null; } };

  function ask(json) {
    done('UPLOAD CANCELLED');
    cart = JSON.parse(json);
    field('title').value = cart.title;
    field('author').value = cart.author;
    field('about').value = cart.about;
    let saved = null;
    try { saved = localStorage.getItem(TOKEN_KEY); } catch { }
    field('token').value = saved ?? '';
    field('remember').checked = saved !== null;
    status('');
    if (!dialog.open) dialog.showModal();
    return new Promise(resolve => { finish = resolve; });
  }

  document.getElementById('upload').addEventListener('click', () => {
    const info = adv.KitText();
    if (!info) { note('MAKE OR INSERT A CART FIRST'); return; }
    ask(info);
  });
  form.querySelector('.cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => done('UPLOAD CANCELLED'));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const token = field('token').value.trim();
    try {
      if (field('remember').checked) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { }
    const entry = {
      title: field('title').value.trim() || cart.title,
      author: field('author').value.trim(),
      players: cart.players,
      about: field('about').value.trim(),
    };
    form.querySelector('.go').disabled = true;
    try {
      const url = await upload(token, cart, entry, status);
      status(`SENT! THE OWNER OF ADV WILL TAKE A LOOK. <a href="${url}" target="_blank" rel="noopener">SEE YOUR CART'S PAGE</a>`);
      done('SENT TO ADV-NET! IT GOES ONLINE ONCE IT IS OKAYED');
    } catch (problem) {
      status('THAT DIDN\'T WORK: ' + String(problem.message ?? problem).toUpperCase());
    }
    form.querySelector('.go').disabled = false;
  });
  return { ask };
}

function base64Text(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const textOf = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function upload(token, cart, entry, status) {
  if (!token) throw new Error('paste your GitHub token first');
  async function gh(method, path, body) {
    const r = await fetch('https://api.github.com' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`github said ${r.status} ${(await r.json().catch(() => ({}))).message ?? ''}`);
    return r.status === 204 ? {} : r.json();
  }

  status('CHECKING YOUR GITHUB ACCOUNT...');
  const me = await gh('GET', '/user');
  if (!me) throw new Error('that token did not work');
  const author = { name: me.login, email: `${me.id}+${me.login}@users.noreply.github.com` }; // keeps your email private

  // your own copy of the carts (a fork) to put the new cart in
  let home = OWNER;
  if (me.login.toLowerCase() !== OWNER.toLowerCase()) {
    status('MAKING YOUR COPY OF ADV-CARTS...');
    await gh('POST', `/repos/${OWNER}/${REPO}/forks`, { default_branch_only: true });
    for (let i = 0; i < 30 && !(await gh('GET', `/repos/${me.login}/${REPO}`)); i++) await sleep(2000);
    await gh('POST', `/repos/${me.login}/${REPO}/merge-upstream`, { branch: 'main' }).catch(() => { });
    home = me.login;
  }

  status('ADDING YOUR CART...');
  const base = await gh('GET', `/repos/${home}/${REPO}/git/ref/heads/main`);
  if (!base) throw new Error('could not find your copy of adv-carts');
  const branch = `cart-${cart.file.replace(/\.\w+$/, '')}-${Date.now().toString(36)}`;
  await gh('POST', `/repos/${home}/${REPO}/git/refs`, { ref: 'refs/heads/' + branch, sha: base.object.sha });

  const index = await gh('GET', `/repos/${home}/${REPO}/contents/index.json?ref=${branch}`);
  const list = JSON.parse(textOf(index.content));
  let file = cart.file;
  for (let n = 2; list.carts.some(c => c.file.toLowerCase() === file.toLowerCase()); n++) file = cart.file.replace(/(\.\w+)$/, n + '$1');
  list.carts.push({ file, ...entry });

  await gh('PUT', `/repos/${home}/${REPO}/contents/carts/${file}`, {
    message: `Add ${entry.title}`, content: base64Text(cart.text), branch, author, committer: author,
  });
  await gh('PUT', `/repos/${home}/${REPO}/contents/index.json`, {
    message: `List ${entry.title}`, content: base64Text(JSON.stringify(list, null, 2) + '\n'), sha: index.sha, branch, author, committer: author,
  });

  status('ASKING FOR IT TO GO ONLINE...');
  const pr = await gh('POST', `/repos/${OWNER}/${REPO}/pulls`, {
    title: `New cart: ${entry.title}`,
    head: home === OWNER ? branch : `${home}:${branch}`,
    base: 'main',
    body: `**${entry.title}**${entry.author ? ' by ' + entry.author : ''}\n\n${entry.about}\n\nSent from the ADV Developer Kit.`,
  });
  return pr.html_url;
}
