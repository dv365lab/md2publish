// @vitest-environment node
import { createServer as createHttpServer, type Server } from 'node:http'
import { afterEach, expect, test } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'

let occupied: Server | undefined
let vite: ViteDevServer | undefined

afterEach(async () => {
  await vite?.close()
  if (occupied?.listening) {
    await new Promise<void>((resolve, reject) => occupied!.close((error) => error ? reject(error) : resolve()))
  }
})

test('starts on an available port when the requested port is occupied', async () => {
  occupied = createHttpServer((_request, response) => response.end('other service'))
  await new Promise<void>((resolve) => occupied!.listen(0, '127.0.0.1', resolve))
  const address = occupied.address()
  if (!address || typeof address === 'string') throw new Error('No TCP address')

  vite = await createServer({ server: { port: address.port, open: false } })
  await vite.listen()
  const actual = vite.httpServer?.address()
  if (!actual || typeof actual === 'string') throw new Error('Vite did not start')
  expect(actual.port).not.toBe(address.port)
  const response = await fetch(`http://127.0.0.1:${actual.port}/`)
  expect(response.ok).toBe(true)
  expect(await response.text()).toContain('<title>md2publish</title>')
})
