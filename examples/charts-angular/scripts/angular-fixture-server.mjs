import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

/** Serve isolated production apps, including the CLI's CSR HTML and source maps. */
export async function serveAngularFixtures(root) {
  const server = createServer(async (request, response) => {
    const path = resolve(
      root,
      '.' + new URL(request.url, 'http://localhost').pathname,
    )
    if (!path.startsWith(root + sep)) return response.writeHead(403).end()
    try {
      const file = path.endsWith('/index.html')
        ? path.replace(/index\.html$/, 'index.csr.html')
        : path
      const bytes = await readFile(file)
      response.setHeader(
        'Content-Type',
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.map': 'application/json',
        }[extname(file)] ?? 'application/octet-stream',
      )
      response.end(
        extname(file) === '.html'
          ? bytes.toString().replace('<base href="/">', '<base href="./">')
          : bytes,
      )
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  }
}
