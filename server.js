/**
 * Production entry point.
 *
 * adapter-node 6 derives the request origin from headers and assumes https
 * when no protocol header is present, so a plain-HTTP deployment (e.g. a
 * local Docker container) rejects every form POST as cross-site. This wrapper
 * restores the familiar runtime `ORIGIN` variable and otherwise trusts
 * standard X-Forwarded-* headers from a reverse proxy, defaulting to http.
 */
import http from 'node:http';

const PROTO = 'x-intavue-proto';
const HOST = 'x-intavue-host';
process.env.PROTOCOL_HEADER = PROTO;
process.env.HOST_HEADER = HOST;

const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN) : null;
const { handler } = await import('./build/handler.js');

const first = (v) => (Array.isArray(v) ? v[0] : v)?.split(',')[0].trim();

const server = http.createServer((req, res) => {
	req.headers[PROTO] = origin
		? origin.protocol.slice(0, -1)
		: first(req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
	req.headers[HOST] = origin
		? origin.host
		: first(req.headers['x-forwarded-host']) || req.headers.host;
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	});
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => console.log(`intavue listening on http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
