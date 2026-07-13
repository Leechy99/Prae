import { once } from 'events';
import { AddressInfo, createConnection, Socket } from 'net';
import { StartedServer, startServer } from '../../../src/api/server';

describe('server lifecycle', () => {
  let started: StartedServer | undefined;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach(socket => socket.destroy());
    await started?.close();
  });

  test('closes a listening server', async () => {
    started = await startServer(0);

    expect(started.server.listening).toBe(true);

    await started.close();

    expect(started.server.listening).toBe(false);
  });

  test('allows close to be called twice', async () => {
    started = await startServer(0);

    await expect(started.close()).resolves.toBeUndefined();
    await expect(started.close()).resolves.toBeUndefined();
  });

  test('shares an in-flight close across concurrent calls', async () => {
    started = await startServer(0);
    const address = started.server.address() as AddressInfo;
    const socket = createConnection(address.port);
    sockets.push(socket);
    await once(socket, 'connect');
    socket.write('GET /health HTTP/1.1\r\nHost: localhost\r\n');

    const firstClose = started.close();
    const secondClose = started.close();

    expect(secondClose).toBe(firstClose);

    socket.end();
    await expect(Promise.all([firstClose, secondClose])).resolves.toEqual([undefined, undefined]);
  });
});
