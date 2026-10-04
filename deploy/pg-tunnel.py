#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pg-tunnel.py —— 让"只能走 HTTP 代理"的环境也能连上远端 Postgres(5432)。

原理：
  在本机监听一个端口（默认 15432），每来一个连接，就用 HTTP CONNECT
  通过你本机的代理（Clash，默认 127.0.0.1:7890）向远端 <host>:5432 开隧道，
  然后把两条 TCP 流原样对接。psql 只会看到"本地数据库"，实际数据直通 Supabase。

用法：
  python3 deploy/pg-tunnel.py db.xxxx.supabase.co                  # 本地监听 0.0.0.0:15432
  python3 deploy/pg-tunnel.py db.xxxx.supabase.co 5432 15432
  python3 deploy/pg-tunnel.py db.xxxx.supabase.co 5432 15432 127.0.0.1:7890

另开一个终端用 psql 连：
  docker run -it --rm postgres:17 psql "postgresql://postgres:密码@host.docker.internal:15432/postgres"

说明：
  - 默认监听 0.0.0.0，是为了让 Docker 容器通过 host.docker.internal 也能连进来。
  - 本机防火墙/局域网内可见该端口，用完 Ctrl+C 关闭即可。
"""
import socket
import sys
import threading

TARGET_HOST = sys.argv[1] if len(sys.argv) > 1 else None
TARGET_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5432
LISTEN_PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 15432
PROXY = sys.argv[4] if len(sys.argv) > 4 else "127.0.0.1:7890"
PROXY_HOST, PROXY_PORT = PROXY.split(":")
PROXY_PORT = int(PROXY_PORT)

if not TARGET_HOST:
    print("用法: python3 deploy/pg-tunnel.py <远端Host> [远端端口=5432] [本地端口=15432] [代理=127.0.0.1:7890]")
    sys.exit(1)


def open_via_proxy():
    """通过 HTTP 代理向远端开一条 CONNECT 隧道，返回已建立的 socket。"""
    s = socket.create_connection((PROXY_HOST, PROXY_PORT), timeout=15)
    req = (
        f"CONNECT {TARGET_HOST}:{TARGET_PORT} HTTP/1.1\r\n"
        f"Host: {TARGET_HOST}:{TARGET_PORT}\r\n"
        f"Proxy-Connection: Keep-Alive\r\n\r\n"
    )
    s.sendall(req.encode())
    s.settimeout(20)
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = s.recv(1024)
        if not chunk:
            raise RuntimeError("代理在建立隧道时关闭了连接")
        buf += chunk
    head = buf.split(b"\r\n", 1)[0].decode(errors="replace")
    if " 200 " not in head:
        s.close()
        raise RuntimeError(f"代理拒绝隧道: {head}")
    s.settimeout(None)
    return s


def pipe(a, b):
    try:
        while True:
            data = a.recv(65536)
            if not data:
                break
            b.sendall(data)
    except OSError:
        pass
    finally:
        for sock in (a, b):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def handle(client, addr):
    try:
        remote = open_via_proxy()
        print(f"[+] 隧道已建立 {addr[0]}:{addr[1]} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[-] 建立隧道失败 {addr}: {exc}", flush=True)
        client.close()
        return
    threading.Thread(target=pipe, args=(client, remote), daemon=True).start()
    threading.Thread(target=pipe, args=(remote, client), daemon=True).start()


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", LISTEN_PORT))
    srv.listen(32)
    print(f"本地 0.0.0.0:{LISTEN_PORT}  ==隧道(经 {PROXY})==>  {TARGET_HOST}:{TARGET_PORT}", flush=True)
    print("按 Ctrl+C 结束。", flush=True)
    try:
        while True:
            client, addr = srv.accept()
            threading.Thread(target=handle, args=(client, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\n已停止。", flush=True)
    finally:
        srv.close()


if __name__ == "__main__":
    main()
