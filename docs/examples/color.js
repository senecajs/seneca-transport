/* A small plugin used by the examples: color names to hex values. */
'use strict'

module.exports = function color(options) {
  const colors = { red: '#FF0000', green: '#00FF00', blue: '#0000FF', ...options.colors }

  this.add('role:color,cmd:hex', function (msg, reply) {
    const hex = colors[msg.name]
    if (null == hex) {
      return reply(this.error('unknown_color', { name: msg.name }))
    }
    reply({ name: msg.name, hex })
  })

  this.add('role:color,cmd:list', function (msg, reply) {
    reply({ names: Object.keys(colors) })
  })
}

// Error codes and message templates for this.error and this.fail.
module.exports.errors = {
  unknown_color: 'Unknown color: <%=name%>.',
}
