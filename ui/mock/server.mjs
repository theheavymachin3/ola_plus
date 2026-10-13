// Stand-in for olad's HTTP API so the UI can be developed without building OLA.
// Same endpoints/shapes as olad/OladHTTPServer.cpp. Run: npm run mock
import http from 'node:http';

// MOCK_STOCK=1 behaves like stock olad 0.10.x: no /json/patch_overview, and get_ports
// hides all but the first free port of each device direction.
const STOCK = process.env.MOCK_STOCK === '1';

// --- devices & ports -------------------------------------------------------
const ports = new Map(); // id -> {device, description, id, is_output, cap, mode, value, universe}
const addPort = (alias, device, dir, n, description, cap = 'none') =>
  ports.set(`${alias}-${dir}-${n}`, {
    device, description, id: `${alias}-${dir}-${n}`, is_output: dir === 'O',
    cap, mode: cap === 'full' ? 'inherit' : 'static', value: 100, universe: null,
  });

addPort(1, 'Dummy Device', 'O', 1, 'Dummy Port 1');
addPort(1, 'Dummy Device', 'I', 1, 'Dummy Port 1');
addPort(3, 'Enttec USB Pro [ENTTEC123]', 'O', 1, 'DMX 1');
addPort(3, 'Enttec USB Pro [ENTTEC123]', 'O', 2, 'DMX 2');
addPort(3, 'Enttec USB Pro [ENTTEC123]', 'I', 1, 'DMX 1');
for (let n = 1; n <= 4; n++) {
  addPort(4, 'Art-Net [192.168.1.20]', 'O', n, `ArtNet 0:0:${n - 1}`, 'full');
  addPort(4, 'Art-Net [192.168.1.20]', 'I', n, `ArtNet 0:0:${n - 1}`, 'full');
}
for (let n = 1; n <= 2; n++) {
  addPort(5, 'E1.31 (sACN)', 'O', n, `sACN ${n}`, 'static');
  addPort(5, 'E1.31 (sACN)', 'I', n, `sACN ${n}`, 'full');
}
ports.get('4-I-1').universe = 1;
ports.get('3-O-1').universe = 1;
ports.get('4-O-2').universe = 2;

// --- universes (exist while they have ports, like olad) ---------------------
const meta = new Map([[1, { name: 'Stage', merge: 'HTP' }], [2, { name: 'Truss', merge: 'HTP' }]]);
const dmx = new Map();
const buf = (u) => dmx.get(u) ?? dmx.set(u, new Array(512).fill(0)).get(u);
const portsOn = (u, out) => [...ports.values()].filter((p) => p.universe === u && p.is_output === out);
const universeIds = () => [...new Set([...ports.values()].map((p) => p.universe).filter((u) => u !== null))].sort((a, b) => a - b);

const startedAt = new Date().toString().slice(0, 24);
const uiDocs = new Map(); // key -> { rev, data: JSON text }

// --- RDM devices (what discovery would find, per universe) ------------------
const rdmDevices = new Map([
  [1, [
    { uid: '7a70:00000001', manufacturer: 'Acme Lighting', label: 'Front wash L', address: 1, personality: 2,
      modes: [['Basic', 3], ['Standard', 8], ['Extended', 16]] },
    { uid: '7a70:00000002', manufacturer: 'Acme Lighting', label: 'Front wash R', address: 9, personality: 2,
      modes: [['Basic', 3], ['Standard', 8], ['Extended', 16]] },
    { uid: '4d41:0000a001', manufacturer: 'Moving Heads Co', label: '', address: 20, personality: 1,
      modes: [['16 bit', 24], ['8 bit', 16]] },
    { uid: '5253:0100029c', manufacturer: 'Robe', label: 'Dimmer pack', address: 24, personality: 1,
      modes: [['Dimmer', 4]] },
  ]],
  [2, [
    { uid: '7a70:00000010', manufacturer: 'Acme Lighting', label: 'Truss 1', address: 1, personality: 1,
      modes: [['Basic', 3], ['Standard', 8]] },
  ]],
]);
const rdmIdentify = new Set();
const rdmFind = (u, uid) => (rdmDevices.get(u) ?? []).find((d) => d.uid === uid);
const rdmSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rdmUidList = (u) => ({
  universe: u,
  uids: (rdmDevices.get(u) ?? []).map((d) => ({
    uid: d.uid, manufacturer: d.manufacturer, device: d.label,
    manufacturer_id: parseInt(d.uid.split(':')[0], 16), device_id: parseInt(d.uid.split(':')[1], 16),
  })),
});

// --- plugins ---------------------------------------------------------------
const plugins = [
  [1, 'Dummy', 'Dummy device for testing.'],
  [2, 'ArtNet', 'Art-Net over UDP. Config: ola-artnet.conf'],
  [3, 'ShowNet', 'Strand ShowNet.'],
  [4, 'ESP Net', 'ESP Net.'],
  [5, 'Serial USB', 'Enttec USB Pro and compatible widgets.'],
  [6, 'Enttec Open DMX', 'Enttec Open DMX USB.'],
  [7, 'SandNet', 'SandNet.'],
  [8, 'StageProfi', 'StageProfi.'],
  [9, 'Pathport', 'Pathport.'],
  [10, 'DMX4Linux', 'DMX4Linux.'],
  [11, 'E1.31 (sACN)', 'Streaming ACN (E1.31).'],
  [12, 'OSC', 'Open Sound Control.'],
].map(([id, name, description]) => ({ id, name, description, enabled: ![3, 4, 7, 8, 9, 10].includes(id), active: [1, 2, 5, 11].includes(id) }));

// --- helpers ---------------------------------------------------------------
const toPort = (p) => ({
  device: p.device, description: p.description, id: p.id, is_output: p.is_output,
  priority: p.cap === 'none' ? {} : { value: p.value, current_mode: p.mode, priority_capability: p.cap },
});
const send = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readForm = async (req) => {
  let b = '';
  for await (const c of req) b += c;
  return new URLSearchParams(b);
};
const ids = (s) => (s ?? '').split(',').filter(Boolean);

// Mirrors olad: name is mandatory on modify; unknown ports are ignored.
function applyModify(u, f) {
  for (const id of ids(f.get('remove_ports'))) {
    const p = ports.get(id);
    if (p?.universe === u) p.universe = null;
  }
  for (const id of ids(f.get('add_ports'))) {
    const p = ports.get(id);
    if (p) p.universe = u; // olad moves a port patched elsewhere
  }
  for (const id of ids(f.get('modify_ports'))) {
    const p = ports.get(id);
    if (!p || p.cap === 'none') continue;
    const mode = f.get(`${id}_priority_mode`);
    if (mode === 'inherit' && p.cap === 'full') p.mode = 'inherit';
    else {
      const v = Number(f.get(`${id}_priority_value`));
      if (v >= 1 && v <= 200) { p.mode = 'static'; p.value = v; }
    }
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const q = url.searchParams;

    if (path === '/json/server_stats') {
      return send(res, {
        hostname: 'mock-olad', instance_name: 'OLA Server', config_dir: '/etc/ola', ip: '127.0.0.1',
        broadcast: '127.255.255.255', subnet: '255.0.0.0', hw_address: '00:00:00:00:00:00',
        version: '0.10.9', build: 'mock', up_since: startedAt, quit_enabled: false,
      });
    }
    if (path === '/json/system_stats') {
      if (process.env.MOCK_NO_HOST) return send(res, { error: 'not found' }, 404);
      const bad = !!process.env.MOCK_UNDERVOLT;
      return send(res, {
        platform: 'raspberry-pi', model: 'Raspberry Pi 3 Model B Plus Rev 1.3',
        cpu_temp_c: bad ? 82.4 : 52.1, cpu_freq_mhz: 1400, cpu_max_freq_mhz: 1400,
        undervoltage_alarm: bad, load: [0.52, 0.4, 0.31],
        mem_total_kb: 942116, mem_available_kb: 612340, uptime_s: 93784,
        firmware: { age_s: 2, volts: { core: 1.2, sdram_c: 1.2, sdram_i: 1.2, sdram_p: 1.225 },
          throttled: bad ? 0x50005 : 0, arm_clock_hz: 1400000000 },
      });
    }
    if (path.startsWith('/json/rdm/') || path === '/rdm/run_discovery') {
      const u = Number(q.get('id'));
      const d = rdmFind(u, q.get('uid') ?? '');
      await rdmSleep(path === '/rdm/run_discovery' && q.get('incremental') !== 'true' ? 1500 : 250);
      if (path === '/rdm/run_discovery' || path === '/json/rdm/uids') return send(res, rdmUidList(u));
      if (!d) return send(res, { error: 'RDM timeout' });
      if (path === '/json/rdm/uid_info') {
        return send(res, { error: '', address: d.address, footprint: d.modes[d.personality - 1][1],
          personality: d.personality, personality_count: d.modes.length });
      }
      if (path === '/json/rdm/uid_identify_device') return send(res, { error: '', identify_device: rdmIdentify.has(d.uid) });
      if (path === '/json/rdm/uid_personalities') {
        return send(res, { error: '', selected: d.personality,
          personalities: d.modes.map(([name, footprint], i) => ({ name, index: i + 1, footprint })) });
      }
      if (path === '/json/rdm/section_info' && q.get('section') === 'device_label') {
        return send(res, { refresh: false, error: '', items: [{ description: 'Device Label', type: 'string', value: d.label, id: 'label' }] });
      }
      if (path === '/json/rdm/set_section_info') {
        const section = q.get('section');
        if (section === 'dmx_address') {
          const a = Number(q.get('address'));
          const fp = d.modes[d.personality - 1][1];
          if (!(a >= 1 && a + fp - 1 <= 512)) return send(res, { error: 'NACK: data out of range' });
          if (process.env.MOCK_RDM_FAIL && d.uid.endsWith('0002')) return send(res, { error: 'RDM timeout' });
          d.address = a;
          return send(res, { error: '' });
        }
        if (section === 'personality') {
          const p = Number(q.get('int'));
          if (!(p >= 1 && p <= d.modes.length)) return send(res, { error: 'NACK: data out of range' });
          d.personality = p;
          return send(res, { error: '' });
        }
        if (section === 'identify_device') {
          if (q.get('bool') === '1') rdmIdentify.add(d.uid); else rdmIdentify.delete(d.uid);
          return send(res, { error: '' });
        }
        if (section === 'device_label') { d.label = q.get('label') ?? ''; return send(res, { error: '' }); }
      }
      return send(res, { error: 'unsupported' });
    }
    if (path === '/json/universe_plugin_list') {
      return send(res, {
        plugins: plugins.map(({ id, name, active, enabled }) => ({ id, name, active, enabled })),
        universes: universeIds().map((id) => ({
          id, name: meta.get(id)?.name ?? '', input_ports: portsOn(id, false).length,
          output_ports: portsOn(id, true).length, rdm_devices: 0,
        })),
      });
    }
    if (path === '/json/universe_info') {
      const id = Number(q.get('id'));
      return send(res, {
        id, name: meta.get(id)?.name ?? '', merge_mode: meta.get(id)?.merge ?? 'HTP',
        output_ports: portsOn(id, true).map(toPort), input_ports: portsOn(id, false).map(toPort),
      });
    }
    if (path === '/json/get_ports') {
      const only = q.get('id') === null ? null : Number(q.get('id'));
      let free = [...ports.values()].filter((p) => p.universe === null || p.universe === only);
      if (STOCK) {
        // Stock olad stops at the first free port per device and direction.
        const seen = new Set();
        free = free.filter((p) => {
          const k = p.id.split('-').slice(0, 2).join('-');
          return seen.has(k) ? false : (seen.add(k), true);
        });
      }
      return send(res, free.map(toPort));
    }
    if (path === '/json/patch_overview' && !STOCK) {
      const devices = new Map();
      for (const p of ports.values()) {
        const alias = Number(p.id.split('-')[0]);
        if (!devices.has(alias)) devices.set(alias, { alias, name: p.device, plugin_id: 0, ports: [] });
        devices.get(alias).ports.push({ ...toPort(p), universe: p.universe });
      }
      return send(res, {
        devices: [...devices.values()],
        universes: universeIds().map((id) => ({ id, name: meta.get(id)?.name ?? '', merge_mode: meta.get(id)?.merge ?? 'LTP' })),
      });
    }
    // UI document store, like olad's /json/ui_store and /ui_store (absent on stock olad).
    if (!STOCK && path === '/json/ui_store') {
      const k = q.get('k') ?? '';
      if (!/^[a-z0-9_-]{1,32}$/.test(k)) return send(res, { ok: false, error: 'Invalid key' }, 400);
      const doc = uiDocs.get(k);
      return send(res, { rev: doc?.rev ?? 0, data: doc ? JSON.parse(doc.data) : null });
    }
    if (!STOCK && path === '/ui_store' && req.method === 'POST') {
      const f = await readForm(req);
      const k = f.get('k') ?? '';
      const rev = Number(f.get('rev'));
      const d = f.get('d') ?? '';
      if (!Number.isInteger(rev) || rev < 0) return send(res, { ok: false, error: 'rev must be a number' }, 400);
      if (!/^[a-z0-9_-]{1,32}$/.test(k)) return send(res, { ok: false, error: 'Invalid key' }, 400);
      if (d.length > 1024 * 1024) return send(res, { ok: false, error: 'Document too large' }, 413);
      try {
        JSON.parse(d);
      } catch {
        return send(res, { ok: false, error: 'd is not valid JSON' }, 400);
      }
      const cur = uiDocs.get(k) ?? { rev: 0, data: 'null' };
      if (cur.rev !== rev) {
        return send(res, { ok: false, conflict: true, rev: cur.rev, data: JSON.parse(cur.data) }, 409);
      }
      uiDocs.set(k, { rev: rev + 1, data: d });
      return send(res, { ok: true, rev: rev + 1 });
    }
    if (path === '/json/plugin_info') {
      const p = plugins.find((x) => x.id === Number(q.get('id')));
      if (!p) return send(res, 'no such plugin', 404);
      const conflicts = p.id === 5 ? [{ id: 6, name: 'Enttec Open DMX', active: false }] : [];
      return send(res, { description: p.description, name: p.name, enabled: p.enabled, active: p.active, preferences_source: `ola-${p.name.toLowerCase().replace(/\W+/g, '')}.conf`, conflicts_with: conflicts });
    }
    if (path === '/set_plugin_state' && req.method === 'POST') {
      const f = await readForm(req);
      const p = plugins.find((x) => x.id === Number(f.get('plugin_id')));
      if (!p) return send(res, 'no such plugin', 404);
      p.enabled = f.get('state') === 'enable';
      p.active = p.enabled && p.id !== 4;
      return send(res, 'ok');
    }
    if (path === '/reload') {
      setTimeout(() => {}, 0);
      return send(res, 'ok');
    }
    if (path === '/new_universe' && req.method === 'POST') {
      const f = await readForm(req);
      const id = Number(f.get('id'));
      meta.set(id, { name: f.get('name') || '', merge: 'LTP' }); // olad's default
      applyModify(id, new URLSearchParams({ add_ports: f.get('add_ports') ?? '' }));
      // Like olad: a universe only exists while it has a port, so with none patched this fails.
      const ok = portsOn(id, true).length + portsOn(id, false).length > 0;
      if (!ok) meta.delete(id);
      return send(res, { ok, universe: id, message: ok ? '' : 'Failed to patch any ports' });
    }
    if (path === '/modify_universe' && req.method === 'POST') {
      const f = await readForm(req);
      const id = Number(f.get('id'));
      if (!f.get('name')) return send(res, 'No name supplied', 500);
      const m = meta.get(id) ?? { name: '', merge: 'HTP' };
      m.name = f.get('name');
      if (f.get('merge_mode') === 'HTP' || f.get('merge_mode') === 'LTP') m.merge = f.get('merge_mode');
      meta.set(id, m);
      applyModify(id, f);
      return send(res, 'ok');
    }
    if (path === '/get_dmx') {
      const u = Number(q.get('u'));
      return send(res, { dmx: buf(u), error: '' });
    }
    if (path === '/set_dmx' && req.method === 'POST') {
      const f = await readForm(req);
      const vals = (f.get('d') ?? '').split(',').map(Number);
      if (vals.some(Number.isNaN)) return send(res, 'Invalid DMX string', 500);
      const d = buf(Number(f.get('u')));
      vals.forEach((v, i) => (d[i] = v));
      return send(res, 'ok');
    }
    send(res, 'not found', 404);
  })
  .listen(Number(process.env.MOCK_PORT ?? 9090), () => console.log('mock olad up'));
