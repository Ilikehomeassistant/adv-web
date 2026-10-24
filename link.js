// Online play on the web: the browser's own WebRTC, for ADV's link (web/WebRtc.cs).
// Each call is a connection to one other ADV with two data channels: "ctl" (always arrives, in
// order) and "in" (buttons: never waits for a lost one). ADV asks how a call is doing every frame.

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }]; // ("what's my internet address?" - there's no relay)
const calls = new Map();
let nextId = 1;

function newCall(pc) {
  const id = nextId++;
  const call = { pc, description: null, failed: false, channels: {}, inbox: [] };
  calls.set(id, call);
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) call.failed = true;
  };
  return [id, call];
}

function use(call, channel) {
  channel.binaryType = 'arraybuffer';
  channel.onmessage = e => call.inbox.push(new Uint8Array(e.data));
  channel.onclose = () => { call.failed = true; };
  call.channels[channel.label] = channel;
}

// this end's description, once its addresses have been found (or after a few seconds)
function gathered(call) {
  const pc = call.pc;
  return new Promise(done => {
    const finish = () => done(pc.localDescription.sdp);
    if (pc.iceGatheringState === 'complete') return finish();
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') finish(); };
    setTimeout(finish, 5000);
  });
}

export const link = {
  // (joining) start a call: its description becomes the offer
  rtcCall() {
    const [id, call] = newCall(new RTCPeerConnection({ iceServers: STUN }));
    use(call, call.pc.createDataChannel('ctl', { ordered: true }));
    use(call, call.pc.createDataChannel('in', { ordered: false, maxRetransmits: 0 }));
    call.pc.createOffer().then(o => call.pc.setLocalDescription(o)).then(() => gathered(call))
      .then(sdp => { call.description = sdp; }, () => { call.failed = true; });
    return id;
  },
  // (hosting) answer someone's offer
  rtcAnswer(offer) {
    const [id, call] = newCall(new RTCPeerConnection({ iceServers: STUN }));
    call.pc.ondatachannel = e => use(call, e.channel);
    call.pc.setRemoteDescription({ type: 'offer', sdp: offer })
      .then(() => call.pc.createAnswer()).then(a => call.pc.setLocalDescription(a)).then(() => gathered(call))
      .then(sdp => { call.description = sdp; }, () => { call.failed = true; });
    return id;
  },
  rtcAccept(id, answer) {
    const call = calls.get(id);
    if (call) call.pc.setRemoteDescription({ type: 'answer', sdp: answer }).catch(() => { call.failed = true; });
  },
  rtcDescription(id) { return calls.get(id)?.description ?? null; },
  // 0 still setting up, 1 open, 2 failed or gone
  rtcState(id) {
    const call = calls.get(id);
    if (!call || call.failed) return 2;
    const open = ['ctl', 'in'].every(l => call.channels[l]?.readyState === 'open');
    return open && call.pc.connectionState === 'connected' ? 1 : 0;
  },
  rtcSend(id, reliable, view) {
    const channel = calls.get(id)?.channels[reliable ? 'ctl' : 'in'];
    if (channel?.readyState !== 'open') return;
    const bytes = new Uint8Array(view.length);
    view.copyTo(bytes);
    try { channel.send(bytes); } catch { }
  },
  // the next message that's arrived (null: none)
  rtcTake(id) { return calls.get(id)?.inbox.shift() ?? null; },
  rtcClose(id) {
    const call = calls.get(id);
    if (!call) return;
    calls.delete(id);
    try { call.pc.close(); } catch { }
  },
};
