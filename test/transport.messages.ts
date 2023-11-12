

const custom_fz = (custom: any) => custom.z = 2


export default {
  print: false,
  pattern: 'sys:transport',
  allow: { missing: true },

  calls: [
    {
      pattern: 'add:hook',
      params: { hook: 'custom', action: custom_fz },
      out: { ok: true, hook: 'custom', count: 1 }
    },
    {
      print: false,
      pattern: 'get:hooks',
      params: { hook: 'custom' },
      out: { ok: true, hook: 'custom', count: 1, hooks: [custom_fz] }
    },
    {
      pattern: 'add:hook',
      params: { hook: 'custom', action: { y: 3 } },
      out: { ok: true, hook: 'custom', count: 2 }
    },
    {
      print: false,
      pattern: 'get:hooks',
      params: { hook: 'custom' },
      out: { ok: true, hook: 'custom', count: 2, hooks: [custom_fz, { y: 3 }] }
    },
  ]
}
