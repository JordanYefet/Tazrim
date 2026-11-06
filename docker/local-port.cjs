/**
 * The "this machine only" port (ENG-100), preloaded into the server with
 * `node --require`.
 *
 * Behind Docker's port publish no request reaches the server from 127.0.0.1:
 * on Docker Desktop a browser on the Mac and a phone on the Wi-Fi both arrive
 * from Docker's gateway, so lib/local-request.ts can't tell them apart and
 * refuses both (bank sync, delete-all). This opens a second port inside the
 * container, TAZRIM_LOCAL_PORT, that pipes each connection to the server from
 * 127.0.0.1. Everything that arrives on it is seen as local, so it must only be
 * published on the host's loopback, never on all interfaces:
 *
 *   ports:
 *     - "127.0.0.1:3001:3001"
 *
 * It is a plain TCP pipe: headers, streaming and the Host header pass through
 * untouched, and the server fills in x-forwarded-for from the socket as usual.
 * Until there is a login and HTTPS (ENG-89) this is the only way to sync from
 * a container.
 */
const net = require('node:net')

/** Listens on `port` and pipes every connection to 127.0.0.1:`target`. */
function startLocalPort(port, target, host = '0.0.0.0') {
  const server = net.createServer(client => {
    const upstream = net.connect(target, '127.0.0.1')
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
    client.pipe(upstream).pipe(client)
  })
  server.on('error', e => console.error(`tazrim: local port ${port} failed: ${e.message}`))
  server.listen(port, host)
  return server
}

module.exports = { startLocalPort }

const port = Number(process.env.TAZRIM_LOCAL_PORT)
if (require.main !== module && Number.isInteger(port) && port > 0 && !process.env.VITEST) {
  startLocalPort(port, Number(process.env.PORT || 3000))
}
